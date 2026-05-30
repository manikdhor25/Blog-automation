// ============================================================
// RankMaster Pro - Affiliate Link Cloaking Redirect
// /go/[slug] → tracks click → 301 to affiliate URL
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    try {
        const { data: link } = await supabase
            .from('cloaked_links')
            .select('id, destination_url, redirect_type, is_active, geo_rules')
            .eq('slug', slug)
            .single();

        if (!link || !link.is_active) {
            return NextResponse.redirect(new URL('/', request.url));
        }

        // Async click tracking (don't await — don't block redirect)
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
        const ua = request.headers.get('user-agent') || '';
        const ref = request.headers.get('referer') || '';
        // Geo header varies by host: Vercel, Cloudflare, or generic proxies.
        const country = (
            request.headers.get('x-vercel-ip-country') ||
            request.headers.get('cf-ipcountry') ||
            request.headers.get('x-country') ||
            'unknown'
        ).toUpperCase();

        // Salted SHA-256 so the stored value is a true one-way hash, not
        // reversible base64. Set IP_HASH_SALT in env for cross-deploy stability.
        const ipHash = createHash('sha256')
            .update((process.env.IP_HASH_SALT || 'rankmaster') + ip)
            .digest('hex')
            .substring(0, 32);

        supabase.from('cloaked_link_clicks').insert({
            link_id: link.id,
            ip_hash: ipHash,
            user_agent: ua.substring(0, 200),
            referrer: ref.substring(0, 500),
            country,
            clicked_at: new Date().toISOString(),
        }).then(() => {
            supabase.rpc('increment_cloaked_link_clicks', { link_id: link.id }).then(() => {});
        });

        // Geo routing
        let destination = link.destination_url;
        if (link.geo_rules && typeof link.geo_rules === 'object') {
            const geoRules = link.geo_rules as Record<string, string>;
            if (country !== 'UNKNOWN' && geoRules[country]) {
                destination = geoRules[country];
            }
        }

        const status = link.redirect_type === 'temporary' ? 302 : 301;
        return NextResponse.redirect(destination, { status });
    } catch {
        return NextResponse.redirect(new URL('/', request.url));
    }
}
