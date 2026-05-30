// ============================================================
// RankMaster Pro - Product Data API
// Fetch/store product data for affiliate posts
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { fetchAmazonProduct, extractProductFromUrl } from '@/lib/engines/product-data';
import { z } from 'zod';

const FetchSchema = z.object({
    action: z.enum(['fetch_amazon', 'fetch_url', 'save', 'list', 'delete']),
    asin: z.string().max(20).optional(),
    url: z.string().url().optional(),
    post_id: z.string().uuid().optional(),
    product_data: z.record(z.string(), z.unknown()).optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = FetchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'fetch_amazon') {
        if (!parsed.data.asin) return NextResponse.json({ error: 'asin required' }, { status: 400 });

        // Get Amazon credentials from settings
        const { data: settings } = await auth.supabase
            .from('settings')
            .select('key, value')
            .in('key', ['amazon_associates_tag', 'amazon_access_key', 'amazon_secret_key']);

        const settingsMap = Object.fromEntries((settings || []).map((s: { key: string; value: string }) => [s.key, s.value]));
        if (!settingsMap.amazon_associates_tag || !settingsMap.amazon_access_key) {
            return NextResponse.json({ error: 'Amazon PA-API credentials not configured in Settings' }, { status: 400 });
        }

        const product = await fetchAmazonProduct(
            parsed.data.asin,
            settingsMap.amazon_associates_tag,
            settingsMap.amazon_access_key,
            settingsMap.amazon_secret_key,
        );

        if (!product) return NextResponse.json({ error: 'Product not found or PA-API error' }, { status: 404 });
        return NextResponse.json({ product });
    }

    if (action === 'fetch_url') {
        if (!parsed.data.url) return NextResponse.json({ error: 'url required' }, { status: 400 });
        const product = await extractProductFromUrl(parsed.data.url);
        return NextResponse.json({ product });
    }

    if (action === 'save') {
        if (!parsed.data.product_data) return NextResponse.json({ error: 'product_data required' }, { status: 400 });
        const { data, error } = await auth.supabase
            .from('products')
            .upsert({
                user_id: auth.user.id,
                post_id: parsed.data.post_id || null,
                ...parsed.data.product_data,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,asin' })
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ product: data });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('products').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('post_id');

    let query = auth.supabase.from('products').select('*').eq('user_id', auth.user.id);
    if (postId) query = query.eq('post_id', postId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: data || [] });
}
