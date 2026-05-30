// ============================================================
// RankMaster Pro - SERP Volatility Monitor API
// Track Google algo update impact on your rankings
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['log_snapshot', 'get_history', 'correlate', 'log_algo_update']),
    site_id: z.string().uuid().optional(),
    days: z.number().int().min(1).max(365).default(30).optional(),
});

// Known Google algorithm update dates (historical reference)
const KNOWN_UPDATES = [
    { name: 'March 2024 Core Update', date: '2024-03-05', type: 'core', description: 'Massive spam/quality crackdown' },
    { name: 'November 2023 Core Update', date: '2023-11-02', type: 'core', description: 'Broad quality signals' },
    { name: 'October 2023 Core + Spam', date: '2023-10-04', type: 'core', description: 'Dual update' },
    { name: 'September 2023 Helpful Content', date: '2023-09-14', type: 'helpful_content', description: 'E-E-A-T emphasis' },
    { name: 'August 2023 Core', date: '2023-08-22', type: 'core', description: 'Broad core' },
    { name: 'April 2023 Reviews', date: '2023-04-12', type: 'reviews', description: 'Product review quality' },
    { name: 'February 2023 Product Reviews', date: '2023-02-21', type: 'reviews', description: 'Affiliate/review focus' },
];

async function calculateVolatilityScore(rankHistory: Array<{ keyword_id: string; position: number; checked_at: string }>, days: number): Promise<number> {
    if (rankHistory.length < 2) return 0;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recent = rankHistory.filter(r => new Date(r.checked_at) > cutoff);

    if (recent.length < 2) return 0;

    // Group by keyword, calculate average position change
    const kwMap = new Map<string, number[]>();
    for (const r of recent) {
        if (!kwMap.has(r.keyword_id)) kwMap.set(r.keyword_id, []);
        kwMap.get(r.keyword_id)!.push(r.position);
    }

    let totalVariance = 0;
    let count = 0;

    for (const positions of kwMap.values()) {
        if (positions.length < 2) continue;
        const avg = positions.reduce((a, b) => a + b) / positions.length;
        const variance = positions.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / positions.length;
        totalVariance += Math.sqrt(variance);
        count++;
    }

    if (count === 0) return 0;
    const avgVariance = totalVariance / count;
    return Math.min(100, Math.round(avgVariance * 2));
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'log_snapshot') {
        const { site_id } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        // Get recent rank history for this site
        const { data: rankHistory } = await auth.supabase
            .from('rank_history')
            .select('keyword_id, position, checked_at')
            .eq('site_id', site_id)
            .order('checked_at', { ascending: false })
            .limit(500);

        const volatilityScore = await calculateVolatilityScore(rankHistory || [], 7);

        const { data: keywords } = await auth.supabase.from('keywords').select('id, keyword, status').eq('site_id', site_id).eq('status', 'ranking');

        // Calculate gains/losses vs prior snapshot
        const { data: lastSnapshot } = await auth.supabase
            .from('volatility_snapshots')
            .select('*')
            .eq('site_id', site_id)
            .eq('user_id', auth.user.id)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .single();

        const rankingCount = keywords?.length || 0;
        const lastCount = lastSnapshot?.ranking_count || rankingCount;
        const gained = Math.max(0, rankingCount - lastCount);
        const lost = Math.max(0, lastCount - rankingCount);

        const { data: snapshot } = await auth.supabase.from('volatility_snapshots').insert({
            user_id: auth.user.id,
            site_id,
            snapshot_date: new Date().toISOString().split('T')[0],
            volatility_score: volatilityScore,
            ranking_count: rankingCount,
            keywords_gained: gained,
            keywords_lost: lost,
        }).select().single();

        return NextResponse.json({ snapshot, volatility_score: volatilityScore });
    }

    if (action === 'correlate') {
        const { site_id, days = 90 } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const { data: snapshots } = await auth.supabase
            .from('volatility_snapshots')
            .select('*')
            .eq('site_id', site_id)
            .eq('user_id', auth.user.id)
            .gte('snapshot_date', startDate)
            .order('snapshot_date', { ascending: true });

        // Find nearby algo updates
        const correlations = KNOWN_UPDATES.filter(u => u.date >= startDate).map(update => {
            const updateDate = new Date(update.date);
            const nearbySnapshots = (snapshots || []).filter(s => {
                const d = new Date(s.snapshot_date);
                const diff = Math.abs(d.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24);
                return diff <= 7;
            });
            const avgVolatility = nearbySnapshots.length ? nearbySnapshots.reduce((s: number, snap: { volatility_score: number }) => s + snap.volatility_score, 0) / nearbySnapshots.length : null;
            return { ...update, avg_volatility_nearby: avgVolatility, snapshots_near: nearbySnapshots.length };
        });

        return NextResponse.json({ snapshots: snapshots || [], known_updates: correlations, days });
    }

    if (action === 'log_algo_update') {
        // Manual user-logged update
        const body2 = await request.json().catch(() => ({}));
        const { name, date, type, description } = body2;
        const { data } = await auth.supabase.from('algo_updates').insert({
            user_id: auth.user.id, name, date, type: type || 'custom', description: description || '',
        }).select().single();
        return NextResponse.json({ update: data });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const days = parseInt(searchParams.get('days') || '30');
    const view = searchParams.get('view') || 'snapshots';

    if (view === 'updates') {
        const { data } = await auth.supabase.from('algo_updates').select('*').eq('user_id', auth.user.id).order('date', { ascending: false });
        return NextResponse.json({ updates: [...KNOWN_UPDATES, ...(data || [])].sort((a, b) => b.date.localeCompare(a.date)) });
    }

    if (!siteId) {
        const { data: sites } = await auth.supabase.from('sites').select('id, name').eq('user_id', auth.user.id);
        return NextResponse.json({ sites: sites || [], known_updates: KNOWN_UPDATES.slice(0, 5) });
    }

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data } = await auth.supabase.from('volatility_snapshots').select('*').eq('site_id', siteId).eq('user_id', auth.user.id).gte('snapshot_date', startDate).order('snapshot_date', { ascending: true });

    return NextResponse.json({ snapshots: data || [], known_updates: KNOWN_UPDATES.filter(u => u.date >= startDate) });
}
