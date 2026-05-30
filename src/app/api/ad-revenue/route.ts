// ============================================================
// RankMaster Pro - Ad Revenue Dashboard API
// AdSense, Mediavine, Ezoic, Raptive integration + manual entry
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const AdRevenueSchema = z.object({
    action: z.enum(['log_revenue', 'list', 'delete', 'connect_adsense', 'sync_adsense', 'get_summary']),
    network: z.enum(['adsense', 'mediavine', 'ezoic', 'raptive', 'adthrive', 'manual']).optional(),
    site_id: z.string().uuid().optional(),
    date: z.string().optional(),
    impressions: z.number().int().min(0).optional(),
    clicks: z.number().int().min(0).optional(),
    rpm: z.number().min(0).optional(),
    epmv: z.number().min(0).optional(),
    revenue: z.number().min(0).optional(),
    sessions: z.number().int().min(0).optional(),
    notes: z.string().max(500).optional(),
    id: z.string().uuid().optional(),
});

async function fetchAdSenseData(accessToken: string, publisherId: string, dateFrom: string, dateTo: string) {
    try {
        const res = await fetch(
            `https://adsense.googleapis.com/v2/accounts/${publisherId}/reports:generate` +
            `?dateRange=CUSTOM&startDate.year=${dateFrom.split('-')[0]}&startDate.month=${dateFrom.split('-')[1]}&startDate.day=${dateFrom.split('-')[2]}` +
            `&endDate.year=${dateTo.split('-')[0]}&endDate.month=${dateTo.split('-')[1]}&endDate.day=${dateTo.split('-')[2]}` +
            `&metrics=ESTIMATED_EARNINGS&metrics=PAGE_VIEWS&metrics=IMPRESSIONS&metrics=CLICKS&metrics=PAGE_RPM`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10000),
            }
        );

        if (!res.ok) return null;
        const data = await res.json();
        const totals = data.totals?.cells || [];

        return {
            revenue: parseFloat(totals[0]?.value || '0'),
            pageviews: parseInt(totals[1]?.value || '0'),
            impressions: parseInt(totals[2]?.value || '0'),
            clicks: parseInt(totals[3]?.value || '0'),
            rpm: parseFloat(totals[4]?.value || '0'),
        };
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = AdRevenueSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'log_revenue') {
        const { network, site_id, date, impressions, clicks, rpm, epmv, revenue, sessions, notes } = parsed.data;
        if (!network || !date || revenue === undefined) return NextResponse.json({ error: 'network, date, revenue required' }, { status: 400 });

        const payload = {
            impressions: impressions || 0,
            clicks: clicks || 0,
            rpm: rpm || 0,
            epmv: epmv || 0,
            revenue,
            sessions: sessions || 0,
            notes: notes || null,
            updated_at: new Date().toISOString(),
        };

        // Try update first (handles NULL site_id correctly via partial indexes)
        let updateQuery = auth.supabase
            .from('ad_revenue')
            .update(payload)
            .eq('user_id', auth.user.id)
            .eq('network', network)
            .eq('date', date);

        updateQuery = site_id
            ? updateQuery.eq('site_id', site_id)
            : updateQuery.is('site_id', null);

        const { data: updated } = await updateQuery.select().maybeSingle();

        if (updated) return NextResponse.json({ entry: updated });

        // No existing row — insert
        const { data: inserted, error: insertErr } = await auth.supabase
            .from('ad_revenue')
            .insert({ user_id: auth.user.id, site_id: site_id || null, network, date, ...payload })
            .select()
            .single();

        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
        return NextResponse.json({ entry: inserted });
    }

    if (action === 'sync_adsense') {
        const { data: settings } = await auth.supabase
            .from('settings')
            .select('key, value')
            .in('key', ['adsense_access_token', 'adsense_publisher_id']);

        const s = Object.fromEntries((settings || []).map((row: { key: string; value: string }) => [row.key, row.value]));

        if (!s.adsense_access_token || !s.adsense_publisher_id) {
            return NextResponse.json({ error: 'AdSense credentials not configured in Settings' }, { status: 400 });
        }

        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const adsenseData = await fetchAdSenseData(s.adsense_access_token, s.adsense_publisher_id, thirtyDaysAgo, today);
        if (!adsenseData) return NextResponse.json({ error: 'Failed to fetch AdSense data. Check credentials.' }, { status: 400 });

        const adsensePayload = {
            impressions: adsenseData.impressions,
            clicks: adsenseData.clicks,
            rpm: adsenseData.rpm,
            revenue: adsenseData.revenue,
            sessions: adsenseData.pageviews,
            updated_at: new Date().toISOString(),
        };

        const { data: existing } = await auth.supabase
            .from('ad_revenue')
            .select('id')
            .eq('user_id', auth.user.id)
            .eq('network', 'adsense')
            .eq('date', today)
            .is('site_id', null)
            .maybeSingle();

        if (existing) {
            await auth.supabase.from('ad_revenue').update(adsensePayload).eq('id', existing.id);
        } else {
            await auth.supabase.from('ad_revenue').insert({ user_id: auth.user.id, network: 'adsense', date: today, site_id: null, ...adsensePayload });
        }

        return NextResponse.json({ synced: adsenseData });
    }

    if (action === 'get_summary') {
        const { data: rows } = await auth.supabase
            .from('ad_revenue')
            .select('network, revenue, impressions, clicks, rpm, epmv, sessions, date')
            .eq('user_id', auth.user.id)
            .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('date', { ascending: false });

        const byNetwork: Record<string, { revenue: number; impressions: number; clicks: number; rpm: number; sessions: number; entries: number }> = {};
        for (const row of rows || []) {
            if (!byNetwork[row.network]) byNetwork[row.network] = { revenue: 0, impressions: 0, clicks: 0, rpm: 0, sessions: 0, entries: 0 };
            byNetwork[row.network].revenue += row.revenue || 0;
            byNetwork[row.network].impressions += row.impressions || 0;
            byNetwork[row.network].clicks += row.clicks || 0;
            byNetwork[row.network].sessions += row.sessions || 0;
            byNetwork[row.network].entries++;
        }

        for (const n of Object.keys(byNetwork)) {
            const entries = byNetwork[n].entries;
            byNetwork[n].rpm = entries > 0 ? byNetwork[n].revenue / (byNetwork[n].sessions / 1000) : 0;
        }

        const totalRevenue = Object.values(byNetwork).reduce((s, n) => s + n.revenue, 0);
        const totalSessions = Object.values(byNetwork).reduce((s, n) => s + n.sessions, 0);
        const blendedEpmv = totalSessions > 0 ? (totalRevenue / totalSessions) * 1000 : 0;

        return NextResponse.json({ summary: { total_revenue: totalRevenue, blended_epmv: blendedEpmv, total_sessions: totalSessions, by_network: byNetwork } });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('ad_revenue').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const network = searchParams.get('network');
    const days = parseInt(searchParams.get('days') || '30');

    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let query = auth.supabase
        .from('ad_revenue')
        .select('*')
        .eq('user_id', auth.user.id)
        .gte('date', dateFrom)
        .order('date', { ascending: false });

    if (network) query = query.eq('network', network);

    const { data, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data || [] });
}
