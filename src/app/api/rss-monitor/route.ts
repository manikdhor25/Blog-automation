import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const AddFeedSchema = z.object({
    action: z.literal('add'),
    feed_url: z.string().url(),
    label: z.string().min(1),
    competitor_domain: z.string().optional(),
    niche: z.string().optional(),
    site_id: z.string().uuid().optional(),
    alert_on_new: z.boolean().default(true),
});

async function parseFeed(feedUrl: string): Promise<Array<{ title: string; url: string; published: string; summary: string }>> {
    try {
        const res = await fetch(feedUrl, { headers: { 'User-Agent': 'RankMasterBot/1.0' }, signal: AbortSignal.timeout(8000) });
        const xml = await res.text();
        const items: Array<{ title: string; url: string; published: string; summary: string }> = [];

        // Parse RSS/Atom
        const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
            const item = match[1] || match[2];
            const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
            const linkMatch = item.match(/<link[^>]*>([^<]+)<\/link>|<link[^>]*href=["']([^"']+)["']/);
            const pubMatch = item.match(/<pubDate>(.*?)<\/pubDate>|<published>(.*?)<\/published>|<updated>(.*?)<\/updated>/);
            const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>|<summary>([\s\S]*?)<\/summary>/);

            const title = titleMatch?.[1]?.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '';
            const url = (linkMatch?.[1] || linkMatch?.[2] || '').trim();
            const published = pubMatch?.[1] || pubMatch?.[2] || pubMatch?.[3] || new Date().toISOString();
            const summary = (descMatch?.[1] || descMatch?.[2] || '').replace(/<[^>]+>/g, '').trim().substring(0, 200);

            if (title && url) items.push({ title, url, published, summary });
        }
        return items;
    } catch {
        return [];
    }
}

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data: feeds } = await supabase.from('rss_feeds').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const { data: items } = await supabase.from('rss_feed_items').select('*').eq('user_id', user.id).order('published_at', { ascending: false }).limit(50);
    return NextResponse.json({ feeds: feeds || [], items: items || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'add') {
        const parsed = AddFeedSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Fetch initial items
        const items = await parseFeed(d.feed_url);

        const { data: feed } = await supabase.from('rss_feeds').insert({
            user_id: user.id, site_id: d.site_id || null,
            feed_url: d.feed_url, label: d.label,
            competitor_domain: d.competitor_domain || null,
            niche: d.niche || null, alert_on_new: d.alert_on_new,
            last_item_url: items[0]?.url || null, item_count: items.length,
            last_checked: new Date().toISOString(), is_active: true,
        }).select().single();

        // Save initial items
        if (feed && items.length) {
            await supabase.from('rss_feed_items').insert(items.slice(0, 10).map(item => ({
                user_id: user.id, feed_id: feed.id, title: item.title, url: item.url,
                summary: item.summary, published_at: new Date(item.published).toISOString(),
                is_new: false,
            })));
        }

        return NextResponse.json({ feed, items_found: items.length });
    }

    if (body.action === 'check') {
        const { feed_id } = body;
        const { data: feed } = await supabase.from('rss_feeds').select('*').eq('id', feed_id).eq('user_id', user.id).single();
        if (!feed) return NextResponse.json({ error: 'Feed not found' }, { status: 404 });

        const items = await parseFeed(feed.feed_url);
        const newItems = items.filter(i => i.url !== feed.last_item_url);

        for (const item of newItems.slice(0, 5)) {
            await supabase.from('rss_feed_items').upsert({
                user_id: user.id, feed_id: feed.id, title: item.title, url: item.url,
                summary: item.summary, published_at: new Date(item.published).toISOString(), is_new: true,
            }, { onConflict: 'user_id,url' });
        }

        if (newItems.length > 0) {
            await supabase.from('rss_feeds').update({ last_item_url: items[0]?.url, last_checked: new Date().toISOString() }).eq('id', feed_id);
            if (feed.alert_on_new) {
                await supabase.from('notifications').insert({
                    user_id: user.id, type: 'competitor',
                    title: `${feed.label} published ${newItems.length} new post${newItems.length > 1 ? 's' : ''}`,
                    message: newItems[0].title, link: '/rss-monitor', priority: 'medium', is_read: false, metadata: {},
                });
            }
        }

        return NextResponse.json({ new_items: newItems.length, items });
    }

    if (body.action === 'analyze') {
        const { feed_id } = body;
        const { data: items } = await supabase.from('rss_feed_items').select('title, summary').eq('feed_id', feed_id).eq('user_id', user.id).order('published_at', { ascending: false }).limit(20);
        if (!items?.length) return NextResponse.json({ error: 'No items to analyze' }, { status: 404 });

        const prompt = `Analyze these recent blog posts from a competitor and identify content opportunities for a blog to counter or capitalize on.

Recent posts:
${items.map((i, n) => `${n + 1}. "${i.title}" â€” ${i.summary}`).join('\n')}

Return JSON: { "content_themes": [string], "gaps_you_can_fill": [string], "keyword_opportunities": [string], "content_ideas": [{ "title": string, "angle": string, "urgency": "high"|"medium"|"low" }] }`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let analysis;
        try { analysis = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); } catch { analysis = {}; }
        return NextResponse.json({ analysis, provider });
    }

    if (body.action === 'delete') {
        await supabase.from('rss_feeds').delete().eq('id', body.feed_id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
