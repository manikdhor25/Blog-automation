// ============================================================
// RankMaster Pro - Affiliate Revenue Forecaster API
// Traffic × CTR × conversion × avg_order = projected revenue
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['forecast', 'set_targets', 'get_targets', 'save_forecast']),
    site_id: z.string().uuid().optional(),
    months_ahead: z.number().int().min(1).max(24).default(3).optional(),
    growth_rate_pct: z.number().min(-50).max(200).default(10).optional(),
    avg_order_value: z.number().min(0).default(50).optional(),
    monthly_revenue_target: z.number().min(0).optional(),
    traffic_target: z.number().int().min(0).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'forecast') {
        const { site_id, months_ahead = 3, growth_rate_pct = 10, avg_order_value = 50 } = parsed.data;

        // Get historical data
        const [revRes, linksRes, kwRes] = await Promise.all([
            auth.supabase.from('affiliate_revenue').select('amount, month').eq('user_id', auth.user.id).order('month', { ascending: false }).limit(6),
            auth.supabase.from('affiliate_links').select('clicks, conversions').eq('user_id', auth.user.id),
            auth.supabase.from('keywords').select('search_volume, status').eq('user_id', auth.user.id).eq('status', 'ranking'),
        ]);

        const revenue = revRes.data || [];
        const links = linksRes.data || [];
        const rankingKws = kwRes.data || [];

        // Calculate current metrics
        const avgMonthlyRevenue = revenue.length ? revenue.reduce((s: number, r: { amount: number }) => s + r.amount, 0) / revenue.length : 0;
        const totalClicks = links.reduce((s, l) => s + (l.clicks || 0), 0);
        const totalConversions = links.reduce((s, l) => s + (l.conversions || 0), 0);
        const conversionRate = totalClicks > 0 ? totalConversions / totalClicks : 0.02;
        const estimatedMonthlyTraffic = rankingKws.reduce((s, k) => s + (k.search_volume || 0) * 0.03, 0); // 3% CTR estimate
        const affiliateCTR = estimatedMonthlyTraffic > 0 ? totalClicks / estimatedMonthlyTraffic : 0.05;

        // Build monthly forecast
        const monthlyRate = growth_rate_pct / 100 / 12;
        const forecast = [];
        let currentRevenue = avgMonthlyRevenue || (estimatedMonthlyTraffic * affiliateCTR * conversionRate * avg_order_value);

        for (let i = 1; i <= months_ahead; i++) {
            const date = new Date();
            date.setMonth(date.getMonth() + i);
            const projectedRevenue = currentRevenue * (1 + monthlyRate * i);
            const projectedTraffic = Math.round(estimatedMonthlyTraffic * Math.pow(1 + monthlyRate, i));
            const projectedClicks = Math.round(projectedTraffic * affiliateCTR);
            const projectedConversions = Math.round(projectedClicks * conversionRate);

            forecast.push({
                month: date.toISOString().substring(0, 7),
                projected_revenue: parseFloat(projectedRevenue.toFixed(2)),
                projected_traffic: projectedTraffic,
                projected_clicks: projectedClicks,
                projected_conversions: projectedConversions,
                growth_vs_current: parseFloat(((projectedRevenue - currentRevenue) / Math.max(currentRevenue, 1) * 100).toFixed(1)),
            });
        }

        // Revenue milestones
        const annual = forecast.reduce((s, m) => s + m.projected_revenue, 0) + avgMonthlyRevenue * (12 - months_ahead);
        const milestones = [
            { amount: 100, label: '$100/mo', reached: avgMonthlyRevenue >= 100 || forecast.some(f => f.projected_revenue >= 100) },
            { amount: 500, label: '$500/mo', reached: avgMonthlyRevenue >= 500 || forecast.some(f => f.projected_revenue >= 500) },
            { amount: 1000, label: '$1K/mo', reached: avgMonthlyRevenue >= 1000 || forecast.some(f => f.projected_revenue >= 1000) },
            { amount: 5000, label: '$5K/mo', reached: avgMonthlyRevenue >= 5000 || forecast.some(f => f.projected_revenue >= 5000) },
            { amount: 10000, label: '$10K/mo', reached: avgMonthlyRevenue >= 10000 || forecast.some(f => f.projected_revenue >= 10000) },
        ];

        return NextResponse.json({
            current: {
                avg_monthly_revenue: parseFloat(avgMonthlyRevenue.toFixed(2)),
                estimated_monthly_traffic: Math.round(estimatedMonthlyTraffic),
                affiliate_ctr: parseFloat((affiliateCTR * 100).toFixed(2)),
                conversion_rate: parseFloat((conversionRate * 100).toFixed(2)),
                ranking_keywords: rankingKws.length,
            },
            forecast,
            annual_projection: parseFloat(annual.toFixed(2)),
            milestones,
            assumptions: { growth_rate_pct, avg_order_value, months_ahead },
        });
    }

    if (action === 'set_targets') {
        const { monthly_revenue_target, traffic_target } = parsed.data;
        await auth.supabase.from('settings').upsert({
            category: 'goals',
            key: 'revenue_targets',
            value: JSON.stringify({ monthly_revenue_target, traffic_target }),
        }, { onConflict: 'key' });
        return NextResponse.json({ success: true });
    }

    if (action === 'get_targets') {
        const { data } = await auth.supabase.from('settings').select('value').eq('key', 'revenue_targets').single();
        const targets = data?.value ? JSON.parse(data.value) : { monthly_revenue_target: 0, traffic_target: 0 };
        return NextResponse.json({ targets });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
