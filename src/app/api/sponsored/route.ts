// ============================================================
// RankMaster Pro - Sponsored Post Manager API
// Track brand deals, deliverables, payments, FTC compliance
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['create', 'update', 'list', 'delete', 'mark_delivered', 'mark_paid']),
    id: z.string().uuid().optional(),
    brand_name: z.string().max(200).optional(),
    contact_name: z.string().max(200).optional(),
    contact_email: z.string().email().optional(),
    deal_type: z.enum(['sponsored_post', 'review', 'mention', 'social_post', 'newsletter', 'bundle']).optional(),
    agreed_fee: z.number().min(0).optional(),
    currency: z.string().max(10).default('USD').optional(),
    deliverable_description: z.string().max(2000).optional(),
    deadline: z.string().optional(),
    site_id: z.string().uuid().optional(),
    post_id: z.string().uuid().optional(),
    disclosure_type: z.enum(['paid_partnership', 'sponsored', 'ad', 'gifted']).default('sponsored').optional(),
    status: z.enum(['negotiating', 'agreed', 'in_progress', 'delivered', 'published', 'paid', 'cancelled']).optional(),
    payment_date: z.string().optional(),
    notes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'create') {
        const { brand_name, contact_name, contact_email, deal_type, agreed_fee, currency, deliverable_description, deadline, site_id, post_id, disclosure_type, notes } = parsed.data;
        if (!brand_name) return NextResponse.json({ error: 'brand_name required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('sponsored_deals').insert({
            user_id: auth.user.id,
            brand_name, contact_name: contact_name || null, contact_email: contact_email || null,
            deal_type: deal_type || 'sponsored_post', agreed_fee: agreed_fee || 0,
            currency: currency || 'USD', deliverable_description: deliverable_description || '',
            deadline: deadline || null, site_id: site_id || null, post_id: post_id || null,
            disclosure_type: disclosure_type || 'sponsored', status: 'negotiating',
            notes: notes || '',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ deal: data });
    }

    if (action === 'update') {
        const { id, ...updates } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        const { action: _a, ...cleanUpdates } = updates;
        await auth.supabase.from('sponsored_deals').update({ ...cleanUpdates, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'mark_delivered') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('sponsored_deals').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'mark_paid') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('sponsored_deals').update({ status: 'paid', payment_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('sponsored_deals').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = auth.supabase.from('sponsored_deals').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const deals = data || [];
    const totalRevenue = deals.filter(d => d.status === 'paid').reduce((s: number, d: { agreed_fee: number }) => s + (d.agreed_fee || 0), 0);
    const pendingRevenue = deals.filter(d => ['agreed', 'in_progress', 'delivered', 'published'].includes(d.status)).reduce((s: number, d: { agreed_fee: number }) => s + (d.agreed_fee || 0), 0);
    const overdue = deals.filter(d => d.deadline && new Date(d.deadline) < new Date() && !['paid', 'cancelled'].includes(d.status)).length;

    return NextResponse.json({ deals, summary: { total: deals.length, total_revenue: totalRevenue, pending_revenue: pendingRevenue, overdue } });
}
