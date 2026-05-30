// ============================================================
// RankMaster Pro - Deal & Coupon Manager API
// Track time-limited affiliate deals, auto-expiry alerts
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['create', 'update', 'delete', 'list', 'check_expiry', 'mark_expired']),
    id: z.string().uuid().optional(),
    product_name: z.string().max(300).optional(),
    affiliate_url: z.string().url().optional(),
    original_url: z.string().optional(),
    deal_type: z.enum(['coupon', 'sale', 'flash_deal', 'bundle', 'free_trial', 'cashback', 'discount']).optional(),
    discount_value: z.string().max(50).optional(),
    coupon_code: z.string().max(100).optional(),
    expires_at: z.string().optional(),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    program_id: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
    is_verified: z.boolean().optional(),
    is_active: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'create') {
        const { product_name, affiliate_url, deal_type, discount_value, coupon_code, expires_at, post_id, site_id, program_id, notes, is_verified } = parsed.data;
        if (!product_name || !affiliate_url) return NextResponse.json({ error: 'product_name and affiliate_url required' }, { status: 400 });

        const isExpired = expires_at ? new Date(expires_at) < new Date() : false;

        const { data, error } = await auth.supabase.from('deals').insert({
            user_id: auth.user.id,
            product_name, affiliate_url, deal_type: deal_type || 'sale',
            discount_value: discount_value || '', coupon_code: coupon_code || '',
            expires_at: expires_at || null, post_id: post_id || null,
            site_id: site_id || null, program_id: program_id || null,
            notes: notes || '', is_verified: is_verified || false,
            is_active: !isExpired, is_expired: isExpired,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ deal: data });
    }

    if (action === 'update') {
        const { id, ...updates } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        const { action: _a, ...cleanUpdates } = updates;
        await auth.supabase.from('deals').update({ ...cleanUpdates, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'check_expiry') {
        const now = new Date().toISOString();
        const soon = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        // Auto-expire past deals
        await auth.supabase.from('deals').update({ is_expired: true, is_active: false }).eq('user_id', auth.user.id).lt('expires_at', now).eq('is_expired', false);

        // Get expiring soon (next 48h)
        const { data: expiringSoon } = await auth.supabase.from('deals').select('id, product_name, expires_at, affiliate_url').eq('user_id', auth.user.id).eq('is_expired', false).eq('is_active', true).gte('expires_at', now).lte('expires_at', soon);

        // Get already expired (last 7 days)
        const { data: recentlyExpired } = await auth.supabase.from('deals').select('id, product_name, post_id').eq('user_id', auth.user.id).eq('is_expired', true).gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).not('post_id', 'is', null);

        return NextResponse.json({ expiring_soon: expiringSoon || [], recently_expired: recentlyExpired || [] });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('deals').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'active';

    let query = auth.supabase.from('deals').select('*').eq('user_id', auth.user.id).order('expires_at', { ascending: true, nullsFirst: false });

    if (filter === 'active') query = query.eq('is_active', true).eq('is_expired', false);
    else if (filter === 'expired') query = query.eq('is_expired', true);
    else if (filter === 'expiring') {
        const soon = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
        query = query.eq('is_active', true).lte('expires_at', soon).gte('expires_at', new Date().toISOString());
    }

    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const all = await auth.supabase.from('deals').select('is_active, is_expired, expires_at').eq('user_id', auth.user.id);
    const allDeals = all.data || [];
    const now = new Date();
    const soon = new Date(Date.now() + 72 * 60 * 60 * 1000);

    return NextResponse.json({
        deals: data || [],
        summary: {
            total: allDeals.length,
            active: allDeals.filter(d => d.is_active && !d.is_expired).length,
            expired: allDeals.filter(d => d.is_expired).length,
            expiring_soon: allDeals.filter(d => d.expires_at && new Date(d.expires_at) >= now && new Date(d.expires_at) <= soon).length,
        },
    });
}
