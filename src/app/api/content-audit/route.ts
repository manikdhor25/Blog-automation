import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const AuditSchema = z.object({
    action: z.literal('audit'),
    site_id: z.string().uuid(),
    checks: z.array(z.enum(['meta', 'schema', 'internal_links', 'images', 'word_count', 'headings', 'keyword', 'monetization'])).default(['meta', 'schema', 'internal_links', 'images', 'word_count', 'headings', 'keyword']),
    min_word_count: z.number().int().default(600),
});

interface AuditIssue { type: string; severity: 'critical' | 'warning' | 'info'; message: string; fix: string; }
interface PostAudit { id: string; title: string; slug: string; word_count: number; issues: AuditIssue[]; score: number; }

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    let q = supabase.from('content_audit_results').select('*').eq('user_id', user.id).order('audit_date', { ascending: false });
    if (siteId) q = q.eq('site_id', siteId);
    const { data } = await q.limit(1);
    return NextResponse.json({ audit: data?.[0] || null });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'audit') {
        const parsed = AuditSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: posts } = await supabase.from('posts')
            .select('id, title, slug, content, meta_description, primary_keyword, word_count, status, tags')
            .eq('site_id', d.site_id).limit(200);

        if (!posts?.length) return NextResponse.json({ error: 'No posts found' }, { status: 404 });

        const results: PostAudit[] = [];

        for (const post of posts) {
            const issues: AuditIssue[] = [];
            let score = 100;
            const content = post.content || '';
            const wc = post.word_count || content.split(/\s+/).filter(Boolean).length;

            // Meta description check
            if (d.checks.includes('meta')) {
                if (!post.meta_description) {
                    issues.push({ type: 'meta', severity: 'critical', message: 'Missing meta description', fix: 'Add a 120-155 char meta description with focus keyword' });
                    score -= 15;
                } else if (post.meta_description.length < 120) {
                    issues.push({ type: 'meta', severity: 'warning', message: `Meta description too short (${post.meta_description.length} chars)`, fix: 'Expand to 120-155 characters' });
                    score -= 8;
                } else if (post.meta_description.length > 160) {
                    issues.push({ type: 'meta', severity: 'warning', message: `Meta description too long (${post.meta_description.length} chars)`, fix: 'Shorten to under 155 characters' });
                    score -= 5;
                }
            }

            // Word count
            if (d.checks.includes('word_count')) {
                if (wc < d.min_word_count) {
                    issues.push({ type: 'word_count', severity: 'warning', message: `Thin content (${wc} words)`, fix: `Expand to at least ${d.min_word_count} words with more depth` });
                    score -= 10;
                }
            }

            // Headings
            if (d.checks.includes('headings')) {
                const h2Count = (content.match(/<h2|^## /gm) || []).length;
                if (h2Count === 0) {
                    issues.push({ type: 'headings', severity: 'critical', message: 'No H2 headings found', fix: 'Add H2 headings to structure content and help SEO' });
                    score -= 12;
                } else if (h2Count < 3 && wc > 1000) {
                    issues.push({ type: 'headings', severity: 'warning', message: `Only ${h2Count} H2 heading(s) for ${wc} words`, fix: 'Add more H2 subheadings to break up content' });
                    score -= 5;
                }
            }

            // Keyword
            if (d.checks.includes('keyword')) {
                if (!post.primary_keyword) {
                    issues.push({ type: 'keyword', severity: 'warning', message: 'No focus keyword set', fix: 'Set a primary keyword for this post' });
                    score -= 8;
                } else {
                    const kwLower = post.primary_keyword.toLowerCase();
                    const contentLower = content.toLowerCase();
                    const titleLower = (post.title || '').toLowerCase();
                    if (!titleLower.includes(kwLower)) {
                        issues.push({ type: 'keyword', severity: 'warning', message: 'Focus keyword not in title', fix: `Include "${post.primary_keyword}" in the post title` });
                        score -= 8;
                    }
                    const kwCount = (contentLower.match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                    if (kwCount === 0) {
                        issues.push({ type: 'keyword', severity: 'critical', message: 'Focus keyword not found in content', fix: `Mention "${post.primary_keyword}" naturally in the content` });
                        score -= 15;
                    }
                }
            }

            // Internal links
            if (d.checks.includes('internal_links')) {
                const internalLinks = (content.match(/<a\s+(?:[^>]*?\s+)?href=["']\/[^"']*["']/g) || []).length;
                if (internalLinks === 0) {
                    issues.push({ type: 'internal_links', severity: 'warning', message: 'No internal links', fix: 'Add 2-3 internal links to related posts' });
                    score -= 8;
                }
            }

            // Images
            if (d.checks.includes('images')) {
                const imgCount = (content.match(/<img/g) || []).length;
                const altMissing = (content.match(/<img(?![^>]*alt=)[^>]*>/g) || []).length;
                if (imgCount === 0) {
                    issues.push({ type: 'images', severity: 'info', message: 'No images found', fix: 'Add at least one relevant image with alt text' });
                    score -= 5;
                } else if (altMissing > 0) {
                    issues.push({ type: 'images', severity: 'warning', message: `${altMissing} image(s) missing alt text`, fix: 'Add descriptive alt text to all images' });
                    score -= 6;
                }
            }

            // Schema
            if (d.checks.includes('schema')) {
                if (!content.includes('application/ld+json') && !content.includes('@type')) {
                    issues.push({ type: 'schema', severity: 'info', message: 'No schema markup detected', fix: 'Add Article or HowTo schema for rich results' });
                    score -= 5;
                }
            }

            results.push({
                id: post.id, title: post.title || '', slug: post.slug || '',
                word_count: wc, issues, score: Math.max(0, score),
            });
        }

        const summary = {
            total_posts: results.length,
            critical_issues: results.reduce((s, p) => s + p.issues.filter(i => i.severity === 'critical').length, 0),
            warning_issues: results.reduce((s, p) => s + p.issues.filter(i => i.severity === 'warning').length, 0),
            avg_score: Math.round(results.reduce((s, p) => s + p.score, 0) / results.length),
            posts_needing_attention: results.filter(p => p.score < 70).length,
            posts_with_no_meta: results.filter(p => p.issues.some(i => i.type === 'meta' && i.severity === 'critical')).length,
            thin_content_posts: results.filter(p => p.issues.some(i => i.type === 'word_count')).length,
            no_keyword_posts: results.filter(p => p.issues.some(i => i.type === 'keyword' && i.severity === 'critical')).length,
        };

        await supabase.from('content_audit_results').insert({
            user_id: user.id, site_id: d.site_id, post_count: results.length,
            critical_count: summary.critical_issues, warning_count: summary.warning_issues,
            avg_score: summary.avg_score, summary, results,
            audit_date: new Date().toISOString(),
        });

        return NextResponse.json({ summary, results: results.sort((a, b) => a.score - b.score) });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
