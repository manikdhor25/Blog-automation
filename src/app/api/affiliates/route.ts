// ============================================================
// RankMaster Pro - Affiliate Revenue Engine API
// Programs, Links, Click Tracking, Revenue
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getAuthUser } from '@/lib/auth-guard';
import { AffiliatePostSchema } from '@/lib/api-schemas';

// GET /api/affiliates - List programs, links, and revenue stats for current user
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'programs';
        const siteId = searchParams.get('site_id');

        const auth = await getAuthUser();
        if (auth.error) return auth.error;
        const supabase = auth.supabase;

        if (type === 'programs') {
            const { data, error } = await supabase
                .from('affiliate_programs')
                .select('*')
                .eq('user_id', auth.user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return NextResponse.json({ programs: data || [] });
        }

        if (type === 'links') {
            let query = supabase
                .from('affiliate_links')
                .select('*, affiliate_programs(name, network)')
                .order('created_at', { ascending: false });
            if (siteId) query = query.eq('site_id', siteId);
            const { data, error } = await query;
            if (error) throw error;
            return NextResponse.json({ links: data || [] });
        }

        if (type === 'revenue') {
            const { data, error } = await supabase
                .from('affiliate_revenue')
                .select('*, affiliate_programs(name)')
                .order('month', { ascending: false })
                .limit(24);
            if (error) throw error;
            return NextResponse.json({ revenue: data || [] });
        }

        if (type === 'dashboard') {
            // Aggregate stats
            const { data: programs } = await supabase.from('affiliate_programs').select('*').eq('user_id', auth.user.id);
            const { data: links } = await supabase.from('affiliate_links').select('*').eq('user_id', auth.user.id);
            const { data: revenue } = await supabase
                .from('affiliate_revenue')
                .select('amount')
                .eq('user_id', auth.user.id)
                .gte('month', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

            const totalRevenue = (revenue || []).reduce((sum: number, r: { amount: number }) => sum + (r.amount || 0), 0);
            const totalClicks = (links || []).reduce((sum: number, l: { clicks: number }) => sum + (l.clicks || 0), 0);

            return NextResponse.json({
                dashboard: {
                    totalPrograms: (programs || []).length,
                    totalLinks: (links || []).length,
                    activeLinks: (links || []).filter((l: { status: string }) => l.status === 'active').length,
                    totalClicks,
                    monthlyRevenue: totalRevenue,
                    avgRevenuePerClick: totalClicks > 0 ? (totalRevenue / totalClicks).toFixed(2) : '0.00',
                },
            });
        }

        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch affiliate data' },
            { status: 500 }
        );
    }
}

// POST /api/affiliates - Create programs, links, or log revenue
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsed = AffiliatePostSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const { action } = parsed.data;

        const auth = await getAuthUser();
        if (auth.error) return auth.error;
        const supabase = auth.supabase;
        const user = auth.user;

        // Create affiliate program
        if (action === 'create_program') {
            const { data, error } = await supabase
                .from('affiliate_programs')
                .insert({
                    user_id: user.id,
                    name: body.name,
                    network: body.network || 'direct', // amazon, shareasale, cj, impact, direct
                    commission_rate: body.commission_rate || 0,
                    commission_type: body.commission_type || 'percentage', // percentage, flat
                    cookie_duration: body.cookie_duration || 30, // days
                    signup_url: body.signup_url || '',
                    notes: body.notes || '',
                })
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ program: data });
        }

        // Create affiliate link
        if (action === 'create_link') {
            const { data, error } = await supabase
                .from('affiliate_links')
                .insert({
                    user_id: user.id,
                    program_id: body.program_id,
                    site_id: body.site_id || null,
                    post_id: body.post_id || null,
                    original_url: body.original_url,
                    affiliate_url: body.affiliate_url,
                    anchor_text: body.anchor_text || '',
                    utm_source: body.utm_source || 'rankmaster',
                    utm_medium: body.utm_medium || 'affiliate',
                    utm_campaign: body.utm_campaign || '',
                    status: 'active',
                    clicks: 0,
                    conversions: 0,
                    page_type: body.page_type || 'info', // money, info, review, comparison
                })
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ link: data });
        }

        // Log revenue
        if (action === 'log_revenue') {
            const { data, error } = await supabase
                .from('affiliate_revenue')
                .upsert({
                    user_id: user.id,
                    program_id: body.program_id,
                    month: body.month || new Date().toISOString().substring(0, 7) + '-01',
                    amount: body.amount || 0,
                    clicks: body.clicks || 0,
                    conversions: body.conversions || 0,
                    notes: body.notes || '',
                }, { onConflict: 'program_id,month' })
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ revenue: data });
        }

        // Track click (increment)
        if (action === 'track_click') {
            const linkId = body.link_id;
            if (!linkId) return NextResponse.json({ error: 'link_id required' }, { status: 400 });

            // Increment click count
            const { data: link } = await supabase
                .from('affiliate_links')
                .select('clicks')
                .eq('id', linkId)
                .single();

            await supabase
                .from('affiliate_links')
                .update({ clicks: (link?.clicks || 0) + 1, last_clicked: new Date().toISOString() })
                .eq('id', linkId);

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process affiliate action' },
            { status: 500 }
        );
    }
}

// DELETE /api/affiliates - Remove program or link (owned by current user)
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'link';
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const table = type === 'program' ? 'affiliate_programs' : 'affiliate_links';
        const { error } = await auth.supabase.from(table).delete().eq('id', id).eq('user_id', auth.user.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete' },
            { status: 500 }
        );
    }
}
