// ============================================================
// RankMaster Pro - Google Analytics 4 Integration API
// Pull traffic, engagement, bounce rate per post
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['connect', 'sync', 'get_post_metrics', 'get_site_metrics', 'list_properties']),
    property_id: z.string().max(50).optional(),
    site_id: z.string().uuid().optional(),
    post_url: z.string().url().optional(),
    date_range: z.enum(['7d', '30d', '90d', '6m', '12m']).default('30d').optional(),
    access_token: z.string().optional(),
});

const DATE_RANGES: Record<string, { startDate: string; endDate: string }> = {
    '7d': { startDate: '7daysAgo', endDate: 'today' },
    '30d': { startDate: '30daysAgo', endDate: 'today' },
    '90d': { startDate: '90daysAgo', endDate: 'today' },
    '6m': { startDate: '180daysAgo', endDate: 'today' },
    '12m': { startDate: '365daysAgo', endDate: 'today' },
};

async function runGA4Report(
    propertyId: string,
    accessToken: string,
    dimensions: string[],
    metrics: string[],
    dateRange: string,
    dimensionFilter?: Record<string, unknown>
) {
    const range = DATE_RANGES[dateRange] || DATE_RANGES['30d'];
    const body: Record<string, unknown> = {
        dateRanges: [range],
        dimensions: dimensions.map(n => ({ name: n })),
        metrics: metrics.map(n => ({ name: n })),
        limit: 100,
    };
    if (dimensionFilter) body.dimensionFilter = dimensionFilter;

    const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `GA4 API error: ${res.status}`);
    }
    return res.json();
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    // Get stored GA4 credentials
    const { data: settings } = await auth.supabase
        .from('settings')
        .select('key, value')
        .in('key', ['ga4_access_token', 'ga4_property_id', 'ga4_refresh_token']);
    const s = Object.fromEntries((settings || []).map((r: { key: string; value: string }) => [r.key, r.value]));

    const accessToken = parsed.data.access_token || s.ga4_access_token;
    const propertyId = parsed.data.property_id || s.ga4_property_id;

    if (action === 'connect') {
        if (!parsed.data.access_token || !parsed.data.property_id) {
            return NextResponse.json({ error: 'access_token and property_id required' }, { status: 400 });
        }
        await auth.supabase.from('settings').upsert([
            { category: 'analytics', key: 'ga4_access_token', value: parsed.data.access_token, is_secret: true },
            { category: 'analytics', key: 'ga4_property_id', value: parsed.data.property_id },
        ], { onConflict: 'key' });
        return NextResponse.json({ success: true, message: 'GA4 connected' });
    }

    if (!accessToken || !propertyId) {
        return NextResponse.json({ error: 'GA4 not configured. Add ga4_access_token and ga4_property_id in Settings.' }, { status: 400 });
    }

    if (action === 'get_site_metrics') {
        const { date_range = '30d' } = parsed.data;
        try {
            const data = await runGA4Report(
                propertyId, accessToken,
                ['pagePath', 'pageTitle'],
                ['sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'newUsers'],
                date_range
            );

            const rows = (data.rows || []).map((row: { dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }) => ({
                path: row.dimensionValues[0]?.value,
                title: row.dimensionValues[1]?.value,
                sessions: parseInt(row.metricValues[0]?.value || '0'),
                pageviews: parseInt(row.metricValues[1]?.value || '0'),
                bounce_rate: parseFloat(row.metricValues[2]?.value || '0'),
                avg_session_duration: parseFloat(row.metricValues[3]?.value || '0'),
                new_users: parseInt(row.metricValues[4]?.value || '0'),
            }));

            const totals = rows.reduce((acc: Record<string, number>, r: { sessions: number; pageviews: number; new_users: number }) => ({
                sessions: acc.sessions + r.sessions,
                pageviews: acc.pageviews + r.pageviews,
                new_users: acc.new_users + r.new_users,
            }), { sessions: 0, pageviews: 0, new_users: 0 });

            // Save to DB for historical tracking
            await auth.supabase.from('ga4_snapshots').upsert({
                user_id: auth.user.id,
                property_id: propertyId,
                date_range,
                total_sessions: totals.sessions,
                total_pageviews: totals.pageviews,
                total_new_users: totals.new_users,
                top_pages: rows.slice(0, 20),
                snapshot_date: new Date().toISOString().split('T')[0],
            }, { onConflict: 'user_id,property_id,snapshot_date' });

            return NextResponse.json({ rows, totals, date_range, row_count: rows.length });
        } catch (err) {
            return NextResponse.json({ error: err instanceof Error ? err.message : 'GA4 fetch failed' }, { status: 500 });
        }
    }

    if (action === 'get_post_metrics') {
        const { post_url, date_range = '30d', site_id } = parsed.data;

        // Get URLs from posts if site_id provided
        let urls: string[] = [];
        if (post_url) urls = [post_url];
        else if (site_id) {
            const { data: site } = await auth.supabase.from('sites').select('url').eq('id', site_id).single();
            const { data: posts } = await auth.supabase.from('posts').select('slug').eq('site_id', site_id).eq('status', 'published').limit(50);
            const baseUrl = site?.url?.replace(/\/$/, '') || '';
            urls = (posts || []).map((p: { slug: string }) => `/${p.slug}/`);
        }

        if (urls.length === 0) return NextResponse.json({ error: 'post_url or site_id with published posts required' }, { status: 400 });

        try {
            const results = [];
            // Batch check up to 10 URLs
            for (const url of urls.slice(0, 10)) {
                const data = await runGA4Report(
                    propertyId, accessToken,
                    ['pagePath'],
                    ['sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'engagementRate'],
                    date_range,
                    {
                        filter: {
                            fieldName: 'pagePath',
                            stringFilter: { matchType: 'CONTAINS', value: url },
                        }
                    }
                );

                const row = data.rows?.[0];
                results.push({
                    url,
                    sessions: row ? parseInt(row.metricValues[0]?.value || '0') : 0,
                    pageviews: row ? parseInt(row.metricValues[1]?.value || '0') : 0,
                    bounce_rate: row ? parseFloat(row.metricValues[2]?.value || '0') : 0,
                    avg_duration_seconds: row ? parseFloat(row.metricValues[3]?.value || '0') : 0,
                    engagement_rate: row ? parseFloat(row.metricValues[4]?.value || '0') : 0,
                    no_data: !row,
                });
            }

            return NextResponse.json({ results, date_range });
        } catch (err) {
            return NextResponse.json({ error: err instanceof Error ? err.message : 'GA4 fetch failed' }, { status: 500 });
        }
    }

    if (action === 'sync') {
        const { site_id, date_range = '30d' } = parsed.data;
        try {
            const data = await runGA4Report(
                propertyId, accessToken,
                ['pagePath'],
                ['sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration'],
                date_range
            );
            const rows = data.rows || [];
            // Store per-page metrics
            await auth.supabase.from('ga4_page_metrics').upsert(
                rows.slice(0, 100).map((row: { dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }) => ({
                    user_id: auth.user.id,
                    property_id: propertyId,
                    site_id: site_id || null,
                    page_path: row.dimensionValues[0]?.value,
                    sessions: parseInt(row.metricValues[0]?.value || '0'),
                    pageviews: parseInt(row.metricValues[1]?.value || '0'),
                    bounce_rate: parseFloat(row.metricValues[2]?.value || '0'),
                    avg_duration: parseFloat(row.metricValues[3]?.value || '0'),
                    date_range,
                    synced_at: new Date().toISOString(),
                })),
                { onConflict: 'user_id,property_id,page_path,date_range' }
            );
            return NextResponse.json({ synced: rows.length, date_range });
        } catch (err) {
            return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 });
        }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const dateRange = searchParams.get('date_range') || '30d';

    // Return cached metrics
    let query = auth.supabase.from('ga4_page_metrics').select('*').eq('user_id', auth.user.id).eq('date_range', dateRange).order('sessions', { ascending: false });
    if (siteId) query = query.eq('site_id', siteId);
    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: snapshots } = await auth.supabase.from('ga4_snapshots').select('*').eq('user_id', auth.user.id).order('snapshot_date', { ascending: false }).limit(10);

    return NextResponse.json({
        metrics: data || [],
        snapshots: snapshots || [],
        configured: !!(await auth.supabase.from('settings').select('value').eq('key', 'ga4_access_token').single()).data?.value,
    });
}
