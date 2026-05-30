// ============================================================
// RankMaster Pro - Review Generator API
// ASIN / URL → full affiliate review post
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { fetchAmazonProduct, extractProductFromUrl } from '@/lib/engines/product-data';
import { generateProductReview } from '@/lib/engines/review-generator';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['generate', 'list', 'delete', 'save']),
    asin: z.string().max(20).optional(),
    product_url: z.string().url().optional(),
    affiliate_url: z.string().url().optional(),
    niche: z.string().max(200).optional(),
    target_keyword: z.string().max(200).optional(),
    site_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
    review_data: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const { asin, product_url, affiliate_url, niche = 'general', target_keyword, site_id } = parsed.data;
        if (!asin && !product_url) return NextResponse.json({ error: 'asin or product_url required' }, { status: 400 });

        let product = null;

        if (asin) {
            const { data: settings } = await auth.supabase
                .from('settings')
                .select('key, value')
                .in('key', ['amazon_associates_tag', 'amazon_access_key', 'amazon_secret_key']);
            const s = Object.fromEntries((settings || []).map((r: { key: string; value: string }) => [r.key, r.value]));
            if (s.amazon_access_key && s.amazon_associates_tag) {
                product = await fetchAmazonProduct(asin, s.amazon_associates_tag, s.amazon_access_key, s.amazon_secret_key);
            }
        }

        if (!product && product_url) {
            const scraped = await extractProductFromUrl(product_url);
            product = { ...scraped, asin: asin || null } as Parameters<typeof generateProductReview>[0];
        }

        if (!product) return NextResponse.json({ error: 'Could not fetch product data. Provide product_url as fallback.' }, { status: 404 });

        const finalAffiliateUrl = affiliate_url || product_url || `https://amazon.com/dp/${asin}`;
        const review = await generateProductReview(product as Parameters<typeof generateProductReview>[0], finalAffiliateUrl, niche, target_keyword);

        if (!review) return NextResponse.json({ error: 'Review generation failed' }, { status: 500 });

        // Auto-save to DB
        const { data: saved } = await auth.supabase.from('review_generator').insert({
            user_id: auth.user.id,
            site_id: site_id || null,
            asin: asin || null,
            product_url: product_url || null,
            affiliate_url: finalAffiliateUrl,
            product_title: product.title,
            product_image: product.image_url || null,
            product_price: product.price || null,
            product_rating: product.rating || null,
            niche,
            target_keyword: target_keyword || null,
            review_title: review.title,
            verdict_score: review.verdict_score,
            review_data: review,
            word_count: review.word_count_estimate,
            status: 'draft',
        }).select('id').single();

        return NextResponse.json({ review, product, id: saved?.id });
    }

    if (action === 'save') {
        const { id, review_data, site_id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('review_generator').update({ review_data, site_id: site_id || null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('review_generator').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase
        .from('review_generator')
        .select('id, product_title, product_image, product_price, product_rating, review_title, verdict_score, niche, word_count, status, created_at')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reviews: data || [] });
}
