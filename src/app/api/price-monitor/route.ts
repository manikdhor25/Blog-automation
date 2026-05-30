// ============================================================
// RankMaster Pro - Price Drop Monitor API
// Track affiliate product prices, alert on drops
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { extractProductFromUrl } from '@/lib/engines/product-data';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['add', 'check_all', 'check_one', 'list', 'delete', 'resolve_alert']),
    product_url: z.string().url().optional(),
    affiliate_url: z.string().url().optional(),
    label: z.string().max(200).optional(),
    target_price: z.number().min(0).optional(),
    alert_threshold_pct: z.number().min(1).max(100).default(5),
    post_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

async function scrapePrice(url: string): Promise<{ price: number | null; currency: string; title: string; image_url: string | null }> {
    const data = await extractProductFromUrl(url);
    return {
        price: data.price ?? null,
        currency: data.currency || 'USD',
        title: data.title || '',
        image_url: data.image_url || null,
    };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'add') {
        const { product_url, affiliate_url, label, target_price, alert_threshold_pct, post_id } = parsed.data;
        if (!product_url) return NextResponse.json({ error: 'product_url required' }, { status: 400 });

        // Scrape initial price
        const scraped = await scrapePrice(affiliate_url || product_url);

        const { data, error } = await auth.supabase.from('price_monitor').insert({
            user_id: auth.user.id,
            post_id: post_id || null,
            product_url,
            affiliate_url: affiliate_url || product_url,
            label: label || scraped.title || product_url,
            image_url: scraped.image_url,
            initial_price: scraped.price,
            current_price: scraped.price,
            lowest_price: scraped.price,
            currency: scraped.currency,
            target_price: target_price || null,
            alert_threshold_pct: alert_threshold_pct || 5,
            last_checked: new Date().toISOString(),
            status: 'active',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ monitor: data });
    }

    if (action === 'check_one') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data: monitor } = await auth.supabase.from('price_monitor').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const scraped = await scrapePrice(monitor.affiliate_url || monitor.product_url);
        const newPrice = scraped.price;
        const oldPrice = monitor.current_price;

        const updates: Record<string, unknown> = {
            last_checked: new Date().toISOString(),
            current_price: newPrice,
        };

        if (newPrice !== null && (monitor.lowest_price === null || newPrice < monitor.lowest_price)) {
            updates.lowest_price = newPrice;
        }

        let alert = null;
        if (newPrice !== null && oldPrice !== null) {
            const dropPct = ((oldPrice - newPrice) / oldPrice) * 100;
            const threshold = monitor.alert_threshold_pct || 5;

            if (dropPct >= threshold) {
                updates.price_drop_pct = dropPct;
                updates.status = 'price_dropped';
                alert = { type: 'price_drop', old_price: oldPrice, new_price: newPrice, drop_pct: dropPct.toFixed(1) };

                await auth.supabase.from('price_alerts').insert({
                    user_id: auth.user.id,
                    monitor_id: id,
                    alert_type: 'price_drop',
                    old_price: oldPrice,
                    new_price: newPrice,
                    drop_pct: dropPct,
                    resolved: false,
                });
            } else if (monitor.target_price !== null && newPrice <= monitor.target_price) {
                updates.status = 'target_reached';
                alert = { type: 'target_reached', target: monitor.target_price, new_price: newPrice };

                await auth.supabase.from('price_alerts').insert({
                    user_id: auth.user.id,
                    monitor_id: id,
                    alert_type: 'target_reached',
                    old_price: oldPrice,
                    new_price: newPrice,
                    drop_pct: dropPct,
                    resolved: false,
                });
            }
        }

        await auth.supabase.from('price_monitor').update(updates).eq('id', id);
        return NextResponse.json({ price: newPrice, old_price: oldPrice, alert });
    }

    if (action === 'check_all') {
        const { data: monitors } = await auth.supabase
            .from('price_monitor')
            .select('id, product_url, affiliate_url, current_price, lowest_price, target_price, alert_threshold_pct')
            .eq('user_id', auth.user.id)
            .eq('status', 'active');

        const results = [];
        for (const m of monitors || []) {
            const scraped = await scrapePrice(m.affiliate_url || m.product_url);
            const newPrice = scraped.price;
            const oldPrice = m.current_price;

            const updates: Record<string, unknown> = { last_checked: new Date().toISOString(), current_price: newPrice };
            if (newPrice !== null && (m.lowest_price === null || newPrice < m.lowest_price)) updates.lowest_price = newPrice;

            let alertType = null;
            if (newPrice !== null && oldPrice !== null) {
                const dropPct = ((oldPrice - newPrice) / oldPrice) * 100;
                if (dropPct >= (m.alert_threshold_pct || 5)) {
                    updates.status = 'price_dropped';
                    alertType = 'price_drop';
                    await auth.supabase.from('price_alerts').insert({ user_id: auth.user.id, monitor_id: m.id, alert_type: 'price_drop', old_price: oldPrice, new_price: newPrice, drop_pct: dropPct, resolved: false });
                } else if (m.target_price && newPrice <= m.target_price) {
                    updates.status = 'target_reached';
                    alertType = 'target_reached';
                    await auth.supabase.from('price_alerts').insert({ user_id: auth.user.id, monitor_id: m.id, alert_type: 'target_reached', old_price: oldPrice, new_price: newPrice, drop_pct: dropPct, resolved: false });
                }
            }

            await auth.supabase.from('price_monitor').update(updates).eq('id', m.id);
            results.push({ id: m.id, old_price: oldPrice, new_price: newPrice, alert: alertType });
        }

        const alerts = results.filter(r => r.alert);
        return NextResponse.json({ checked: results.length, alerts: alerts.length, results });
    }

    if (action === 'resolve_alert') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('price_alerts').update({ resolved: true }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('price_monitor').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'monitors';

    if (view === 'alerts') {
        const { data } = await auth.supabase.from('price_alerts').select('*, price_monitor(label, product_url, affiliate_url)').eq('user_id', auth.user.id).eq('resolved', false).order('created_at', { ascending: false });
        return NextResponse.json({ alerts: data || [] });
    }

    const { data } = await auth.supabase.from('price_monitor').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    return NextResponse.json({ monitors: data || [] });
}
