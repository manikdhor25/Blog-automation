import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const GenerateSchema = z.object({
    action: z.literal('generate'),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    site_id: z.string().uuid().optional(),
    include_goals: z.boolean().default(true),
    include_top_posts: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'generate') {
        const parsed = GenerateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const [year, month] = d.month.split('-').map(Number);
        const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;

        // Affiliate earnings this month
        let earningsQ = supabase.from('affiliate_earnings').select('program, revenue, clicks, conversions, network').eq('user_id', user.id).eq('month', d.month);
        if (d.site_id) earningsQ = earningsQ.eq('site_id', d.site_id);
        const { data: earnings } = await earningsQ;

        let prevEarningsQ = supabase.from('affiliate_earnings').select('revenue').eq('user_id', user.id).eq('month', prevMonth);
        if (d.site_id) prevEarningsQ = prevEarningsQ.eq('site_id', d.site_id);
        const { data: prevEarnings } = await prevEarningsQ;

        // Click tracker revenue
        const monthStart = new Date(year, month - 1, 1).toISOString();
        const monthEnd = new Date(year, month, 0, 23, 59, 59).toISOString();
        const { data: clicks } = await supabase.from('link_clicks').select('converted, commission_amount').eq('user_id', user.id).gte('created_at', monthStart).lte('created_at', monthEnd);

        // Posts published this month
        let postsQ = supabase.from('posts').select('id, title, slug, word_count').eq('user_id', user.id).gte('created_at', monthStart).lte('created_at', monthEnd);
        if (d.site_id) postsQ = postsQ.eq('site_id', d.site_id);
        const { data: newPosts } = await postsQ;

        // Rank positions
        const { data: topRanks } = await supabase.from('rank_positions').select('keyword, position').lte('position', 10).eq('user_id', user.id).order('position').limit(10);

        // Goals
        const { data: goals } = await supabase.from('revenue_goals').select('*').eq('user_id', user.id).eq('status', 'active');

        // Compile report data
        const affiliateRevenue = (earnings || []).reduce((s, e) => s + (e.revenue || 0), 0);
        const clickRevenue = (clicks || []).filter(c => c.converted).reduce((s, c) => s + (c.commission_amount || 0), 0);
        const totalRevenue = affiliateRevenue + clickRevenue;
        const prevRevenue = (prevEarnings || []).reduce((s, e) => s + (e.revenue || 0), 0);
        const revChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : null;

        const byProgram = (earnings || []).reduce((acc: Record<string, number>, e) => {
            acc[e.program] = (acc[e.program] || 0) + e.revenue;
            return acc;
        }, {});

        const report = {
            month: d.month,
            total_revenue: totalRevenue,
            affiliate_revenue: affiliateRevenue,
            click_revenue: clickRevenue,
            prev_month_revenue: prevRevenue,
            revenue_change_pct: revChange,
            total_clicks: (clicks || []).length,
            total_conversions: (clicks || []).filter(c => c.converted).length,
            conversion_rate: (clicks || []).length > 0 ? (((clicks || []).filter(c => c.converted).length / (clicks || []).length) * 100).toFixed(1) : '0',
            by_program: byProgram,
            top_program: Object.entries(byProgram).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
            new_posts: newPosts?.length || 0,
            new_posts_list: newPosts?.map(p => ({ title: p.title, words: p.word_count })) || [],
            top_rankings: topRanks || [],
            goals: d.include_goals ? (goals || []).map(g => ({ name: g.goal_name, target: g.target_monthly_rev, current: g.current_monthly_rev, progress_pct: ((g.current_monthly_rev / g.target_monthly_rev) * 100).toFixed(0) })) : [],
            generated_at: new Date().toISOString(),
        };

        // Generate HTML report
        const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
        const html = generateReportHtml(report, monthName);

        return NextResponse.json({ report, html });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

function generateReportHtml(r: Record<string, unknown>, monthName: string): string {
    const byProgram = r.by_program as Record<string, number>;
    const programRows = Object.entries(byProgram).sort((a, b) => b[1] - a[1]).map(([prog, rev]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${prog}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#16a34a">$${(rev as number).toFixed(2)}</td></tr>`
    ).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Income Report - ${monthName}</title></head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:40px;color:#333">
<div style="text-align:center;margin-bottom:40px">
    <h1 style="font-size:2rem;font-weight:900;color:#1e40af">Monthly Income Report</h1>
    <h2 style="font-size:1.3rem;color:#6b7280;font-weight:400">${monthName}</h2>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:32px">
    <div style="text-align:center;padding:20px;background:#f0fdf4;border-radius:10px">
        <div style="font-size:0.8rem;color:#6b7280;margin-bottom:4px">Total Revenue</div>
        <div style="font-size:2rem;font-weight:900;color:#16a34a">$${(r.total_revenue as number).toFixed(2)}</div>
        ${r.revenue_change_pct ? `<div style="font-size:0.8rem;color:${parseFloat(r.revenue_change_pct as string) >= 0 ? '#16a34a' : '#dc2626'}">${parseFloat(r.revenue_change_pct as string) >= 0 ? 'â–²' : 'â–¼'}${Math.abs(parseFloat(r.revenue_change_pct as string))}% vs last month</div>` : ''}
    </div>
    <div style="text-align:center;padding:20px;background:#eff6ff;border-radius:10px">
        <div style="font-size:0.8rem;color:#6b7280;margin-bottom:4px">Total Clicks</div>
        <div style="font-size:2rem;font-weight:900;color:#2563eb">${r.total_clicks}</div>
        <div style="font-size:0.8rem;color:#6b7280">${r.conversion_rate}% conversion</div>
    </div>
    <div style="text-align:center;padding:20px;background:#faf5ff;border-radius:10px">
        <div style="font-size:0.8rem;color:#6b7280;margin-bottom:4px">New Posts</div>
        <div style="font-size:2rem;font-weight:900;color:#7c3aed">${r.new_posts}</div>
        <div style="font-size:0.8rem;color:#6b7280">published</div>
    </div>
</div>

${programRows ? `<h3 style="margin-bottom:12px">Revenue by Program</h3>
<table style="width:100%;border-collapse:collapse;margin-bottom:32px">
    <thead><tr style="background:#1e40af;color:#fff"><th style="padding:10px 12px;text-align:left">Program</th><th style="padding:10px 12px;text-align:right">Revenue</th></tr></thead>
    <tbody>${programRows}</tbody>
</table>` : ''}

<div style="margin-top:32px;padding:16px;background:#f8fafc;border-radius:6px;text-align:center;font-size:0.8rem;color:#6b7280">
    Generated by RankMaster Pro Â· ${new Date().toLocaleDateString()}
</div>
</body></html>`;
}
