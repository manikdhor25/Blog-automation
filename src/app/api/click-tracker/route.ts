import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const CreateLinkSchema = z.object({
    action: z.literal('create_link'),
    destination_url: z.string().url(),
    label: z.string().min(1),
    affiliate_program: z.string().optional(),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    expected_commission: z.number().optional(),
});

const RecordClickSchema = z.object({
    action: z.literal('record_click'),
    tracking_id: z.string().min(1),
    referrer: z.string().optional(),
    user_agent: z.string().optional(),
    ip_hash: z.string().optional(),
});

const RecordConversionSchema = z.object({
    action: z.literal('record_conversion'),
    tracking_id: z.string().min(1),
    commission_amount: z.number().min(0),
    order_id: z.string().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const postId = url.searchParams.get('post_id');
    const period = url.searchParams.get('period') || '30';

    const since = new Date(Date.now() - parseInt(period) * 86400000).toISOString();

    let linksQuery = supabase.from('tracked_links').select('*').eq('user_id', user.id).order('total_clicks', { ascending: false });
    if (postId) linksQuery = linksQuery.eq('post_id', postId);
    const { data: links } = await linksQuery;

    // Aggregate click data per link
    const { data: clickData } = await supabase.from('link_clicks')
        .select('tracking_id, created_at, converted, commission_amount')
        .eq('user_id', user.id).gte('created_at', since);

    const stats = {
        total_clicks: clickData?.length || 0,
        total_conversions: clickData?.filter(c => c.converted).length || 0,
        total_revenue: clickData?.filter(c => c.converted).reduce((sum, c) => sum + (c.commission_amount || 0), 0) || 0,
        conversion_rate: clickData?.length ? ((clickData.filter(c => c.converted).length / clickData.length) * 100).toFixed(1) : '0',
        epc: clickData?.length ? (clickData.filter(c => c.converted).reduce((sum, c) => sum + (c.commission_amount || 0), 0) / clickData.length).toFixed(4) : '0',
    };

    return NextResponse.json({ links: links || [], stats, period: parseInt(period) });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create_link') {
        const parsed = CreateLinkSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Generate short tracking ID
        const trackingId = Math.random().toString(36).substring(2, 10).toUpperCase();

        const { data, error } = await supabase.from('tracked_links').insert({
            user_id: user.id, tracking_id: trackingId, destination_url: d.destination_url,
            label: d.label, affiliate_program: d.affiliate_program || null,
            post_id: d.post_id || null, site_id: d.site_id || null,
            expected_commission: d.expected_commission || null,
            total_clicks: 0, unique_clicks: 0, conversions: 0, total_revenue: 0,
            is_active: true,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ link: data, tracking_url: `/api/click-tracker/go?id=${trackingId}` });
    }

    if (body.action === 'record_click') {
        const parsed = RecordClickSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: link } = await supabase.from('tracked_links').select('id, user_id, total_clicks, unique_clicks').eq('tracking_id', d.tracking_id).single();
        if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

        // Insert click event
        await supabase.from('link_clicks').insert({
            user_id: link.user_id, tracking_id: d.tracking_id, link_id: link.id,
            referrer: d.referrer || null, user_agent: d.user_agent || null,
            ip_hash: d.ip_hash || null, converted: false,
        });

        // Update counters
        await supabase.from('tracked_links').update({ total_clicks: (link.total_clicks || 0) + 1 }).eq('id', link.id);

        return NextResponse.json({ tracked: true });
    }

    if (body.action === 'record_conversion') {
        const parsed = RecordConversionSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: link } = await supabase.from('tracked_links').select('id, user_id, conversions, total_revenue').eq('tracking_id', d.tracking_id).single();
        if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

        await supabase.from('link_clicks').insert({
            user_id: link.user_id, tracking_id: d.tracking_id, link_id: link.id,
            converted: true, commission_amount: d.commission_amount, order_id: d.order_id || null,
        });

        await supabase.from('tracked_links').update({
            conversions: (link.conversions || 0) + 1,
            total_revenue: (link.total_revenue || 0) + d.commission_amount,
        }).eq('id', link.id);

        return NextResponse.json({ recorded: true });
    }

    if (body.action === 'delete') {
        await supabase.from('tracked_links').delete().eq('id', body.link_id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
