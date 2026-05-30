import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ScanSchema = z.object({
    action: z.literal('scan'),
    site_id: z.string().uuid(),
    post_id: z.string().uuid().optional(),
    max_links_per_post: z.number().int().min(1).max(10).default(3),
    auto_inject: z.boolean().default(false),
});

const InjectSchema = z.object({
    action: z.literal('inject'),
    opportunity_id: z.string().uuid(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    const status = url.searchParams.get('status') || 'pending';

    let q = supabase.from('internal_link_opportunities').select('*').eq('user_id', user.id).eq('status', status).order('relevance_score', { ascending: false });
    if (siteId) q = q.eq('site_id', siteId);
    const { data } = await q.limit(100);

    const { count } = await supabase.from('internal_link_opportunities').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending');

    return NextResponse.json({ opportunities: data || [], pending_count: count || 0 });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'scan') {
        const parsed = ScanSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Get posts for site
        let postQuery = supabase.from('posts').select('id, title, primary_keyword, content, slug').eq('site_id', d.site_id);
        if (d.post_id) postQuery = postQuery.eq('id', d.post_id);
        const { data: posts } = await postQuery.limit(30);

        if (!posts?.length) return NextResponse.json({ error: 'No posts found for site' }, { status: 404 });

        const postSummaries = posts.map(p => `ID: ${p.id} | Title: ${p.title} | Keyword: ${p.primary_keyword || 'unknown'} | Slug: /${p.slug || ''}`).join('\n');

        const prompt = `You are an internal linking expert. Analyze these blog posts and find the best internal link opportunities.

Posts in site:
${postSummaries}

Rules:
- Link from posts where the target topic is mentioned or highly relevant
- Each link should feel natural and add value for the reader
- Max ${d.max_links_per_post} new links per post
- Don't suggest linking a post to itself
- Prioritize high-relevance semantic connections

Return JSON array of opportunities:
[{
  "from_post_id": "uuid",
  "to_post_id": "uuid",
  "from_post_title": string,
  "to_post_title": string,
  "anchor_text": "natural anchor text to use",
  "context_hint": "what paragraph/section to place it in",
  "relevance_score": number (0-1),
  "reason": "why this link makes sense"
}]

Return max 30 opportunities sorted by relevance_score descending.`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let opportunities;
        try { opportunities = JSON.parse(text.match(/\[[\s\S]+\]/)?.[0] || '[]'); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        // Save to DB
        const inserted = [];
        for (const opp of opportunities.slice(0, 30)) {
            const { data } = await supabase.from('internal_link_opportunities').insert({
                user_id: user.id, site_id: d.site_id,
                from_post_id: opp.from_post_id, to_post_id: opp.to_post_id,
                from_post_title: opp.from_post_title, to_post_title: opp.to_post_title,
                anchor_text: opp.anchor_text, context_hint: opp.context_hint,
                relevance_score: opp.relevance_score || 0.5, reason: opp.reason,
                status: 'pending',
            }).select().single();
            if (data) inserted.push(data);
        }

        return NextResponse.json({ opportunities: inserted, count: inserted.length, provider });
    }

    if (body.action === 'inject') {
        const parsed = InjectSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { data: opp } = await supabase.from('internal_link_opportunities').select('*').eq('id', parsed.data.opportunity_id).single();
        if (!opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });

        const { data: fromPost } = await supabase.from('posts').select('content, id').eq('id', opp.from_post_id).single();
        if (!fromPost?.content) return NextResponse.json({ error: 'Source post has no content' }, { status: 404 });

        const { data: toPost } = await supabase.from('posts').select('slug').eq('id', opp.to_post_id).single();
        if (!toPost) return NextResponse.json({ error: 'Target post not found' }, { status: 404 });

        // Simple injection: find first mention of anchor_text and wrap with link
        const linkHtml = `<a href="/${toPost.slug}">${opp.anchor_text}</a>`;
        let newContent = fromPost.content;
        const regex = new RegExp(`(?<!<[^>]*)\\b(${opp.anchor_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b(?![^<]*>)`, 'i');
        if (regex.test(newContent)) {
            newContent = newContent.replace(regex, linkHtml);
            await supabase.from('posts').update({ content: newContent }).eq('id', opp.from_post_id);
            await supabase.from('internal_link_opportunities').update({ status: 'injected' }).eq('id', opp.id);
            return NextResponse.json({ injected: true, anchor: opp.anchor_text });
        } else {
            return NextResponse.json({ injected: false, reason: 'Anchor text not found in content' });
        }
    }

    if (body.action === 'dismiss') {
        await supabase.from('internal_link_opportunities').update({ status: 'dismissed' }).eq('id', body.opportunity_id).eq('user_id', user.id);
        return NextResponse.json({ dismissed: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
