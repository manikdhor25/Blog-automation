// ============================================================
// RankMaster Pro - Trending Content Radar API
// Google Trends, Reddit, news signals for content opportunities
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const TrendingSchema = z.object({
    action: z.enum(['discover', 'analyze', 'save', 'list', 'delete']),
    niche: z.string().max(200).optional(),
    keywords: z.array(z.string()).max(20).optional(),
    source: z.enum(['google_trends', 'reddit', 'news', 'ai_predict', 'all']).optional(),
    timeframe: z.enum(['day', 'week', 'month']).optional(),
    geo: z.string().max(10).optional(),
    id: z.string().uuid().optional(),
});

async function fetchRedditTrending(niche: string): Promise<Array<{ title: string; subreddit: string; score: number; url: string; created_utc: number }>> {
    try {
        const query = encodeURIComponent(niche);
        const res = await fetch(
            `https://www.reddit.com/search.json?q=${query}&sort=rising&t=week&limit=20`,
            { headers: { 'User-Agent': 'RankMaster/1.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data?.children || []).map((child: { data: { title: string; subreddit: string; score: number; url: string; created_utc: number } }) => ({
            title: child.data.title,
            subreddit: child.data.subreddit,
            score: child.data.score,
            url: `https://reddit.com${child.data.url}`,
            created_utc: child.data.created_utc,
        }));
    } catch {
        return [];
    }
}

async function fetchGoogleTrends(keyword: string, geo = 'US'): Promise<{ interest: number; related: string[]; available: boolean }> {
    // Google Trends has no public API. No SerpAPI/Trends source is wired yet,
    // so report interest as unavailable (0) rather than fabricating a random
    // score that would look like real trend data.
    void keyword; void geo;
    return { interest: 0, related: [], available: false };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = TrendingSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'discover') {
        const { niche, source = 'all', timeframe = 'week', geo = 'US' } = parsed.data;
        if (!niche) return NextResponse.json({ error: 'niche required' }, { status: 400 });

        const results: {
            source: string;
            title: string;
            trend_score: number;
            content_angle: string;
            keyword_opportunity: string;
            url?: string;
            subreddit?: string;
        }[] = [];

        // Reddit signals
        if (source === 'reddit' || source === 'all') {
            const redditTrends = await fetchRedditTrending(niche);
            for (const post of redditTrends.slice(0, 10)) {
                results.push({
                    source: 'reddit',
                    title: post.title,
                    trend_score: Math.min(100, Math.floor(post.score / 10)),
                    content_angle: `Reddit discussion: ${post.title.substring(0, 80)}`,
                    keyword_opportunity: post.title.split(' ').slice(0, 5).join(' ').toLowerCase(),
                    url: post.url,
                    subreddit: post.subreddit,
                });
            }
        }

        // AI-predicted trends
        if (source === 'ai_predict' || source === 'all') {
            const prompt = `You are a content strategist. Based on the niche "${niche}", predict 10 trending content opportunities for ${timeframe === 'week' ? 'this week' : timeframe === 'month' ? 'this month' : 'today'} in ${geo}.

Return ONLY valid JSON array:
[
  {
    "title": "specific trending topic or question",
    "trend_score": 85,
    "content_angle": "unique angle to cover this topic",
    "keyword_opportunity": "target keyword phrase",
    "search_intent": "informational|commercial|transactional",
    "content_type": "article|comparison|review|listicle|how-to",
    "urgency": "high|medium|low",
    "reason": "why this is trending now"
  }
]`;

            const result = await routeAI({ task: 'outline_generation', prompt, systemPrompt: 'Content strategist. Return only JSON array.', maxTokens: 2000, jsonMode: true });
            if (result.success && result.content) {
                try {
                    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
                    const aiTrends = JSON.parse(jsonMatch?.[0] || '[]');
                    for (const t of aiTrends) {
                        results.push({ source: 'ai_predict', ...t });
                    }
                } catch { /* skip */ }
            }
        }

        // Sort by trend score
        results.sort((a, b) => b.trend_score - a.trend_score);

        // Save to DB
        if (results.length > 0) {
            await auth.supabase.from('trending_topics').insert(
                results.slice(0, 20).map(r => ({
                    user_id: auth.user.id,
                    niche,
                    source: r.source,
                    title: r.title,
                    trend_score: r.trend_score,
                    content_angle: r.content_angle,
                    keyword_opportunity: r.keyword_opportunity,
                    geo,
                    timeframe,
                    discovered_at: new Date().toISOString(),
                    status: 'new',
                }))
            );
        }

        return NextResponse.json({ trends: results, count: results.length });
    }

    if (action === 'save') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('trending_topics').update({ status: 'saved' }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('trending_topics').delete().eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'new';
    const niche = searchParams.get('niche');

    let query = auth.supabase
        .from('trending_topics')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('trend_score', { ascending: false })
        .limit(100);

    if (status !== 'all') query = query.eq('status', status);
    if (niche) query = query.eq('niche', niche);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ trends: data || [] });
}
