// ============================================================
// RankMaster Pro - Broken Outbound Link Fixer API
// Detect broken outbound links + AI suggests replacements
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/utils/safe-url';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['scan_post', 'scan_site', 'suggest_replacement', 'apply_fix', 'list_broken']),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    broken_url: z.string().url().optional(),
    context: z.string().max(500).optional(),
    replacement_url: z.string().url().optional(),
    link_id: z.string().optional(),
});

function extractOutboundLinks(html: string, siteUrl: string): Array<{ url: string; anchor: string; context: string }> {
    const links: Array<{ url: string; anchor: string; context: string }> = [];
    const pattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
    const siteHost = siteUrl ? new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`).hostname : '';

    for (const match of html.matchAll(pattern)) {
        const url = match[1];
        const anchor = match[2].replace(/<[^>]+>/g, '').trim();
        try {
            const linkHost = new URL(url).hostname;
            if (linkHost === siteHost) continue; // skip internal
        } catch { continue; }
        const startIdx = Math.max(0, match.index! - 100);
        const context = html.slice(startIdx, match.index! + match[0].length + 100).replace(/<[^>]+>/g, ' ').trim();
        links.push({ url, anchor, context: context.substring(0, 200) });
    }
    return links;
}

async function checkLinkStatus(url: string): Promise<{ status: number | null; ok: boolean; final_url: string | null; error: string | null }> {
    try {
        const res = await safeFetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankMaster/1.0)' } });
        return { status: res.status, ok: res.status < 400, final_url: res.url || url, error: null };
    } catch (err) {
        return { status: null, ok: false, final_url: null, error: err instanceof Error ? err.message : 'Failed' };
    }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'scan_post') {
        const { post_id } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('id, title, content_html, site_id').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const { data: site } = post.site_id ? await auth.supabase.from('sites').select('url').eq('id', post.site_id).single() : { data: null };
        const links = extractOutboundLinks(post.content_html || '', site?.url || '');

        // Check up to 20 links
        const results = [];
        for (const link of links.slice(0, 20)) {
            const check = await checkLinkStatus(link.url);
            results.push({ ...link, ...check, needs_fix: !check.ok });
        }

        const broken = results.filter(r => r.needs_fix);
        // Save broken links
        if (broken.length > 0) {
            await auth.supabase.from('broken_outbound_links').upsert(
                broken.map(b => ({
                    user_id: auth.user.id,
                    post_id,
                    url: b.url,
                    anchor: b.anchor,
                    context: b.context,
                    http_status: b.status,
                    error: b.error,
                    status: 'broken',
                    checked_at: new Date().toISOString(),
                })),
                { onConflict: 'user_id,post_id,url' }
            );
        }

        return NextResponse.json({ post_title: post.title, total_links: links.length, broken_count: broken.length, results });
    }

    if (action === 'suggest_replacement') {
        const { broken_url, context } = parsed.data;
        if (!broken_url) return NextResponse.json({ error: 'broken_url required' }, { status: 400 });

        const prompt = `A webpage link is broken (404 or not responding). Suggest 3 high-quality replacement sources.

Broken URL: ${broken_url}
Context where it was used: ${context || 'cited as a source in a blog post'}

Return ONLY valid JSON:
{
  "original_topic": "what this link was about",
  "replacements": [
    {
      "url": "https://authoritative-source.com/relevant-page",
      "title": "Page title",
      "why": "why this is a good replacement",
      "authority": "government/academic/major_publication/industry_leader"
    }
  ],
  "search_query": "Google search query to find a replacement manually"
}`;

        const result = await routeAI({ task: 'content_optimization', prompt, systemPrompt: 'SEO expert. Suggest authoritative replacement links. Return only JSON.', maxTokens: 600, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Suggestion failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            return NextResponse.json({ suggestions: JSON.parse(m?.[0] || result.content), provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'apply_fix') {
        const { post_id, broken_url, replacement_url } = parsed.data;
        if (!post_id || !broken_url || !replacement_url) return NextResponse.json({ error: 'post_id, broken_url, replacement_url required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('content_html').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const updatedHtml = (post.content_html || '').replaceAll(broken_url, replacement_url);
        const replaced = (post.content_html || '').split(broken_url).length - 1;

        if (replaced === 0) return NextResponse.json({ error: 'URL not found in post content' }, { status: 400 });

        await auth.supabase.from('posts').update({ content_html: updatedHtml, updated_at: new Date().toISOString() }).eq('id', post_id);
        await auth.supabase.from('broken_outbound_links').update({ status: 'fixed', fixed_url: replacement_url, fixed_at: new Date().toISOString() }).eq('post_id', post_id).eq('url', broken_url).eq('user_id', auth.user.id);

        return NextResponse.json({ success: true, replacements: replaced });
    }

    if (action === 'scan_site') {
        const { site_id } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const { data: posts } = await auth.supabase.from('posts').select('id, title').eq('site_id', site_id).eq('user_id', auth.user.id).eq('status', 'published').limit(20);
        return NextResponse.json({ message: `Queue scan for ${(posts || []).length} posts. Use scan_post action per post_id.`, posts: (posts || []).map(p => ({ id: p.id, title: p.title })) });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const postId = new URL(request.url).searchParams.get('post_id');
    let query = auth.supabase.from('broken_outbound_links').select('*').eq('user_id', auth.user.id).eq('status', 'broken').order('checked_at', { ascending: false });
    if (postId) query = query.eq('post_id', postId);
    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ broken_links: data || [] });
}
