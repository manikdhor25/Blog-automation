import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const ModelSchema = z.object({
    action: z.literal('model'),
    monthly_visitors: z.number().int().min(1),
    traffic_growth_pct_monthly: z.number().min(0).max(100).default(5),
    affiliate_ctr_pct: z.number().min(0).max(100).default(2),
    affiliate_conversion_pct: z.number().min(0).max(100).default(3),
    avg_commission: z.number().min(0).default(50),
    adsense_rpm: z.number().min(0).default(3),
    email_list_size: z.number().int().min(0).default(0),
    email_conversion_pct: z.number().min(0).default(1),
    avg_product_price: z.number().min(0).default(97),
    sponsored_posts_per_month: z.number().min(0).default(0),
    avg_sponsored_rate: z.number().min(0).default(500),
    months_to_project: z.number().int().min(1).max(36).default(12),
    name: z.string().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('revenue_models').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
    return NextResponse.json({ models: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'model') {
        const parsed = ModelSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const months: Array<{
            month: number; visitors: number; affiliate_clicks: number;
            affiliate_conversions: number; affiliate_revenue: number;
            adsense_revenue: number; email_revenue: number;
            sponsored_revenue: number; total_revenue: number;
        }> = [];

        let currentVisitors = d.monthly_visitors;
        let emailListSize = d.email_list_size;
        const growthMultiplier = 1 + (d.traffic_growth_pct_monthly / 100);

        for (let m = 1; m <= d.months_to_project; m++) {
            const affiliateClicks = Math.round(currentVisitors * (d.affiliate_ctr_pct / 100));
            const affiliateConversions = Math.round(affiliateClicks * (d.affiliate_conversion_pct / 100));
            const affiliateRevenue = affiliateConversions * d.avg_commission;
            const adsenseRevenue = (currentVisitors / 1000) * d.adsense_rpm;
            const emailRevenue = m % 3 === 0 ? Math.round(emailListSize * (d.email_conversion_pct / 100)) * d.avg_product_price : 0;
            const sponsoredRevenue = d.sponsored_posts_per_month * d.avg_sponsored_rate;
            const totalRevenue = affiliateRevenue + adsenseRevenue + emailRevenue + sponsoredRevenue;

            months.push({ month: m, visitors: Math.round(currentVisitors), affiliate_clicks: affiliateClicks, affiliate_conversions: affiliateConversions, affiliate_revenue: Math.round(affiliateRevenue), adsense_revenue: Math.round(adsenseRevenue), email_revenue: Math.round(emailRevenue), sponsored_revenue: Math.round(sponsoredRevenue), total_revenue: Math.round(totalRevenue) });

            currentVisitors *= growthMultiplier;
            emailListSize = Math.round(emailListSize * 1.02 + currentVisitors * 0.001);
        }

        const totalRevenue12m = months.slice(0, 12).reduce((s, m) => s + m.total_revenue, 0);
        const totalRevenueFull = months.reduce((s, m) => s + m.total_revenue, 0);
        const breakEvenMonth = months.findIndex(m => m.total_revenue >= 1000) + 1 || null;
        const month12Revenue = months[11]?.total_revenue || 0;
        const month12Visitors = months[11]?.visitors || 0;

        const summary = {
            total_12m_revenue: totalRevenue12m,
            total_full_revenue: totalRevenueFull,
            month_12_revenue: month12Revenue,
            month_12_visitors: month12Visitors,
            break_even_month: breakEvenMonth,
            dominant_revenue_source: ['affiliate', 'adsense', 'email', 'sponsored'].reduce((best, src) => {
                const totals = { affiliate: months.reduce((s, m) => s + m.affiliate_revenue, 0), adsense: months.reduce((s, m) => s + m.adsense_revenue, 0), email: months.reduce((s, m) => s + m.email_revenue, 0), sponsored: months.reduce((s, m) => s + m.sponsored_revenue, 0) };
                return totals[src as keyof typeof totals] > totals[best as keyof typeof totals] ? src : best;
            }, 'affiliate'),
        };

        // Save model
        await supabase.from('revenue_models').insert({
            user_id: user.id, name: d.name || `Model ${new Date().toLocaleDateString()}`,
            input_params: d, months_data: months, summary,
        });

        return NextResponse.json({ months, summary });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
