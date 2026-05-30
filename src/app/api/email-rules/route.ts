// ============================================================
// RankMaster Pro - Email Automation Rule Builder API
// Visual if/then rule builder for email sequences
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const TriggerSchema = z.object({
    type: z.enum(['subscriber_joined', 'link_clicked', 'email_opened', 'purchase_made', 'no_open_days', 'tag_added', 'form_submitted']),
    value: z.string().optional(),
    days: z.number().int().optional(),
});

const ActionSchema = z.object({
    type: z.enum(['send_email', 'add_tag', 'remove_tag', 'move_to_sequence', 'send_webhook', 'wait_days', 'notify_owner']),
    value: z.string().optional(),
    days: z.number().int().optional(),
    email_subject: z.string().max(300).optional(),
    email_body: z.string().max(10000).optional(),
    sequence_id: z.string().uuid().optional(),
    webhook_url: z.string().url().optional(),
});

const Schema = z.object({
    action: z.enum(['create_rule', 'update_rule', 'delete_rule', 'list', 'toggle', 'simulate']),
    id: z.string().uuid().optional(),
    rule_name: z.string().max(200).optional(),
    trigger: TriggerSchema.optional(),
    actions: z.array(ActionSchema).max(10).optional(),
    is_active: z.boolean().optional(),
    platform: z.enum(['convertkit', 'mailchimp', 'beehiiv', 'manual']).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'create_rule') {
        const { rule_name, trigger, actions, platform } = parsed.data;
        if (!rule_name || !trigger || !actions?.length) return NextResponse.json({ error: 'rule_name, trigger, and actions required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('email_rules').insert({
            user_id: auth.user.id,
            rule_name,
            trigger_data: trigger,
            actions_data: actions,
            platform: platform || 'manual',
            is_active: true,
            times_triggered: 0,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ rule: data });
    }

    if (action === 'update_rule') {
        const { id, rule_name, trigger, actions, is_active } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (rule_name) updates.rule_name = rule_name;
        if (trigger) updates.trigger_data = trigger;
        if (actions) updates.actions_data = actions;
        if (is_active !== undefined) updates.is_active = is_active;

        await auth.supabase.from('email_rules').update(updates).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'toggle') {
        const { id, is_active } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('email_rules').update({ is_active: is_active ?? true }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'simulate') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data: rule } = await auth.supabase.from('email_rules').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

        const trigger = rule.trigger_data as { type: string; value?: string; days?: number };
        const actions = rule.actions_data as Array<{ type: string; value?: string; days?: number; email_subject?: string }>;

        const simulation = {
            trigger_description: `When: subscriber ${trigger.type.replace('_', ' ')}${trigger.value ? ` "${trigger.value}"` : ''}${trigger.days ? ` (after ${trigger.days} days)` : ''}`,
            action_steps: actions.map((a, i) => ({
                step: i + 1,
                description: `Then: ${a.type.replace('_', ' ')}${a.value ? ` "${a.value}"` : ''}${a.email_subject ? ` — Subject: "${a.email_subject}"` : ''}${a.days ? ` (wait ${a.days} days)` : ''}`,
            })),
            platform_note: `This rule logic must be configured in your ${rule.platform} account. RankMaster tracks and displays the rules.`,
        };

        return NextResponse.json({ simulation, rule });
    }

    if (action === 'delete_rule') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('email_rules').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('email_rules').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Template rules to get started
    const templates = [
        { name: 'Welcome → Affiliate Pitch', trigger: { type: 'subscriber_joined' }, actions: [{ type: 'send_email', email_subject: 'Welcome! Here\'s your free guide' }, { type: 'wait_days', days: 3 }, { type: 'move_to_sequence', value: 'affiliate_nurture' }] },
        { name: 'Re-engagement for Cold Subscribers', trigger: { type: 'no_open_days', days: 45 }, actions: [{ type: 'send_email', email_subject: 'Are you still there?' }, { type: 'wait_days', days: 7 }, { type: 'remove_tag', value: 'active' }] },
        { name: 'Link Clicked → Product Sequence', trigger: { type: 'link_clicked', value: 'affiliate_link' }, actions: [{ type: 'add_tag', value: 'interested_buyer' }, { type: 'move_to_sequence', value: 'product_followup' }] },
    ];

    return NextResponse.json({ rules: data || [], templates });
}
