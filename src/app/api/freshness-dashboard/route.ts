import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    const sortBy = url.searchParams.get('sort') || 'age';

    let q = supabase.from('posts').select('id, title, slug, word_count, created_at, updated_at, status, primary_keyword, site_id').eq('user_id', user.id).eq('status', 'publish');
    if (siteId) q = q.eq('site_id', siteId);
    const { data: posts } = await q.limit(200);

    if (!posts?.length) return NextResponse.json({ posts: [], stats: {} });

    const now = Date.now();
    const scored = posts.map(post => {
        const createdAt = new Date(post.created_at).getTime();
        const updatedAt = new Date(post.updated_at || post.created_at).getTime();
        const ageMonths = (now - createdAt) / (1000 * 60 * 60 * 24 * 30);
        const daysSinceUpdate = (now - updatedAt) / (1000 * 60 * 60 * 24);

        // Freshness score (0-100, lower = needs refresh more)
        let freshnessScore = 100;
        if (ageMonths > 24) freshnessScore -= 40;
        else if (ageMonths > 12) freshnessScore -= 25;
        else if (ageMonths > 6) freshnessScore -= 10;

        if (daysSinceUpdate > 365) freshnessScore -= 30;
        else if (daysSinceUpdate > 180) freshnessScore -= 15;
        else if (daysSinceUpdate > 90) freshnessScore -= 8;

        if ((post.word_count || 0) < 600) freshnessScore -= 15;
        else if ((post.word_count || 0) < 1000) freshnessScore -= 5;

        freshnessScore = Math.max(0, Math.min(100, freshnessScore));

        const refreshPriority = freshnessScore < 30 ? 'urgent' : freshnessScore < 50 ? 'high' : freshnessScore < 70 ? 'medium' : 'low';

        return {
            id: post.id, title: post.title || '', slug: post.slug || '',
            word_count: post.word_count || 0, primary_keyword: post.primary_keyword || '',
            age_months: Math.round(ageMonths * 10) / 10,
            days_since_update: Math.round(daysSinceUpdate),
            freshness_score: freshnessScore,
            refresh_priority: refreshPriority,
            created_at: post.created_at,
            updated_at: post.updated_at,
        };
    });

    // Sort
    const sorted = scored.sort((a, b) => {
        if (sortBy === 'freshness') return a.freshness_score - b.freshness_score;
        if (sortBy === 'updated') return b.days_since_update - a.days_since_update;
        return b.age_months - a.age_months; // default: oldest first
    });

    const stats = {
        total: scored.length,
        urgent: scored.filter(p => p.refresh_priority === 'urgent').length,
        high: scored.filter(p => p.refresh_priority === 'high').length,
        avg_age_months: Math.round(scored.reduce((s, p) => s + p.age_months, 0) / scored.length * 10) / 10,
        avg_freshness: Math.round(scored.reduce((s, p) => s + p.freshness_score, 0) / scored.length),
        older_than_12mo: scored.filter(p => p.age_months > 12).length,
        not_updated_180d: scored.filter(p => p.days_since_update > 180).length,
    };

    return NextResponse.json({ posts: sorted, stats });
}
