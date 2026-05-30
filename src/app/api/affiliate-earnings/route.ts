import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const AddEarningSchema = z.object({
    action: z.literal('add'),
    program: z.string().min(1),
    network: z.string().default(''),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    clicks: z.number().int().min(0).default(0),
    conversions: z.number().int().min(0).default(0),
    revenue: z.number().min(0),
    currency: z.string().default('USD'),
    site_id: z.string().uuid().optional(),
    notes: z.string().optional(),
});

const ImportSchema = z.object({
    action: z.literal('import_csv'),
    rows: z.array(z.object({
        program: z.string(),
        month: z.string(),
        revenue: z.number(),
        clicks: z.number().optional(),
        conversions: z.number().optional(),
    })).min(1),
    site_id: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const months = parseInt(url.searchParams.get('months') || '12');
    const siteId = url.searchParams.get('site_id');

    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const sinceMonth = since.toISOString().substring(0, 7);

    let q = supabase.from('affiliate_earnings').select('*').eq('user_id', user.id).gte('month', sinceMonth).order('month', { ascending: false });
    if (siteId) q = q.eq('site_id', siteId);
    const { data: earnings } = await q;

    // Aggregate by program
    const byProgram: Record<string, { total_revenue: number; total_clicks: number; total_conversions: number; months: number }> = {};
    for (const e of earnings || []) {
        if (!byProgram[e.program]) byProgram[e.program] = { total_revenue: 0, total_clicks: 0, total_conversions: 0, months: 0 };
        byProgram[e.program].total_revenue += e.revenue || 0;
        byProgram[e.program].total_clicks += e.clicks || 0;
        byProgram[e.program].total_conversions += e.conversions || 0;
        byProgram[e.program].months++;
    }

    // Monthly totals
    const byMonth: Record<string, number> = {};
    for (const e of earnings || []) {
        byMonth[e.month] = (byMonth[e.month] || 0) + (e.revenue || 0);
    }

    const totalRevenue = (earnings || []).reduce((sum, e) => sum + (e.revenue || 0), 0);
    const totalClicks = (earnings || []).reduce((sum, e) => sum + (e.clicks || 0), 0);

    return NextResponse.json({
        earnings: earnings || [],
        by_program: byProgram,
        by_month: byMonth,
        stats: {
            total_revenue: totalRevenue,
            total_clicks: totalClicks,
            avg_monthly: totalRevenue / months,
            epc: totalClicks > 0 ? (totalRevenue / totalClicks).toFixed(4) : '0',
            top_program: Object.entries(byProgram).sort((a, b) => b[1].total_revenue - a[1].total_revenue)[0]?.[0] || 'N/A',
        },
    });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'add') {
        const parsed = AddEarningSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data, error } = await supabase.from('affiliate_earnings').upsert({
            user_id: user.id, program: d.program, network: d.network, month: d.month,
            clicks: d.clicks, conversions: d.conversions, revenue: d.revenue,
            currency: d.currency, site_id: d.site_id || null, notes: d.notes || '',
        }, { onConflict: 'user_id,program,month' }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ earning: data });
    }

    if (body.action === 'import_csv') {
        const parsed = ImportSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        let imported = 0;
        for (const row of parsed.data.rows) {
            await supabase.from('affiliate_earnings').upsert({
                user_id: user.id, program: row.program, network: '', month: row.month,
                clicks: row.clicks || 0, conversions: row.conversions || 0, revenue: row.revenue,
                currency: 'USD', site_id: parsed.data.site_id || null, notes: '',
            }, { onConflict: 'user_id,program,month' });
            imported++;
        }
        return NextResponse.json({ imported });
    }

    if (body.action === 'delete') {
        await supabase.from('affiliate_earnings').delete().eq('id', body.id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
