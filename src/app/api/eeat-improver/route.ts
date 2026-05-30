// ============================================================
// RankMaster Pro - E-E-A-T Score Improver API
// Actionable per-post E-E-A-T checklist + AI fixes
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['audit', 'generate_bio', 'generate_credentials', 'list']),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    author_name: z.string().max(200).optional(),
    author_credentials: z.string().max(500).optional(),
    niche: z.string().max(200).optional(),
});

interface EEATCheckItem {
    signal: string;
    category: 'experience' | 'expertise' | 'authoritativeness' | 'trustworthiness';
    present: boolean;
    impact: 'critical' | 'high' | 'medium' | 'low';
    fix: string;
    code_snippet?: string;
}

function auditEEAT(content: string, title: string, metaDesc: string, hasAuthor: boolean): EEATCheckItem[] {
    const contentLower = content.toLowerCase();
    const checks: EEATCheckItem[] = [
        // Experience
        { signal: 'First-person experience phrases', category: 'experience', present: /\b(i tested|i tried|i found|in my experience|i personally|i used|my experience|i recommend|i bought)\b/i.test(content), impact: 'high', fix: 'Add first-person experience: "I tested this product for 3 weeks and found..."' },
        { signal: 'Specific dates or timeframes', category: 'experience', present: /\b(in \d{4}|last year|this year|recently|for \d+ (days|weeks|months|years))\b/i.test(content), impact: 'medium', fix: 'Add specific timeframes: "I have used this for 6 months" or "As of March 2025"' },
        { signal: 'Personal photos or original images mentioned', category: 'experience', present: /\b(photo|image|screenshot|picture|my own)\b/i.test(content), impact: 'medium', fix: 'Add original photos/screenshots. Use [Image: your own photo here]' },

        // Expertise
        { signal: 'Author bio / byline present', category: 'expertise', present: hasAuthor, impact: 'critical', fix: 'Add author profile with name, credentials, and photo to every post' },
        { signal: 'Expert credentials mentioned', category: 'expertise', present: /\b(certified|licensed|degree|phd|md|mba|years of experience|expert|specialist|professional)\b/i.test(content), impact: 'high', fix: 'Add author credentials in content: "As a certified nutritionist with 10 years of experience..."' },
        { signal: 'External expert citations', category: 'expertise', present: /\b(according to|study|research|dr\.|professor|expert says|published)\b/i.test(content), impact: 'high', fix: 'Cite external experts: "According to Dr. Smith, a Harvard nutritionist..."' },
        { signal: 'Data or statistics with sources', category: 'expertise', present: /\b\d+(%|percent)\b/.test(content) && /\b(source|study|research|according|found that)\b/i.test(content), impact: 'high', fix: 'Add sourced statistics: "Studies show 73% of users prefer... [Source: Nielsen 2024]"' },

        // Authoritativeness
        { signal: 'Last updated date visible', category: 'authoritativeness', present: /\b(updated|last updated|published|date)\b/i.test(content), impact: 'high', fix: 'Add visible "Last Updated: March 2025" near the top of the post' },
        { signal: 'Outbound links to authoritative sources', category: 'authoritativeness', present: /(href="|https?:\/\/(?!your-domain))/.test(content), impact: 'high', fix: 'Link to authoritative sources: government sites (.gov), universities (.edu), major publications' },
        { signal: 'Author social proof links', category: 'authoritativeness', present: /\b(linkedin|twitter|youtube|published|featured in)\b/i.test(content), impact: 'medium', fix: 'Add links to author social profiles or publications in author bio' },
        { signal: 'Review or methodology section', category: 'authoritativeness', present: /\b(how we|our methodology|our process|how i|we reviewed|we tested)\b/i.test(content), impact: 'medium', fix: 'Add "How We Review" section explaining your testing process' },

        // Trustworthiness
        { signal: 'Affiliate disclosure present', category: 'trustworthiness', present: /\b(affiliate|commission|earn|disclosure|sponsored|paid)\b/i.test(content), impact: 'critical', fix: 'Add FTC-compliant disclosure at top: "This post contains affiliate links. We may earn a commission..."' },
        { signal: 'Pros AND cons balanced', category: 'trustworthiness', present: /\b(pros|benefits|advantages)\b/i.test(content) && /\b(cons|drawbacks|disadvantages|limitations)\b/i.test(content), impact: 'high', fix: 'Add honest Cons section. One-sided reviews tank trust and conversions.' },
        { signal: 'Author headshot / photo', category: 'trustworthiness', present: /\b(headshot|author photo|photo of)\b/i.test(content), impact: 'medium', fix: 'Add real author headshot to author bio. Stock photos reduce trust.' },
        { signal: 'Contact/About page linked', category: 'trustworthiness', present: /\b(about|contact|reach us|email us)\b/i.test(content), impact: 'low', fix: 'Link to About page and Contact page in post or author bio' },
        { signal: 'Privacy policy / Terms mentioned', category: 'trustworthiness', present: /\b(privacy|terms|cookie)\b/i.test(content), impact: 'low', fix: 'Link to Privacy Policy in footer (especially important for EU readers)' },
    ];
    return checks;
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'audit') {
        const { post_id } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('id, title, content_html, content_markdown, meta_description, eeat_score').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const { data: author } = await auth.supabase.from('authors').select('id, name, credentials').eq('post_id', post_id).maybeSingle();
        const hasAuthor = !!author?.name;

        const content = post.content_markdown || post.content_html?.replace(/<[^>]+>/g, ' ') || '';
        const checks = auditEEAT(content, post.title, post.meta_description, hasAuthor);

        const passing = checks.filter(c => c.present).length;
        const total = checks.length;
        const score = Math.round((passing / total) * 100);

        const criticalMissing = checks.filter(c => !c.present && c.impact === 'critical');
        const highMissing = checks.filter(c => !c.present && c.impact === 'high');

        // Save audit result
        await auth.supabase.from('eeat_audits').upsert({
            user_id: auth.user.id,
            post_id,
            score,
            checks_passed: passing,
            checks_total: total,
            checks_data: checks,
            audited_at: new Date().toISOString(),
        }, { onConflict: 'user_id,post_id' });

        return NextResponse.json({
            score,
            passing,
            total,
            grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D',
            checks,
            critical_fixes: criticalMissing.map(c => c.fix),
            high_priority_fixes: highMissing.map(c => c.fix),
            by_category: {
                experience: { passing: checks.filter(c => c.category === 'experience' && c.present).length, total: checks.filter(c => c.category === 'experience').length },
                expertise: { passing: checks.filter(c => c.category === 'expertise' && c.present).length, total: checks.filter(c => c.category === 'expertise').length },
                authoritativeness: { passing: checks.filter(c => c.category === 'authoritativeness' && c.present).length, total: checks.filter(c => c.category === 'authoritativeness').length },
                trustworthiness: { passing: checks.filter(c => c.category === 'trustworthiness' && c.present).length, total: checks.filter(c => c.category === 'trustworthiness').length },
            },
        });
    }

    if (action === 'generate_bio') {
        const { author_name, author_credentials, niche } = parsed.data;
        if (!author_name) return NextResponse.json({ error: 'author_name required' }, { status: 400 });

        const prompt = `Write an E-E-A-T optimized author bio for Google search quality guidelines.

Author: ${author_name}
Credentials: ${author_credentials || 'not specified'}
Niche: ${niche || 'general'}

Return ONLY valid JSON:
{
  "short_bio": "2-3 sentence bio for author byline (60-80 words, shows real expertise and experience)",
  "long_bio": "4-5 sentence bio for author page (150-200 words, specific credentials, publications, experience)",
  "schema_markup": {"@context": "https://schema.org", "@type": "Person", "name": "...", "description": "..."},
  "trust_signals": ["signal 1 to add", "signal 2"],
  "linkedin_headline": "LinkedIn-style headline (120 chars max)"
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'E-E-A-T expert. Write authentic, trust-building author bios. Return only JSON.', maxTokens: 800, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            return NextResponse.json({ bio: JSON.parse(jsonMatch?.[0] || result.content), provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const siteId = new URL(request.url).searchParams.get('site_id');
    let query = auth.supabase.from('eeat_audits').select('post_id, score, grade: score, checks_passed, checks_total, audited_at').eq('user_id', auth.user.id).order('audited_at', { ascending: false });
    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ audits: data || [] });
}
