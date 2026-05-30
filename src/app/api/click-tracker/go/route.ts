// ============================================================
// RankMaster Pro - Tracked-link public redirect + click recorder
// /api/click-tracker/go?id=<tracking_id> → record click → 302 destination
//
// Public endpoint: real visitors are not authenticated, so it uses the
// service-role client (mirrors /go/[slug]). The owner-authenticated
// record_click action in ../route.ts is only for manual/testing use.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
    const trackingId = request.nextUrl.searchParams.get('id');
    const home = new URL('/', request.url);
    if (!trackingId) return NextResponse.redirect(home);

    try {
        const { data: link } = await supabase
            .from('tracked_links')
            .select('id, user_id, destination_url, total_clicks, is_active')
            .eq('tracking_id', trackingId)
            .single();

        if (!link || !link.is_active || !link.destination_url) {
            return NextResponse.redirect(home);
        }

        // Record the click without blocking the redirect.
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
        const ipHash = createHash('sha256')
            .update((process.env.IP_HASH_SALT || 'rankmaster') + ip)
            .digest('hex')
            .substring(0, 32);

        supabase.from('link_clicks').insert({
            user_id: link.user_id,
            tracking_id: trackingId,
            link_id: link.id,
            referrer: request.headers.get('referer')?.substring(0, 500) || null,
            user_agent: request.headers.get('user-agent')?.substring(0, 200) || null,
            ip_hash: ipHash,
            converted: false,
        }).then(() => {
            supabase.from('tracked_links')
                .update({ total_clicks: (link.total_clicks || 0) + 1 })
                .eq('id', link.id)
                .then(() => { });
        });

        return NextResponse.redirect(link.destination_url, { status: 302 });
    } catch {
        return NextResponse.redirect(home);
    }
}
