// ============================================================
// RankMaster Pro - Competitor RSS Monitor API
// Track when competitors publish new content
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/utils/safe-url';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['add_feed', 'refresh', 'refresh_all', 'list', 'delete', 'mark_read']),
    id: z.string().uuid().optional(),
    domain: z.string().max(253).optional(),
    feed_url: z.string().url().optional(),
    label: z.string().max(200).optional(),
    site_id: z.string().uuid().optional(),
});

async function fetchRSSFeed(url: string): Promise<Array<{ title: string; link: string; published: string; summary: string }>> {
    try {
        const res = await safeFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankMaster/1.0; +https://rankmaster.pro)' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return [];
        const xml = await res.text();

        // Parse RSS/Atom
        const items: Array<{ title: string; link: string; published: string; summary: string }> = [];

        // RSS 2.0
        const rssItems = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
        for (const match of rssItems) {
            const item = match[1];
            const title = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || '';
            const link = item.match(/<link>(.*?)<\/link>/)?.[1]?.trim() || item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1]?.trim() || '';
            const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || '';
            const description = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.replace(/<[^>]+>/g, ' ').trim().substring(0, 200) || '';
            if (title && link) items.push({ title, link, published: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(), summary: description });
        }

        // Atom
        if (items.length === 0) {
            const atomEntries = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi);
            for (const match of atomEntries) {
                const entry = match[1];
                const title = entry.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || '';
                const link = entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || '';
                const updated = entry.match(/<updated>(.*?)<\/updated>/)?.[1] || entry.match(/<published>(.*?)<\/published>/)?.[1] || '';
                const summary = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]?.replace(/<[^>]+>/g, ' ').trim().substring(0, 200) || '';
                if (title && link) items.push({ title, link, published: updated ? new Date(updated).toISOString() : new Date().toISOString(), summary });
            }
        }

        return items.slice(0, 20);
    } catch { return []; }
}

async function guessRSSUrl(domain: string): Promise<string | null> {
    const base = domain.startsWith('http') ? domain : `https://${domain}`;
    const candidates = [
        `${base}/feed`, `${base}/rss`, `${base}/feed.xml`, `${base}/rss.xml`,
        `${base}/atom.xml`, `${base}/blog/feed`, `${base}/news/feed`,
    ];

    for (const url of candidates) {
        try {
            const res = await safeFetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
            const ct = res.headers.get('content-type') || '';
            if (res.ok && (ct.includes('xml') || ct.includes('rss') || ct.includes('atom'))) return url;
        } catch { /* continue */ }
    }
    return null;
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'add_feed') {
        const { domain, feed_url, label, site_id } = parsed.data;
        if (!domain && !feed_url) return NextResponse.json({ error: 'domain or feed_url required' }, { status: 400 });

        let resolvedUrl = feed_url || null;
        if (!resolvedUrl && domain) resolvedUrl = await guessRSSUrl(domain);
        if (!resolvedUrl) return NextResponse.json({ error: 'Could not find RSS feed for domain. Provide feed_url directly.' }, { status: 400 });

        // Test feed
        const items = await fetchRSSFeed(resolvedUrl);

        const { data, error } = await auth.supabase.from('competitor_feeds').insert({
            user_id: auth.user.id,
            site_id: site_id || null,
            domain: domain || new URL(resolvedUrl).hostname,
            feed_url: resolvedUrl,
            label: label || domain || '',
            last_checked: new Date().toISOString(),
            last_post_title: items[0]?.title || null,
            last_post_url: items[0]?.link || null,
            last_post_date: items[0]?.published || null,
            post_count: items.length,
            is_active: true,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Save initial items
        if (items.length > 0) {
            await auth.supabase.from('competitor_feed_items').insert(
                items.map(item => ({ user_id: auth.user.id, feed_id: data.id, title: item.title, url: item.link, published_at: item.published, summary: item.summary, is_read: false }))
            );
        }

        return NextResponse.json({ feed: data, initial_items: items.length });
    }

    if (action === 'refresh') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data: feed } = await auth.supabase.from('competitor_feeds').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!feed) return NextResponse.json({ error: 'Feed not found' }, { status: 404 });

        const items = await fetchRSSFeed(feed.feed_url);
        const { data: existing } = await auth.supabase.from('competitor_feed_items').select('url').eq('feed_id', id);
        const existingUrls = new Set((existing || []).map((e: { url: string }) => e.url));

        const newItems = items.filter(item => !existingUrls.has(item.link));
        if (newItems.length > 0) {
            await auth.supabase.from('competitor_feed_items').insert(
                newItems.map(item => ({ user_id: auth.user.id, feed_id: id, title: item.title, url: item.link, published_at: item.published, summary: item.summary, is_read: false }))
            );
        }

        await auth.supabase.from('competitor_feeds').update({
            last_checked: new Date().toISOString(),
            last_post_title: items[0]?.title || null,
            last_post_url: items[0]?.link || null,
            last_post_date: items[0]?.published || null,
        }).eq('id', id);

        return NextResponse.json({ new_items: newItems.length, total: items.length });
    }

    if (action === 'refresh_all') {
        const { data: feeds } = await auth.supabase.from('competitor_feeds').select('id, feed_url').eq('user_id', auth.user.id).eq('is_active', true);
        let totalNew = 0;
        for (const feed of feeds || []) {
            const items = await fetchRSSFeed(feed.feed_url);
            const { data: existing } = await auth.supabase.from('competitor_feed_items').select('url').eq('feed_id', feed.id);
            const existingUrls = new Set((existing || []).map((e: { url: string }) => e.url));
            const newItems = items.filter(item => !existingUrls.has(item.link));
            if (newItems.length > 0) {
                await auth.supabase.from('competitor_feed_items').insert(newItems.map(item => ({ user_id: auth.user.id, feed_id: feed.id, title: item.title, url: item.link, published_at: item.published, summary: item.summary, is_read: false })));
                totalNew += newItems.length;
            }
            await auth.supabase.from('competitor_feeds').update({ last_checked: new Date().toISOString() }).eq('id', feed.id);
        }
        return NextResponse.json({ feeds_checked: (feeds || []).length, new_items: totalNew });
    }

    if (action === 'mark_read') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('competitor_feed_items').update({ is_read: true }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('competitor_feeds').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'feeds';
    const feedId = searchParams.get('feed_id');

    if (view === 'items') {
        let query = auth.supabase.from('competitor_feed_items').select('*, competitor_feeds(domain, label)').eq('user_id', auth.user.id).order('published_at', { ascending: false }).limit(100);
        if (feedId) query = query.eq('feed_id', feedId);
        const { data } = await query;
        return NextResponse.json({ items: data || [] });
    }

    const { data } = await auth.supabase.from('competitor_feeds').select('*').eq('user_id', auth.user.id).order('last_checked', { ascending: false });
    return NextResponse.json({ feeds: data || [] });
}
