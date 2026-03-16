// ============================================================
// RankMaster Pro - Rank Tracking API Route
// Real SERP position tracking via DataForSEO or Google CSE
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getRankTrackingEngine } from '@/lib/engines/rank-engine';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/rank-tracking - Get rank history for current user's sites
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const siteId = searchParams.get('site_id');
        const keywordId = searchParams.get('keyword_id');
        const limit = parseInt(searchParams.get('limit') || '100');

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        // Get user's site IDs for scoping
        const { data: userSites } = await auth.supabase.from('sites').select('id').eq('user_id', auth.user.id);
        const userSiteIds = (userSites || []).map(s => s.id);

        if (userSiteIds.length === 0) {
            return NextResponse.json({ entries: [], stats: {} });
        }

        let query = auth.supabase.from('rank_tracking')
            .select('*')
            .in('site_id', userSiteIds)
            .order('checked_at', { ascending: false })
            .limit(limit);

        if (siteId && userSiteIds.includes(siteId)) query = query.eq('site_id', siteId);
        if (keywordId) query = query.eq('keyword_id', keywordId);

        const { data, error } = await query;
        if (error) throw error;

        // Compute stats
        const entries = data || [];
        const latestByKeyword: Record<string, typeof entries[0]> = {};
        entries.forEach(e => {
            if (!latestByKeyword[e.keyword]) latestByKeyword[e.keyword] = e;
        });

        const latestEntries = Object.values(latestByKeyword);
        const top3 = latestEntries.filter(e => e.position && e.position <= 3).length;
        const top10 = latestEntries.filter(e => e.position && e.position <= 10).length;
        const top20 = latestEntries.filter(e => e.position && e.position <= 20).length;
        const improved = latestEntries.filter(e => e.previous_position && e.position && e.position < e.previous_position).length;
        const declined = latestEntries.filter(e => e.previous_position && e.position && e.position > e.previous_position).length;
        const withAIOverview = latestEntries.filter(e => e.has_ai_overview).length;
        const withFeaturedSnippet = latestEntries.filter(e => e.has_featured_snippet).length;

        return NextResponse.json({
            entries,
            stats: {
                totalTracked: latestEntries.length,
                top3,
                top10,
                top20,
                improved,
                declined,
                notRanking: latestEntries.filter(e => !e.position).length,
                withAIOverview,
                withFeaturedSnippet,
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch rank data' },
            { status: 500 }
        );
    }
}

// POST /api/rank-tracking - Check ranks for keywords
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { site_id, keyword_ids, device, action } = body;

        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const auth = await getAuthUser();
        if (auth.error) return auth.error;
        const supabase = auth.supabase;
        const user = auth.user;

        // Get site details
        const { data: site } = await supabase.from('sites').select('*').eq('id', site_id).single();
        if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

        // Get keywords to check
        let kwQuery = supabase.from('keywords').select('*').eq('site_id', site_id);
        if (keyword_ids?.length) kwQuery = kwQuery.in('id', keyword_ids);
        const { data: keywords } = await kwQuery;

        if (!keywords?.length) return NextResponse.json({ error: 'No keywords to track' }, { status: 400 });

        // Use the rank tracking engine
        const engine = getRankTrackingEngine();
        await engine.loadCredentials();

        const keywordStrings = keywords.map(k => k.keyword);
        const results = await engine.checkRanks(site.url, keywordStrings, {
            device: device || 'desktop',
        });

        // Save all results to database
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const kwRecord = keywords.find(k => k.keyword === result.keyword);
            await engine.saveResults(user.id, site_id, kwRecord?.id || null, result);
        }

        // If this is a scheduled check, update last_checked timestamp
        if (action === 'scheduled_check') {
            await supabase.from('sites').update({
                last_rank_check: new Date().toISOString(),
            }).eq('id', site_id);
        }

        return NextResponse.json({
            checked: results.length,
            results,
            source: engine.isConfigured() ? 'dataforseo' : 'google_cse',
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Rank check failed' },
            { status: 500 }
        );
    }
}
