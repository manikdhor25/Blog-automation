// ============================================================
// RankMaster Pro - Link Monitor API
// POST /api/link-monitor → run checks
// GET  /api/link-monitor → last results
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { checkLinks } from '@/lib/engines/link-monitor';

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const linkIds: string[] | null = body.link_ids || null;

    let query = auth.supabase
        .from('affiliate_links')
        .select('id, affiliate_url, anchor_text')
        .eq('user_id', auth.user.id)
        .eq('status', 'active');

    if (linkIds?.length) {
        query = query.in('id', linkIds);
    }

    const { data: affiliateLinks, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also check cloaked links
    let cloakedQuery = auth.supabase
        .from('cloaked_links')
        .select('id, slug, destination_url, label')
        .eq('user_id', auth.user.id)
        .eq('is_active', true);

    if (linkIds?.length) cloakedQuery = cloakedQuery.in('id', linkIds);
    const { data: cloakedLinks } = await cloakedQuery;

    const allLinks = [
        ...(affiliateLinks || []).map(l => ({ id: l.id, destination_url: l.affiliate_url, label: l.anchor_text || l.affiliate_url })),
        ...(cloakedLinks || []).map(l => ({ id: l.id, slug: l.slug, destination_url: l.destination_url, label: l.label || l.slug })),
    ];

    if (allLinks.length === 0) return NextResponse.json({ message: 'No active links to check', summary: { total: 0, ok: 0, broken: 0, redirected: 0, timeout: 0, results: [] } });

    const summary = await checkLinks(allLinks, 5);

    // Persist broken link results
    const brokenLinks = summary.results.filter(r => r.status === 'broken' || r.status === 'timeout');
    if (brokenLinks.length > 0) {
        await auth.supabase.from('link_monitor_alerts').upsert(
            brokenLinks.map(r => ({
                user_id: auth.user.id,
                link_id: r.id,
                link_type: r.slug ? 'cloaked' : 'affiliate',
                destination_url: r.destination_url,
                http_status: r.http_status,
                error: r.error,
                status: r.status,
                checked_at: r.checked_at,
                resolved: false,
            })),
            { onConflict: 'user_id,link_id' }
        );
    }

    return NextResponse.json({ summary });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase
        .from('link_monitor_alerts')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('checked_at', { ascending: false })
        .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ alerts: data || [] });
}

export async function PATCH(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await auth.supabase
        .from('link_monitor_alerts')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', auth.user.id);

    return NextResponse.json({ success: true });
}
