// ============================================================
// RankMaster Pro - Niche Site Valuation API
// Estimate site sale value: revenue multiples + traffic + DA
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['calculate', 'save_snapshot', 'get_history']),
    site_id: z.string().uuid().optional(),
    monthly_revenue: z.number().min(0).optional(),
    monthly_sessions: z.number().int().min(0).optional(),
    domain_authority: z.number().min(0).max(100).optional(),
    domain_age_years: z.number().min(0).optional(),
    niche_type: z.enum(['affiliate', 'display_ads', 'saas', 'ecommerce', 'info', 'mixed']).optional(),
    revenue_trend: z.enum(['growing', 'stable', 'declining']).optional(),
    content_count: z.number().int().min(0).optional(),
    email_subscribers: z.number().int().min(0).optional(),
});

// Industry-standard multiples (based on Empire Flippers, Flippa, FE International data)
const MULTIPLES: Record<string, { low: number; mid: number; high: number }> = {
    affiliate: { low: 28, mid: 36, high: 48 },
    display_ads: { low: 24, mid: 32, high: 40 },
    saas: { low: 48, mid: 60, high: 84 },
    ecommerce: { low: 20, mid: 28, high: 36 },
    info: { low: 20, mid: 28, high: 36 },
    mixed: { low: 24, mid: 33, high: 44 },
};

function calcValuation(params: {
    monthly_revenue: number;
    niche_type: string;
    domain_authority: number;
    domain_age_years: number;
    revenue_trend: string;
    monthly_sessions: number;
    content_count: number;
    email_subscribers: number;
}) {
    const base = MULTIPLES[params.niche_type] || MULTIPLES.mixed;
    let multiplier = base.mid;

    // DA adjustment
    if (params.domain_authority >= 50) multiplier += 4;
    else if (params.domain_authority >= 30) multiplier += 2;
    else if (params.domain_authority < 15) multiplier -= 3;

    // Domain age adjustment
    if (params.domain_age_years >= 5) multiplier += 3;
    else if (params.domain_age_years >= 3) multiplier += 1;
    else if (params.domain_age_years < 1) multiplier -= 4;

    // Revenue trend
    if (params.revenue_trend === 'growing') multiplier += 5;
    else if (params.revenue_trend === 'declining') multiplier -= 8;

    // Traffic (RPM proxy)
    if (params.monthly_sessions > 100000) multiplier += 3;
    else if (params.monthly_sessions > 50000) multiplier += 1;

    // Email list bonus
    if (params.email_subscribers > 10000) multiplier += 4;
    else if (params.email_subscribers > 1000) multiplier += 2;

    // Content depth
    if (params.content_count > 200) multiplier += 2;
    else if (params.content_count > 50) multiplier += 1;

    multiplier = Math.max(15, Math.min(100, multiplier));

    const lowMult = base.low;
    const highMult = Math.min(base.high + 10, multiplier + 8);

    return {
        valuation_low: Math.round(params.monthly_revenue * lowMult),
        valuation_mid: Math.round(params.monthly_revenue * multiplier),
        valuation_high: Math.round(params.monthly_revenue * highMult),
        applied_multiple: multiplier,
        multiple_range: `${lowMult}x – ${highMult}x`,
        annual_revenue: params.monthly_revenue * 12,
        revenue_per_session: params.monthly_sessions > 0 ? parseFloat((params.monthly_revenue / params.monthly_sessions * 1000).toFixed(3)) : 0,
        factors: {
            da_impact: params.domain_authority >= 50 ? '+4 months' : params.domain_authority >= 30 ? '+2 months' : '-3 months',
            age_impact: params.domain_age_years >= 5 ? '+3 months' : params.domain_age_years >= 3 ? '+1 month' : '-4 months',
            trend_impact: params.revenue_trend === 'growing' ? '+5 months' : params.revenue_trend === 'declining' ? '-8 months' : '0',
            email_impact: params.email_subscribers > 1000 ? '+2 months' : '0',
        },
    };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'calculate') {
        const { site_id, monthly_revenue = 0, monthly_sessions = 0, domain_authority = 20, domain_age_years = 1, niche_type = 'mixed', revenue_trend = 'stable', content_count = 0, email_subscribers = 0 } = parsed.data;

        // Auto-fill from DB if site_id provided
        let autoRevenue = monthly_revenue;
        let autoSessions = monthly_sessions;
        let autoDA = domain_authority;
        let autoContent = content_count;

        if (site_id) {
            const [revRes, postsRes, blRes] = await Promise.all([
                auth.supabase.from('affiliate_revenue').select('amount').eq('user_id', auth.user.id).order('month', { ascending: false }).limit(1),
                auth.supabase.from('posts').select('id', { count: 'exact', head: true }).eq('site_id', site_id).eq('user_id', auth.user.id).eq('status', 'published'),
                auth.supabase.from('backlinks').select('domain_authority').eq('site_id', site_id).eq('user_id', auth.user.id).order('domain_authority', { ascending: false }).limit(1),
            ]);

            if (!monthly_revenue && revRes.data?.[0]) autoRevenue = revRes.data[0].amount;
            if (!content_count) autoContent = (postsRes.count as number) || 0;
            if (!domain_authority && blRes.data?.[0]) autoDA = blRes.data[0].domain_authority;
        }

        const result = calcValuation({
            monthly_revenue: autoRevenue,
            niche_type: niche_type || 'mixed',
            domain_authority: autoDA,
            domain_age_years: domain_age_years || 1,
            revenue_trend: revenue_trend || 'stable',
            monthly_sessions: autoSessions,
            content_count: autoContent,
            email_subscribers: email_subscribers || 0,
        });

        return NextResponse.json({ valuation: result, inputs: { monthly_revenue: autoRevenue, monthly_sessions: autoSessions, domain_authority: autoDA, content_count: autoContent } });
    }

    if (action === 'save_snapshot') {
        const { site_id, ...inputs } = parsed.data;
        const result = calcValuation({
            monthly_revenue: inputs.monthly_revenue || 0,
            niche_type: inputs.niche_type || 'mixed',
            domain_authority: inputs.domain_authority || 20,
            domain_age_years: inputs.domain_age_years || 1,
            revenue_trend: inputs.revenue_trend || 'stable',
            monthly_sessions: inputs.monthly_sessions || 0,
            content_count: inputs.content_count || 0,
            email_subscribers: inputs.email_subscribers || 0,
        });

        await auth.supabase.from('valuation_snapshots').insert({
            user_id: auth.user.id, site_id: site_id || null,
            monthly_revenue: inputs.monthly_revenue || 0,
            valuation_mid: result.valuation_mid,
            applied_multiple: result.applied_multiple,
            snapshot_date: new Date().toISOString().split('T')[0],
        });

        return NextResponse.json({ success: true, valuation: result });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const siteId = new URL(request.url).searchParams.get('site_id');
    let query = auth.supabase.from('valuation_snapshots').select('*').eq('user_id', auth.user.id).order('snapshot_date', { ascending: true });
    if (siteId) query = query.eq('site_id', siteId);
    const { data } = await query.limit(50);
    return NextResponse.json({ history: data || [] });
}
