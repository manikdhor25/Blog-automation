// ============================================================
// RankMaster Pro - Zapier/Make Webhook Builder API
// Create outbound webhooks for no-code automation
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const TRIGGER_EVENTS = [
    { id: 'post_published', label: 'Post Published', description: 'Fires when a post is pushed to WordPress' },
    { id: 'post_decay_alert', label: 'Decay Alert Triggered', description: 'Fires when a post drops in rankings' },
    { id: 'rank_improved', label: 'Keyword Ranks Top 3', description: 'Fires when keyword enters top 3' },
    { id: 'affiliate_sale', label: 'Affiliate Revenue Logged', description: 'Fires when revenue is recorded' },
    { id: 'review_generated', label: 'Review Generated', description: 'Fires when AI review is generated' },
    { id: 'link_broken', label: 'Broken Link Detected', description: 'Fires when affiliate link breaks' },
    { id: 'haro_opportunity', label: 'HARO Opportunity Found', description: 'Fires on new HARO query match' },
    { id: 'content_idea', label: 'Content Ideas Generated', description: 'Fires when new ideas are discovered' },
    { id: 'site_health_drop', label: 'Site Health Score Drops', description: 'Fires when health score falls below threshold' },
];

const Schema = z.object({
    action: z.enum(['create', 'update', 'delete', 'list', 'test', 'get_events']),
    id: z.string().uuid().optional(),
    name: z.string().max(200).optional(),
    webhook_url: z.string().url().optional(),
    trigger_events: z.array(z.string()).optional(),
    include_payload: z.boolean().default(true).optional(),
    is_active: z.boolean().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    platform: z.enum(['zapier', 'make', 'n8n', 'custom']).default('zapier').optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'get_events') {
        return NextResponse.json({ events: TRIGGER_EVENTS });
    }

    if (action === 'create') {
        const { name, webhook_url, trigger_events, include_payload, platform, headers } = parsed.data;
        if (!name || !webhook_url || !trigger_events?.length) return NextResponse.json({ error: 'name, webhook_url, trigger_events required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('automation_webhooks').insert({
            user_id: auth.user.id,
            name,
            webhook_url,
            trigger_events,
            include_payload: include_payload ?? true,
            platform: platform || 'zapier',
            custom_headers: headers || {},
            is_active: true,
            fire_count: 0,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ webhook: data });
    }

    if (action === 'test') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data: webhook } = await auth.supabase.from('automation_webhooks').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!webhook) return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });

        // Send test payload
        const testPayload = {
            event: 'test',
            source: 'RankMaster Pro',
            timestamp: new Date().toISOString(),
            data: {
                user_id: auth.user.id,
                message: 'Test webhook from RankMaster Pro',
                platform: webhook.platform,
            },
        };

        try {
            const res = await fetch(webhook.webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(webhook.custom_headers || {}) },
                body: JSON.stringify(testPayload),
                signal: AbortSignal.timeout(10000),
            });

            await auth.supabase.from('automation_webhooks').update({ last_fired: new Date().toISOString(), last_status: res.status }).eq('id', id);
            return NextResponse.json({ success: res.ok, status: res.status, payload_sent: testPayload });
        } catch (err) {
            return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Request failed' }, { status: 500 });
        }
    }

    if (action === 'update') {
        const { id, is_active, trigger_events, webhook_url, name } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (is_active !== undefined) updates.is_active = is_active;
        if (trigger_events) updates.trigger_events = trigger_events;
        if (webhook_url) updates.webhook_url = webhook_url;
        if (name) updates.name = name;

        await auth.supabase.from('automation_webhooks').update(updates).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('automation_webhooks').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// Internal function — fire webhook for an event (called from other API routes)
export async function fireWebhookEvent(userId: string, event: string, data: Record<string, unknown>) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: webhooks } = await supabase.from('automation_webhooks').select('*').eq('user_id', userId).eq('is_active', true).contains('trigger_events', [event]);

    for (const webhook of webhooks || []) {
        const payload = { event, source: 'RankMaster Pro', timestamp: new Date().toISOString(), data };
        try {
            const res = await fetch(webhook.webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(webhook.custom_headers || {}) },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(8000),
            });
            await supabase.from('automation_webhooks').update({ last_fired: new Date().toISOString(), fire_count: webhook.fire_count + 1, last_status: res.status }).eq('id', webhook.id);
        } catch { /* non-fatal */ }
    }
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('automation_webhooks').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ webhooks: data || [], events: TRIGGER_EVENTS });
}
