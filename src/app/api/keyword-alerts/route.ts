import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/utils/safe-url';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const CreateAlertSchema = z.object({
    action: z.literal('create'),
    keyword: z.string().min(1),
    site_id: z.string().uuid().optional(),
    alert_type: z.enum(['enters_top_10', 'enters_top_3', 'drops_from_top_3', 'drops_from_top_10', 'position_change', 'custom']),
    threshold_position: z.number().int().min(1).max(100).optional(),
    change_threshold: z.number().int().min(1).optional(),
    notify_email: z.boolean().default(true),
    notify_webhook: z.boolean().default(false),
    webhook_url: z.string().url().optional(),
});

const CheckAlertsSchema = z.object({
    action: z.literal('check'),
    keyword: z.string().min(1),
    current_position: z.number().int().min(1),
    previous_position: z.number().int().min(1).optional(),
    site_id: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');

    let query = supabase.from('keyword_alerts').select('*, keyword_alert_history(count)').eq('user_id', user.id).order('created_at', { ascending: false });
    if (siteId) query = query.eq('site_id', siteId);

    const { data: alerts } = await query;
    const { data: history } = await supabase.from('keyword_alert_history')
        .select('*').eq('user_id', user.id).order('triggered_at', { ascending: false }).limit(30);

    return NextResponse.json({ alerts: alerts || [], history: history || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create') {
        const parsed = CreateAlertSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data, error } = await supabase.from('keyword_alerts').insert({
            user_id: user.id, keyword: d.keyword, site_id: d.site_id || null,
            alert_type: d.alert_type, threshold_position: d.threshold_position || null,
            change_threshold: d.change_threshold || null, notify_email: d.notify_email,
            notify_webhook: d.notify_webhook, webhook_url: d.webhook_url || null,
            is_active: true, trigger_count: 0,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ alert: data });
    }

    if (body.action === 'check') {
        const parsed = CheckAlertsSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: alerts } = await supabase.from('keyword_alerts')
            .select('*').eq('user_id', user.id).eq('keyword', d.keyword).eq('is_active', true);

        const triggered = [];
        for (const alert of alerts || []) {
            let shouldTrigger = false;
            let message = '';

            if (alert.alert_type === 'enters_top_10' && d.current_position <= 10 && (!d.previous_position || d.previous_position > 10)) {
                shouldTrigger = true; message = `"${d.keyword}" entered top 10 at position ${d.current_position}`;
            } else if (alert.alert_type === 'enters_top_3' && d.current_position <= 3 && (!d.previous_position || d.previous_position > 3)) {
                shouldTrigger = true; message = `"${d.keyword}" entered top 3 at position ${d.current_position} ðŸŽ‰`;
            } else if (alert.alert_type === 'drops_from_top_3' && d.current_position > 3 && d.previous_position && d.previous_position <= 3) {
                shouldTrigger = true; message = `"${d.keyword}" dropped from top 3 (now #${d.current_position})`;
            } else if (alert.alert_type === 'drops_from_top_10' && d.current_position > 10 && d.previous_position && d.previous_position <= 10) {
                shouldTrigger = true; message = `"${d.keyword}" dropped from top 10 (now #${d.current_position})`;
            } else if (alert.alert_type === 'position_change' && d.previous_position) {
                const change = Math.abs(d.current_position - d.previous_position);
                if (change >= (alert.change_threshold || 5)) {
                    shouldTrigger = true;
                    const direction = d.current_position < d.previous_position ? 'ðŸ“ˆ up' : 'ðŸ“‰ down';
                    message = `"${d.keyword}" moved ${direction} ${change} positions (now #${d.current_position})`;
                }
            } else if (alert.alert_type === 'custom' && alert.threshold_position && d.current_position <= alert.threshold_position) {
                shouldTrigger = true; message = `"${d.keyword}" reached position ${d.current_position} (threshold: #${alert.threshold_position})`;
            }

            if (shouldTrigger) {
                await supabase.from('keyword_alert_history').insert({
                    user_id: user.id, alert_id: alert.id, keyword: d.keyword,
                    previous_position: d.previous_position || null, current_position: d.current_position,
                    message, triggered_at: new Date().toISOString(),
                });
                await supabase.from('keyword_alerts').update({ trigger_count: (alert.trigger_count || 0) + 1, last_triggered: new Date().toISOString() }).eq('id', alert.id);

                // Fire webhook if configured
                if (alert.notify_webhook && alert.webhook_url) {
                    await safeFetch(alert.webhook_url, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ alert_type: alert.alert_type, keyword: d.keyword, position: d.current_position, message }),
                    }).catch(() => { });
                }

                triggered.push({ alert_id: alert.id, message });
            }
        }

        return NextResponse.json({ checked: true, triggered });
    }

    if (body.action === 'toggle') {
        await supabase.from('keyword_alerts').update({ is_active: body.active }).eq('id', body.alert_id).eq('user_id', user.id);
        return NextResponse.json({ toggled: true });
    }

    if (body.action === 'delete') {
        await supabase.from('keyword_alerts').delete().eq('id', body.alert_id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
