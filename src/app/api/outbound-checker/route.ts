import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/utils/safe-url';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const CheckSchema = z.object({
    action: z.literal('check'),
    site_id: z.string().uuid().optional(),
    post_ids: z.array(z.string().uuid()).optional(),
    include_affiliate_only: z.boolean().default(false),
});

async function checkUrl(url: string): Promise<{ status: number; ok: boolean; redirect_url?: string; error?: string }> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await safeFetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankMasterBot/1.0)' },
        });
        clearTimeout(timeout);
        return { status: res.status, ok: res.status < 400, redirect_url: res.url !== url ? res.url : undefined };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'unknown error';
        return { status: 0, ok: false, error: msg.includes('aborted') ? 'timeout' : msg };
    }
}

function extractLinks(content: string): string[] {
    const links: string[] = [];
    const regex = /href=["'](https?:\/\/[^"']+)["']/gi;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const url = match[1];
        if (!links.includes(url)) links.push(url);
    }
    return links;
}

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    let q = supabase.from('outbound_check_results').select('*').eq('user_id', user.id).order('checked_at', { ascending: false });
    if (siteId) q = q.eq('site_id', siteId);
    const { data } = await q.limit(20);
    return NextResponse.json({ results: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'check') {
        const parsed = CheckSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        let postsQ = supabase.from('posts').select('id, title, slug, content, site_id');
        if (d.site_id) postsQ = postsQ.eq('site_id', d.site_id);
        else if (d.post_ids?.length) postsQ = postsQ.in('id', d.post_ids);
        else postsQ = postsQ.eq('user_id', user.id);
        const { data: posts } = await postsQ.limit(20);

        if (!posts?.length) return NextResponse.json({ error: 'No posts found' }, { status: 404 });

        const brokenLinks: Array<{ post_id: string; post_title: string; url: string; status: number; error?: string; is_affiliate: boolean }> = [];
        const checkedUrls = new Map<string, { status: number; ok: boolean; error?: string }>();

        for (const post of posts) {
            if (!post.content) continue;
            const links = extractLinks(post.content);
            const filteredLinks = d.include_affiliate_only
                ? links.filter(l => l.includes('amazon.') || l.includes('amzn.') || l.includes('shareasale') || l.includes('cj.com') || l.includes('impact.') || l.includes('awin.'))
                : links;

            for (const link of filteredLinks.slice(0, 15)) {
                let result = checkedUrls.get(link);
                if (!result) {
                    result = await checkUrl(link);
                    checkedUrls.set(link, result);
                }

                if (!result.ok) {
                    const isAffiliate = link.includes('amazon.') || link.includes('amzn.') || link.includes('shareasale') || link.includes('cj.com') || link.includes('impact.') || link.includes('awin.');
                    brokenLinks.push({ post_id: post.id, post_title: post.title || '', url: link, status: result.status, error: result.error, is_affiliate: isAffiliate });
                }
            }
        }

        // Save results
        const { data: saved } = await supabase.from('outbound_check_results').insert({
            user_id: user.id, site_id: d.site_id || null,
            posts_checked: posts.length, links_checked: checkedUrls.size,
            broken_count: brokenLinks.length, broken_links: brokenLinks,
            checked_at: new Date().toISOString(),
        }).select().single();

        return NextResponse.json({ broken_links: brokenLinks, posts_checked: posts.length, links_checked: checkedUrls.size, saved });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
