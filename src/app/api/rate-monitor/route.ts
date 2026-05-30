import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const AddSchema = z.object({
    action: z.literal('add'),
    program_name: z.string().min(1),
    network: z.string().optional(),
    category: z.string().optional(),
    current_rate: z.number().min(0),
    rate_type: z.enum(['percentage', 'flat', 'cpa']).default('percentage'),
    alert_threshold_pct: z.number().min(1).max(100).default(10),
    site_id: z.string().uuid().optional(),
    notes: z.string().optional(),
});

const LogChangeSchema = z.object({
    action: z.literal('log_change'),
    monitor_id: z.string().uuid(),
    new_rate: z.number().min(0),
    change_reason: z.string().optional(),
    effective_date: z.string().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data: monitors } = await supabase.from('rate_monitors').select('*, rate_change_history(rate, change_pct, logged_at)').eq('user_id', user.id).order('created_at', { ascending: false });
    return NextResponse.json({ monitors: monitors || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'add') {
        const parsed = AddSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data } = await supabase.from('rate_monitors').insert({
            user_id: user.id, site_id: d.site_id || null,
            program_name: d.program_name, network: d.network || null,
            category: d.category || null, current_rate: d.current_rate,
            original_rate: d.current_rate, rate_type: d.rate_type,
            alert_threshold_pct: d.alert_threshold_pct,
            notes: d.notes || '', is_active: true,
        }).select().single();

        return NextResponse.json({ monitor: data });
    }

    if (body.action === 'log_change') {
        const parsed = LogChangeSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: monitor } = await supabase.from('rate_monitors').select('current_rate, program_name, alert_threshold_pct').eq('id', d.monitor_id).single();
        if (!monitor) return NextResponse.json({ error: 'Monitor not found' }, { status: 404 });

        const changePct = ((d.new_rate - monitor.current_rate) / monitor.current_rate) * 100;
        const isAlert = Math.abs(changePct) >= monitor.alert_threshold_pct;

        await supabase.from('rate_change_history').insert({
            user_id: user.id, monitor_id: d.monitor_id,
            old_rate: monitor.current_rate, rate: d.new_rate,
            change_pct: changePct, change_reason: d.change_reason || null,
            effective_date: d.effective_date || new Date().toISOString().substring(0, 10),
            logged_at: new Date().toISOString(),
        });

        await supabase.from('rate_monitors').update({ current_rate: d.new_rate, last_checked: new Date().toISOString() }).eq('id', d.monitor_id);

        // Create notification if significant change
        if (isAlert) {
            await supabase.from('notifications').insert({
                user_id: user.id, type: 'commission',
                title: `Rate Change: ${monitor.program_name}`,
                message: `Commission rate changed ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% (${monitor.current_rate}% â†’ ${d.new_rate}%)`,
                priority: Math.abs(changePct) >= 25 ? 'high' : 'medium', is_read: false, metadata: {},
            });
        }

        return NextResponse.json({ logged: true, change_pct: changePct.toFixed(1), is_alert: isAlert });
    }

    if (body.action === 'delete') {
        await supabase.from('rate_monitors').delete().eq('id', body.monitor_id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
