// ============================================================
// RankMaster Pro - Commission Rate Tracker API
// Track affiliate network commission changes, alert on cuts
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['log_rate', 'list', 'delete', 'get_history', 'calculate_impact']),
    program_id: z.string().uuid().optional(),
    network: z.string().max(100).optional(),
    program_name: z.string().max(200).optional(),
    old_rate: z.number().min(0).optional(),
    new_rate: z.number().min(0).optional(),
    commission_type: z.enum(['percentage', 'flat']).optional(),
    category: z.string().max(200).optional(),
    effective_date: z.string().optional(),
    notes: z.string().max(1000).optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'log_rate') {
        const { program_id, network, program_name, old_rate, new_rate, commission_type = 'percentage', category, effective_date, notes } = parsed.data;
        if (new_rate === undefined) return NextResponse.json({ error: 'new_rate required' }, { status: 400 });

        const change_pct = old_rate !== undefined && old_rate > 0 ? ((new_rate - old_rate) / old_rate) * 100 : null;
        const direction = change_pct === null ? 'initial' : change_pct > 0 ? 'increase' : change_pct < 0 ? 'decrease' : 'unchanged';

        const { data, error } = await auth.supabase.from('commission_history').insert({
            user_id: auth.user.id,
            program_id: program_id || null,
            network: network || 'direct',
            program_name: program_name || '',
            old_rate: old_rate ?? null,
            new_rate,
            commission_type,
            category: category || '',
            change_pct,
            direction,
            effective_date: effective_date || new Date().toISOString().split('T')[0],
            notes: notes || '',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // If rate decreased, create alert
        if (direction === 'decrease' && change_pct !== null && Math.abs(change_pct) >= 5) {
            await auth.supabase.from('commission_alerts').insert({
                user_id: auth.user.id,
                commission_history_id: data.id,
                program_name: program_name || network || '',
                old_rate,
                new_rate,
                change_pct,
                resolved: false,
            });
        }

        return NextResponse.json({ entry: data, alert_created: direction === 'decrease' });
    }

    if (action === 'calculate_impact') {
        const { program_id, old_rate, new_rate } = parsed.data;
        if (!program_id || old_rate === undefined || new_rate === undefined) {
            return NextResponse.json({ error: 'program_id, old_rate, new_rate required' }, { status: 400 });
        }
        if (old_rate <= 0) {
            return NextResponse.json({ error: 'old_rate must be greater than 0 to calculate impact' }, { status: 400 });
        }

        // Get revenue data for this program
        const { data: revenue } = await auth.supabase
            .from('affiliate_revenue')
            .select('amount, clicks, conversions, month')
            .eq('program_id', program_id)
            .order('month', { ascending: false })
            .limit(12);

        const totalRevenue = (revenue || []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
        const avgMonthly = revenue?.length ? totalRevenue / revenue.length : 0;
        const rateChange = ((new_rate - old_rate) / old_rate) * 100;
        const projectedMonthlyLoss = avgMonthly * (Math.abs(rateChange) / 100);
        const projectedAnnualLoss = projectedMonthlyLoss * 12;

        return NextResponse.json({
            impact: {
                rate_change_pct: rateChange,
                avg_monthly_revenue: avgMonthly,
                projected_monthly_impact: projectedMonthlyLoss * (new_rate < old_rate ? -1 : 1),
                projected_annual_impact: projectedAnnualLoss * (new_rate < old_rate ? -1 : 1),
                months_data: revenue?.length || 0,
            },
        });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('commission_history').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'history';
    const programId = searchParams.get('program_id');

    if (view === 'alerts') {
        const { data } = await auth.supabase.from('commission_alerts').select('*').eq('user_id', auth.user.id).eq('resolved', false).order('created_at', { ascending: false });
        return NextResponse.json({ alerts: data || [] });
    }

    if (view === 'summary') {
        const { data: history } = await auth.supabase.from('commission_history').select('network, program_name, new_rate, direction, effective_date').eq('user_id', auth.user.id).order('effective_date', { ascending: false });

        // Group by program, get latest rate
        const programs = new Map<string, { name: string; network: string; current_rate: number; changes: number; last_cut: string | null }>();
        for (const h of history || []) {
            const key = h.program_name || h.network;
            if (!programs.has(key)) programs.set(key, { name: h.program_name, network: h.network, current_rate: h.new_rate, changes: 1, last_cut: h.direction === 'decrease' ? h.effective_date : null });
            else {
                const p = programs.get(key)!;
                p.changes++;
                if (h.direction === 'decrease' && !p.last_cut) p.last_cut = h.effective_date;
            }
        }

        return NextResponse.json({ programs: [...programs.values()], total_logged: history?.length || 0 });
    }

    let query = auth.supabase.from('commission_history').select('*').eq('user_id', auth.user.id).order('effective_date', { ascending: false });
    if (programId) query = query.eq('program_id', programId);
    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ history: data || [] });
}
