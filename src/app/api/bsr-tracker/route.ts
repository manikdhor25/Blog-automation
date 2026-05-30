// ============================================================
// RankMaster Pro - Amazon BSR Tracker API
// Track Best Seller Rank changes for affiliate products
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { extractProductFromUrl } from '@/lib/engines/product-data';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['add', 'check', 'check_all', 'list', 'delete', 'get_history']),
    id: z.string().uuid().optional(),
    asin: z.string().max(20).optional(),
    product_url: z.string().url().optional(),
    affiliate_url: z.string().url().optional(),
    label: z.string().max(200).optional(),
    post_id: z.string().uuid().optional(),
    alert_threshold: z.number().int().min(1).default(1000).optional(),
});

async function fetchBSR(asin: string): Promise<{ bsr: number | null; category: string; price: number | null }> {
    // Amazon doesn't have a public BSR API — scrape product page
    try {
        const url = `https://www.amazon.com/dp/${asin}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { bsr: null, category: '', price: null };
        const html = await res.text();

        // Extract BSR
        const bsrMatch = html.match(/#([\d,]+)\s+in\s+([^<(]+)/);
        const bsr = bsrMatch ? parseInt(bsrMatch[1].replace(/,/g, '')) : null;
        const category = bsrMatch ? bsrMatch[2].trim() : '';

        // Extract price
        const priceMatch = html.match(/\$(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : null;

        return { bsr, category, price };
    } catch { return { bsr: null, category: '', price: null }; }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'add') {
        const { asin, product_url, affiliate_url, label, post_id, alert_threshold } = parsed.data;
        if (!asin && !product_url) return NextResponse.json({ error: 'asin or product_url required' }, { status: 400 });

        // Fetch initial BSR + product info
        let initialBSR = null, category = '', price = null, productTitle = label || '';

        if (asin) {
            const fetched = await fetchBSR(asin);
            initialBSR = fetched.bsr;
            category = fetched.category;
            price = fetched.price;
        }

        if (!productTitle && product_url) {
            const scraped = await extractProductFromUrl(product_url);
            productTitle = scraped.title || product_url;
            if (!price) price = scraped.price || null;
        }

        const { data, error } = await auth.supabase.from('bsr_tracker').insert({
            user_id: auth.user.id,
            asin: asin || null,
            product_url: product_url || null,
            affiliate_url: affiliate_url || product_url || null,
            label: productTitle,
            category,
            current_bsr: initialBSR,
            lowest_bsr: initialBSR,
            highest_bsr: initialBSR,
            current_price: price,
            alert_threshold: alert_threshold || 1000,
            post_id: post_id || null,
            last_checked: new Date().toISOString(),
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ tracker: data, initial_bsr: initialBSR });
    }

    if (action === 'check') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data: tracker } = await auth.supabase.from('bsr_tracker').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!tracker || !tracker.asin) return NextResponse.json({ error: 'Tracker not found or no ASIN' }, { status: 404 });

        const { bsr, price } = await fetchBSR(tracker.asin);
        const previousBSR = tracker.current_bsr;
        const change = previousBSR && bsr ? previousBSR - bsr : 0; // Positive = rank improved

        const updates: Record<string, unknown> = {
            current_bsr: bsr, current_price: price,
            last_checked: new Date().toISOString(),
        };
        if (bsr && (!tracker.lowest_bsr || bsr < tracker.lowest_bsr)) updates.lowest_bsr = bsr;
        if (bsr && (!tracker.highest_bsr || bsr > tracker.highest_bsr)) updates.highest_bsr = bsr;

        await auth.supabase.from('bsr_tracker').update(updates).eq('id', id);

        // Log history
        if (bsr) await auth.supabase.from('bsr_history').insert({ user_id: auth.user.id, tracker_id: id, bsr, price, checked_at: new Date().toISOString() });

        // Alert if BSR dropped significantly (number went DOWN = rank IMPROVED)
        const alert = change > (tracker.alert_threshold || 1000) ? { type: 'bsr_improved', previous: previousBSR, current: bsr, change } : null;

        return NextResponse.json({ bsr, price, previous_bsr: previousBSR, change, alert });
    }

    if (action === 'check_all') {
        const { data: trackers } = await auth.supabase.from('bsr_tracker').select('id, asin, current_bsr, alert_threshold').eq('user_id', auth.user.id).not('asin', 'is', null);
        const results = [];

        for (const t of (trackers || []).slice(0, 10)) {
            if (!t.asin) continue;
            const { bsr, price } = await fetchBSR(t.asin);
            const change = t.current_bsr && bsr ? t.current_bsr - bsr : 0;
            await auth.supabase.from('bsr_tracker').update({ current_bsr: bsr, current_price: price, last_checked: new Date().toISOString() }).eq('id', t.id);
            if (bsr) await auth.supabase.from('bsr_history').insert({ user_id: auth.user.id, tracker_id: t.id, bsr, price, checked_at: new Date().toISOString() });
            results.push({ id: t.id, bsr, change, alert: change > (t.alert_threshold || 1000) });
        }

        return NextResponse.json({ checked: results.length, improved: results.filter(r => r.change > 0).length, results });
    }

    if (action === 'get_history') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        const { data } = await auth.supabase.from('bsr_history').select('bsr, price, checked_at').eq('tracker_id', id).order('checked_at', { ascending: false }).limit(90);
        return NextResponse.json({ history: data || [] });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('bsr_tracker').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('bsr_tracker').select('*').eq('user_id', auth.user.id).order('last_checked', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ trackers: data || [] });
}
