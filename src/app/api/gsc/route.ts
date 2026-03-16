import { NextRequest, NextResponse } from 'next/server';

import { getAuthUser } from '@/lib/auth-guard';

// GSC Integration - Google Search Console API
// Credentials loaded from settings table or env vars

// GET /api/gsc — Fetch search performance data (authenticated)
export async function GET(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const supabase = auth.supabase;

        // Load credentials from settings table first, then env vars
        const { data: settings } = await supabase
            .from('settings')
            .select('key, value')
            .in('key', ['gsc_client_id', 'gsc_client_secret', 'gsc_refresh_token']);

        const settingsMap: Record<string, string> = {};
        for (const s of settings || []) {
            settingsMap[s.key] = s.value;
        }

        const clientId = settingsMap['gsc_client_id'] || process.env.GOOGLE_CLIENT_ID;
        const clientSecret = settingsMap['gsc_client_secret'] || process.env.GOOGLE_CLIENT_SECRET;
        const refreshToken = settingsMap['gsc_refresh_token'] || process.env.GOOGLE_REFRESH_TOKEN;

        if (!clientId || !clientSecret || !refreshToken) {
            return NextResponse.json({
                configured: false,
                message: 'Google Search Console not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env.local',
                setup_url: 'https://console.cloud.google.com/apis/credentials',
                steps: [
                    '1. Create OAuth 2.0 credentials at Google Cloud Console',
                    '2. Enable Search Console API',
                    '3. Complete OAuth flow to get refresh token',
                    '4. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN to .env.local',
                ],
            });
        }

        const siteUrl = req.nextUrl.searchParams.get('site_url');
        const days = parseInt(req.nextUrl.searchParams.get('days') || '28');
        const metric = req.nextUrl.searchParams.get('metric') || 'query'; // query, page, device, country

        // Step 1: Get access token from refresh token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!tokenRes.ok) {
            return NextResponse.json({ error: 'Failed to refresh GSC token', configured: true }, { status: 401 });
        }

        const { access_token } = await tokenRes.json();

        // Step 2: If no site URL, list verified sites
        if (!siteUrl) {
            const sitesRes = await fetch(
                'https://www.googleapis.com/webmasters/v3/sites',
                { headers: { Authorization: `Bearer ${access_token}` } }
            );
            const sitesData = await sitesRes.json();
            return NextResponse.json({
                configured: true,
                sites: (sitesData.siteEntry || []).map((s: { siteUrl: string; permissionLevel: string }) => ({
                    url: s.siteUrl,
                    permission: s.permissionLevel,
                })),
            });
        }

        // Step 3: Fetch search analytics
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const analyticsRes = await fetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                    dimensions: [metric],
                    rowLimit: 100,
                }),
            }
        );

        if (!analyticsRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch GSC data' }, { status: 500 });
        }

        const data = await analyticsRes.json();

        // Process rows
        const rows = (data.rows || []).map((row: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
            key: row.keys[0],
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: (row.ctr * 100).toFixed(2),
            position: row.position.toFixed(1),
        }));

        // Summary totals
        const totals = rows.reduce(
            (acc: { clicks: number; impressions: number }, r: { clicks: number; impressions: number }) => ({
                clicks: acc.clicks + r.clicks,
                impressions: acc.impressions + r.impressions,
            }),
            { clicks: 0, impressions: 0 }
        );

        return NextResponse.json({
            configured: true,
            period: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
            dimension: metric,
            rows,
            totals: { ...totals, ctr: totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : '0' },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'GSC fetch failed' },
            { status: 500 }
        );
    }
}
