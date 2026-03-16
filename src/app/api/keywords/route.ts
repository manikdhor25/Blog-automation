// ============================================================
// RankMaster Pro - Keywords API Route
// Now powered by real data (DataForSEO) with AI fallback
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';
import { getKeywordDataEngine } from '@/lib/engines/keyword-data';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/keywords - List keywords for current user's sites
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const siteId = searchParams.get('site_id');

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        // First get user's site IDs to scope keyword query
        const { data: userSites } = await auth.supabase
            .from('sites')
            .select('id')
            .eq('user_id', auth.user.id);

        const userSiteIds = (userSites || []).map(s => s.id);
        if (userSiteIds.length === 0) {
            return NextResponse.json({ keywords: [] });
        }

        let query = auth.supabase.from('keywords').select('*').in('site_id', userSiteIds).order('priority_score', { ascending: false });

        if (siteId && userSiteIds.includes(siteId)) {
            query = auth.supabase.from('keywords').select('*').eq('site_id', siteId).order('priority_score', { ascending: false });
        }

        const { data: keywords, error } = await query;
        if (error) throw error;
        return NextResponse.json({ keywords: keywords || [] });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch keywords' },
            { status: 500 }
        );
    }
}

// POST /api/keywords - Add keywords or discover via API/AI
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { site_id, keywords: keywordList, action } = body;

        if (action === 'ai_suggest') {
            // Keyword discovery — uses DataForSEO if configured, otherwise AI
            const engine = getKeywordDataEngine();
            await engine.loadCredentials();

            const niche = body.niche || 'general';
            const suggestions = await engine.getSuggestedKeywords(niche, 20);

            return NextResponse.json({
                suggestions,
                source: engine.isConfigured() ? 'dataforseo' : 'ai_estimated',
            });
        }

        if (action === 'enrich') {
            // Enrich existing keywords with real data
            const engine = getKeywordDataEngine();
            await engine.loadCredentials();

            if (!body.keyword_ids || !Array.isArray(body.keyword_ids)) {
                return NextResponse.json({ error: 'keyword_ids array required' }, { status: 400 });
            }

            const supabase = createServiceRoleClient();
            const { data: keywords } = await supabase
                .from('keywords')
                .select('id, keyword')
                .in('id', body.keyword_ids);

            if (!keywords?.length) {
                return NextResponse.json({ error: 'No keywords found' }, { status: 404 });
            }

            const enriched = await engine.enrichKeywords(keywords);

            // Update keywords in database
            for (const kw of enriched) {
                if (!kw.id) continue;
                await supabase.from('keywords').update({
                    search_volume: kw.search_volume,
                    difficulty: kw.difficulty,
                    cpc: kw.cpc,
                    intent_type: kw.intent_type,
                    serp_features: kw.serp_features,
                    data_source: kw.source,
                }).eq('id', kw.id);
            }

            return NextResponse.json({
                enriched: enriched.length,
                source: engine.isConfigured() ? 'dataforseo' : 'ai_estimated',
                keywords: enriched,
            });
        }

        if (action === 'related') {
            // Get related keywords for a seed keyword
            const engine = getKeywordDataEngine();
            await engine.loadCredentials();

            const seed = body.seed_keyword;
            if (!seed) return NextResponse.json({ error: 'seed_keyword required' }, { status: 400 });

            const suggestions = await engine.getSuggestedKeywords(seed, body.limit || 20);
            return NextResponse.json({
                suggestions,
                source: engine.isConfigured() ? 'dataforseo' : 'ai_estimated',
            });
        }

        if (action === 'get_metrics') {
            // Get metrics for specific keywords
            const engine = getKeywordDataEngine();
            await engine.loadCredentials();

            const keywords = body.keywords;
            if (!keywords?.length) return NextResponse.json({ error: 'keywords array required' }, { status: 400 });

            const metrics = await engine.getKeywordMetrics(keywords);
            return NextResponse.json({
                metrics,
                source: engine.isConfigured() ? 'dataforseo' : 'ai_estimated',
            });
        }

        // Manual keyword addition
        if (!site_id || !keywordList || !Array.isArray(keywordList)) {
            return NextResponse.json({ error: 'site_id and keywords array required' }, { status: 400 });
        }

        const supabase = createServiceRoleClient();
        const { data, error } = await supabase
            .from('keywords')
            .insert(keywordList.map((kw: { keyword: string; search_volume?: number; difficulty?: number; cpc?: number; intent_type?: string; serp_features?: string[]; priority_score?: number; cluster_id?: string; data_source?: string }) => ({
                site_id,
                keyword: kw.keyword,
                search_volume: kw.search_volume || 0,
                difficulty: kw.difficulty || 50,
                cpc: kw.cpc || 0,
                intent_type: kw.intent_type || 'informational',
                serp_features: kw.serp_features || [],
                priority_score: kw.priority_score || 50,
                status: 'discovered',
                cluster_id: kw.cluster_id || null,
                data_source: kw.data_source || 'ai_estimated',
            })))
            .select();

        if (error) throw error;
        return NextResponse.json({ keywords: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to add keywords' },
            { status: 500 }
        );
    }
}
