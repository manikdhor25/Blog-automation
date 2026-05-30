// ============================================================
// RankMaster Pro - Newsletter Monetization Tracker API
// Track email-driven revenue: affiliate clicks from email, paid subscriptions, sponsor deals
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['log_send', 'log_revenue', 'list_sends', 'list_revenue', 'get_summary', 'delete']),
    id: z.string().uuid().optional(),
    subject: z.string().max(500).optional(),
    sent_at: z.string().optional(),
    subscriber_count: z.number().int().min(0).optional(),
    open_count: z.number().int().min(0).optional(),
    click_count: z.number().int().min(0).optional(),
    unsubscribes: z.number().int().min(0).optional(),
    platform: z.enum(['convertkit', 'mailchimp', 'beehiiv', 'aweber', 'substack', 'manual']).optional(),
    revenue_type: z.enum(['affiliate', 'paid_subscription', 'sponsored_email', 'product_sale']).optional(),
    amount: z.number().min(0).optional(),
    send_id: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'log_send') {
        const { subject, sent_at, subscriber_count, open_count, click_count, unsubscribes, platform } = parsed.data;
        if (!subject) return NextResponse.json({ error: 'subject required' }, { status: 400 });

        const openRate = subscriber_count && open_count ? (open_count / subscriber_count * 100) : null;
        const clickRate = open_count && click_count ? (click_count / open_count * 100) : null;

        const { data, error } = await auth.supabase.from('newsletter_sends').insert({
            user_id: auth.user.id, subject,
            sent_at: sent_at || new Date().toISOString(),
            subscriber_count: subscriber_count || 0,
            open_count: open_count || 0,
            click_count: click_count || 0,
            unsubscribes: unsubscribes || 0,
            open_rate: openRate,
            click_rate: clickRate,
            platform: platform || 'manual',
            revenue_total: 0,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ send: data });
    }

    if (action === 'log_revenue') {
        const { send_id, revenue_type, amount, notes } = parsed.data;
        if (!revenue_type || amount === undefined) return NextResponse.json({ error: 'revenue_type and amount required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('newsletter_revenue').insert({
            user_id: auth.user.id,
            send_id: send_id || null,
            revenue_type,
            amount,
            notes: notes || '',
            date: new Date().toISOString().split('T')[0],
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Update send total if linked
        if (send_id) {
            const { data: current } = await auth.supabase.from('newsletter_sends').select('revenue_total').eq('id', send_id).single();
            if (current) await auth.supabase.from('newsletter_sends').update({ revenue_total: (current.revenue_total || 0) + amount }).eq('id', send_id);
        }

        return NextResponse.json({ revenue: data });
    }

    if (action === 'get_summary') {
        const [sendsRes, revRes] = await Promise.all([
            auth.supabase.from('newsletter_sends').select('subscriber_count, open_rate, click_rate, revenue_total').eq('user_id', auth.user.id).order('sent_at', { ascending: false }).limit(12),
            auth.supabase.from('newsletter_revenue').select('amount, revenue_type').eq('user_id', auth.user.id),
        ]);

        const sends = sendsRes.data || [];
        const rev = revRes.data || [];

        const latestSubs = sends[0]?.subscriber_count || 0;
        const avgOpenRate = sends.length ? sends.reduce((s, e) => s + (e.open_rate || 0), 0) / sends.length : 0;
        const avgClickRate = sends.length ? sends.reduce((s, e) => s + (e.click_rate || 0), 0) / sends.length : 0;
        const totalRevenue = rev.reduce((s, r) => s + r.amount, 0);
        const revenuePerSub = latestSubs > 0 ? totalRevenue / latestSubs : 0;

        const byType: Record<string, number> = {};
        for (const r of rev) byType[r.revenue_type] = (byType[r.revenue_type] || 0) + r.amount;

        return NextResponse.json({
            summary: {
                total_sends: sends.length,
                latest_subscribers: latestSubs,
                avg_open_rate: parseFloat(avgOpenRate.toFixed(1)),
                avg_click_rate: parseFloat(avgClickRate.toFixed(1)),
                total_revenue: totalRevenue,
                revenue_per_subscriber: parseFloat(revenuePerSub.toFixed(4)),
                revenue_by_type: byType,
            },
        });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('newsletter_sends').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const view = new URL(request.url).searchParams.get('view') || 'sends';

    if (view === 'revenue') {
        const { data } = await auth.supabase.from('newsletter_revenue').select('*').eq('user_id', auth.user.id).order('date', { ascending: false }).limit(100);
        return NextResponse.json({ revenue: data || [] });
    }

    const { data } = await auth.supabase.from('newsletter_sends').select('*').eq('user_id', auth.user.id).order('sent_at', { ascending: false }).limit(100);
    return NextResponse.json({ sends: data || [] });
}
