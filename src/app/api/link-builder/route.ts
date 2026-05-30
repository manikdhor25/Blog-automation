// ============================================================
// RankMaster Pro - Internal Link Auto-Builder API
// Scan all posts → find semantic opportunities → bulk inject
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['find_opportunities', 'inject_links', 'preview', 'get_orphans']),
    site_id: z.string().uuid().optional(),
    post_id: z.string().uuid().optional(),
    max_links_per_post: z.number().int().min(1).max(20).default(5).optional(),
    min_relevance: z.number().min(0).max(1).default(0.7).optional(),
    injections: z.array(z.object({
        from_post_id: z.string().uuid(),
        to_post_id: z.string().uuid(),
        anchor_text: z.string(),
        insertion_context: z.string(),
    })).optional(),
});

interface PostSummary { id: string; title: string; slug: string; keyword?: string; content_snippet: string; }

async function findLinkOpportunities(
    sourcePosts: PostSummary[],
    targetPosts: PostSummary[],
    maxPerPost: number
): Promise<Array<{ from_post_id: string; from_title: string; to_post_id: string; to_title: string; to_slug: string; anchor_text: string; insertion_context: string; relevance: number; reason: string }>> {
    if (sourcePosts.length === 0 || targetPosts.length === 0) return [];

    const postList = targetPosts.slice(0, 30).map((p, i) =>
        `${i + 1}. ID:${p.id} | Title:"${p.title}" | Slug:/${p.slug}/ | Keyword:${p.keyword || 'n/a'}`
    ).join('\n');

    const results = [];

    for (const source of sourcePosts.slice(0, 10)) {
        const prompt = `Find natural internal link opportunities for a blog post.

Source post: "${source.title}"
Content excerpt: ${source.content_snippet.substring(0, 800)}

Target posts available to link to:
${postList}

Find ${maxPerPost} best internal link opportunities. Only suggest links that are genuinely relevant and add value.

Return ONLY valid JSON array:
[
  {
    "target_index": 1,
    "anchor_text": "natural anchor text (3-6 words, descriptive, not generic like 'click here')",
    "insertion_context": "quote the exact sentence from source content where this link should be inserted",
    "relevance": 0.85,
    "reason": "why this link is relevant and valuable"
  }
]`;

        const result = await routeAI({ task: 'content_optimization', prompt, systemPrompt: 'Internal linking expert. Natural, relevant anchors only. Return JSON array.', maxTokens: 1000, jsonMode: true });
        if (!result.success || !result.content) continue;

        try {
            const jsonMatch = result.content.match(/\[[\s\S]*\]/);
            const opportunities = JSON.parse(jsonMatch?.[0] || '[]');

            for (const opp of opportunities) {
                const target = targetPosts[opp.target_index - 1];
                if (!target || target.id === source.id) continue;
                results.push({
                    from_post_id: source.id,
                    from_title: source.title,
                    to_post_id: target.id,
                    to_title: target.title,
                    to_slug: target.slug,
                    anchor_text: opp.anchor_text,
                    insertion_context: opp.insertion_context,
                    relevance: opp.relevance || 0.7,
                    reason: opp.reason,
                });
            }
        } catch { /* skip */ }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'find_opportunities') {
        const { site_id, post_id, max_links_per_post = 5 } = parsed.data;

        let postsQuery = auth.supabase.from('posts').select('id, title, slug, content_markdown, content_html, keywords(keyword)').eq('user_id', auth.user.id).eq('status', 'published');
        if (site_id) postsQuery = postsQuery.eq('site_id', site_id);
        if (post_id) postsQuery = postsQuery.eq('id', post_id);
        const { data: posts } = await postsQuery.limit(50);

        const allPostsQuery = auth.supabase.from('posts').select('id, title, slug, keywords(keyword)').eq('user_id', auth.user.id).eq('status', 'published');
        if (site_id) allPostsQuery.eq('site_id', site_id);
        const { data: allPosts } = await allPostsQuery.limit(100);

        const sources: PostSummary[] = (posts || []).map(p => ({
            id: p.id, title: p.title, slug: p.slug,
            keyword: (p as unknown as { keywords?: { keyword: string } }).keywords?.keyword,
            content_snippet: (p.content_markdown || p.content_html?.replace(/<[^>]+>/g, ' ') || '').substring(0, 1000),
        }));

        const targets: PostSummary[] = (allPosts || []).map(p => ({
            id: p.id, title: p.title, slug: p.slug,
            keyword: (p as unknown as { keywords?: { keyword: string } }).keywords?.keyword,
            content_snippet: '',
        }));

        const opportunities = await findLinkOpportunities(sources, targets, max_links_per_post);

        // Save opportunities
        if (opportunities.length > 0) {
            await auth.supabase.from('link_opportunities').insert(
                opportunities.map(o => ({
                    user_id: auth.user.id,
                    site_id: site_id || null,
                    from_post_id: o.from_post_id,
                    to_post_id: o.to_post_id,
                    anchor_text: o.anchor_text,
                    insertion_context: o.insertion_context,
                    relevance: o.relevance,
                    reason: o.reason,
                    status: 'pending',
                }))
            );
        }

        return NextResponse.json({ opportunities, count: opportunities.length });
    }

    if (action === 'inject_links') {
        const { injections } = parsed.data;
        if (!injections?.length) return NextResponse.json({ error: 'injections required' }, { status: 400 });

        const results = [];
        for (const inj of injections) {
            const { data: post } = await auth.supabase.from('posts').select('id, content_html, content_markdown').eq('id', inj.from_post_id).eq('user_id', auth.user.id).single();
            if (!post) continue;

            // Find insertion context in content and inject link
            const linkHtml = `<a href="/${inj.to_post_id}/" title="${inj.anchor_text}">${inj.anchor_text}</a>`;
            const contextTrimmed = inj.insertion_context.trim().substring(0, 100);

            // Look for context in HTML
            let updatedHtml = post.content_html || '';
            if (contextTrimmed && updatedHtml.includes(contextTrimmed)) {
                // Replace first occurrence of anchor text within context
                updatedHtml = updatedHtml.replace(inj.anchor_text, linkHtml);
            }

            if (updatedHtml !== post.content_html) {
                await auth.supabase.from('posts').update({ content_html: updatedHtml, updated_at: new Date().toISOString() }).eq('id', inj.from_post_id);
                // Update link opportunity status
                await auth.supabase.from('link_opportunities').update({ status: 'injected' }).eq('from_post_id', inj.from_post_id).eq('to_post_id', inj.to_post_id).eq('user_id', auth.user.id);
                results.push({ post_id: inj.from_post_id, success: true });
            } else {
                results.push({ post_id: inj.from_post_id, success: false, reason: 'Context not found in content — inject manually' });
            }
        }

        const succeeded = results.filter(r => r.success).length;
        return NextResponse.json({ injected: succeeded, failed: results.length - succeeded, results });
    }

    if (action === 'get_orphans') {
        const { site_id } = parsed.data;
        // Posts with no inbound internal links
        let query = auth.supabase.from('posts').select('id, title, slug, overall_score').eq('user_id', auth.user.id).eq('status', 'published');
        if (site_id) query = query.eq('site_id', site_id);
        const { data: posts } = await query;

        const { data: linkedPosts } = await auth.supabase.from('internal_links').select('to_post_id').eq('user_id', auth.user.id);
        const linkedIds = new Set((linkedPosts || []).map((l: { to_post_id: string }) => l.to_post_id));

        const orphans = (posts || []).filter(p => !linkedIds.has(p.id));
        return NextResponse.json({ orphans, count: orphans.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const status = searchParams.get('status') || 'pending';

    let query = auth.supabase.from('link_opportunities').select('*').eq('user_id', auth.user.id).order('relevance', { ascending: false });
    if (siteId) query = query.eq('site_id', siteId);
    if (status !== 'all') query = query.eq('status', status);

    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ opportunities: data || [] });
}
