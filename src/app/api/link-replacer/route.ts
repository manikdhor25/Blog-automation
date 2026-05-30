// ============================================================
// RankMaster Pro - Affiliate Link Auto-Replacer API
// Scan posts for raw affiliate URLs → convert to /go/ cloaked links
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['scan_post', 'scan_site', 'replace', 'preview']),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    replacements: z.array(z.object({
        post_id: z.string().uuid(),
        original_url: z.string(),
        cloaked_slug: z.string(),
    })).optional(),
});

// Patterns that indicate raw affiliate links
const AFFILIATE_PATTERNS = [
    /amazon\.[a-z.]+\/[^"'\s]*(?:tag|asc_campaign|asc_refurl|linkCode)=[^"'\s]*/gi,
    /amzn\.to\/[a-zA-Z0-9]+/gi,
    /shareasale\.com\/r\.cfm[^"'\s]*/gi,
    /cj\.com\/[^"'\s]*(?:sid|pid|aid)=[^"'\s]*/gi,
    /impact\.com\/[^"'\s]*(?:u|irclickid)=[^"'\s]*/gi,
    /jdoqocy\.com[^"'\s]*/gi,
    /anrdoezrs\.net[^"'\s]*/gi,
    /tkqlhce\.com[^"'\s]*/gi,
];

function extractRawAffiliateLinks(html: string): Array<{ url: string; count: number }> {
    const found = new Map<string, number>();

    for (const pattern of AFFILIATE_PATTERNS) {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
            const url = match[0];
            found.set(url, (found.get(url) || 0) + 1);
        }
    }

    // Also find href= links in <a> tags pointing to known affiliate domains
    const hrefPattern = /href="(https?:\/\/(?:www\.)?(?:amazon\.[a-z.]+|amzn\.to|shareasale\.com|cj\.com|linksynergy\.com|impact\.com)[^"]+)"/gi;
    const hrefMatches = html.matchAll(hrefPattern);
    for (const match of hrefMatches) {
        const url = match[1];
        found.set(url, (found.get(url) || 0) + 1);
    }

    return [...found.entries()].map(([url, count]) => ({ url, count }));
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

        const { data: post } = await auth.supabase.from('posts').select('id, title, content_html').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const rawLinks = extractRawAffiliateLinks(post.content_html || '');

        // Check which are already cloaked
        const { data: cloaked } = await auth.supabase.from('cloaked_links').select('slug, destination_url').eq('user_id', auth.user.id);
        const cloakedMap = new Map((cloaked || []).map((c: { slug: string; destination_url: string }) => [c.destination_url, c.slug]));

        const results = rawLinks.map(link => ({
            url: link.url,
            count: link.count,
            already_cloaked: cloakedMap.has(link.url),
            existing_slug: cloakedMap.get(link.url) || null,
            suggested_slug: link.url.includes('amazon') ? `amz-${Date.now().toString(36)}` : `aff-${Date.now().toString(36)}`,
        }));

        return NextResponse.json({ post_id, post_title: post.title, raw_links: results, total: results.length, uncloaked: results.filter(r => !r.already_cloaked).length });
    }

    if (action === 'scan_site') {
        const { site_id } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const { data: posts } = await auth.supabase.from('posts').select('id, title, content_html').eq('site_id', site_id).eq('user_id', auth.user.id).limit(100);

        const siteResults = [];
        let totalRaw = 0;

        for (const post of posts || []) {
            const rawLinks = extractRawAffiliateLinks(post.content_html || '');
            if (rawLinks.length > 0) {
                siteResults.push({ post_id: post.id, post_title: post.title, raw_count: rawLinks.length, links: rawLinks.slice(0, 5) });
                totalRaw += rawLinks.length;
            }
        }

        return NextResponse.json({ posts_with_raw_links: siteResults.length, total_raw_links: totalRaw, posts: siteResults });
    }

    if (action === 'replace') {
        const { replacements } = parsed.data;
        if (!replacements?.length) return NextResponse.json({ error: 'replacements required' }, { status: 400 });

        const results = [];
        const origin = request.headers.get('origin') || '';

        for (const r of replacements) {
            const { data: post } = await auth.supabase.from('posts').select('id, content_html').eq('id', r.post_id).eq('user_id', auth.user.id).single();
            if (!post) continue;

            // Ensure cloaked link exists
            let { data: cloaked } = await auth.supabase.from('cloaked_links').select('slug').eq('slug', r.cloaked_slug).single();
            if (!cloaked) {
                const { data: newLink } = await auth.supabase.from('cloaked_links').insert({
                    user_id: auth.user.id,
                    slug: r.cloaked_slug,
                    destination_url: r.original_url,
                    label: r.original_url.substring(0, 100),
                    redirect_type: 'permanent',
                    nofollow: true,
                    sponsored: true,
                    is_active: true,
                    clicks: 0,
                }).select('slug').single();
                cloaked = newLink;
            }

            if (!cloaked) continue;

            const cloakedUrl = `${origin}/go/${r.cloaked_slug}`;
            const updatedHtml = (post.content_html || '').replaceAll(r.original_url, cloakedUrl);
            const replacementCount = (post.content_html || '').split(r.original_url).length - 1;

            await auth.supabase.from('posts').update({ content_html: updatedHtml, updated_at: new Date().toISOString() }).eq('id', r.post_id);
            results.push({ post_id: r.post_id, original_url: r.original_url, cloaked_url: cloakedUrl, replacements: replacementCount });
        }

        return NextResponse.json({ replaced: results.length, results });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');

    if (siteId) {
        const res = await fetch(`${request.url.split('?')[0]}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') || '' }, body: JSON.stringify({ action: 'scan_site', site_id: siteId }) });
        return res;
    }

    const { data: sites } = await auth.supabase.from('sites').select('id, name').eq('user_id', auth.user.id);
    return NextResponse.json({ sites: sites || [] });
}
