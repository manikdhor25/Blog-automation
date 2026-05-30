import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const AddProductSchema = z.object({
    action: z.literal('add_product'),
    asin: z.string().min(10).max(10),
    label: z.string().min(1),
    affiliate_tag: z.string().optional(),
    post_ids: z.array(z.string().uuid()).default([]),
    site_id: z.string().uuid().optional(),
});

const FetchSchema = z.object({
    action: z.literal('fetch'),
    product_id: z.string().uuid().optional(),
    all: z.boolean().default(false),
});

async function fetchAmazonProduct(asin: string, affiliateTag?: string): Promise<Record<string, unknown>> {
    // Try scraping Amazon product page for basic data
    const url = `https://www.amazon.com/dp/${asin}`;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();

        // Extract price
        const priceMatch = html.match(/["']priceAmount["']\s*:\s*["']([0-9.]+)["']/) ||
            html.match(/\$\s*([0-9,]+\.[0-9]{2})/) ;
        const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;

        // Extract title
        const titleMatch = html.match(/<span id="productTitle"[^>]*>([^<]+)<\/span>/);
        const title = titleMatch ? titleMatch[1].trim() : null;

        // Extract rating
        const ratingMatch = html.match(/([0-9.]+) out of 5 stars/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        // Extract review count
        const reviewMatch = html.match(/([0-9,]+) ratings/);
        const reviews = reviewMatch ? parseInt(reviewMatch[1].replace(',', '')) : null;

        // Check availability
        const inStock = html.includes('In Stock') || html.includes('Add to Cart');

        const affiliateUrl = affiliateTag
            ? `https://www.amazon.com/dp/${asin}?tag=${affiliateTag}`
            : `https://www.amazon.com/dp/${asin}`;

        return { asin, price, title, rating, reviews, in_stock: inStock, affiliate_url: affiliateUrl, fetched_at: new Date().toISOString() };
    } catch {
        // Fallback to AI-estimated data
        return { asin, price: null, title: null, rating: null, reviews: null, in_stock: null, affiliate_url: `https://www.amazon.com/dp/${asin}`, fetched_at: new Date().toISOString(), error: 'scrape_failed' };
    }
}

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    let q = supabase.from('amazon_products').select('*').eq('user_id', user.id).order('last_fetched', { ascending: false });
    if (siteId) q = q.eq('site_id', siteId);
    const { data } = await q;
    return NextResponse.json({ products: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'add_product') {
        const parsed = AddProductSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const productData = await fetchAmazonProduct(d.asin, d.affiliate_tag);

        const { data, error } = await supabase.from('amazon_products').insert({
            user_id: user.id, site_id: d.site_id || null,
            asin: d.asin, label: d.label,
            affiliate_tag: d.affiliate_tag || null,
            affiliate_url: productData.affiliate_url as string,
            post_ids: d.post_ids,
            current_price: productData.price,
            title: productData.title,
            rating: productData.rating,
            review_count: productData.reviews,
            in_stock: productData.in_stock,
            last_fetched: new Date().toISOString(),
            price_history: productData.price ? [{ price: productData.price, date: new Date().toISOString() }] : [],
            is_active: true,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ product: data, fetched: productData });
    }

    if (body.action === 'fetch') {
        const parsed = FetchSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        let products;
        if (parsed.data.product_id) {
            const { data } = await supabase.from('amazon_products').select('*').eq('id', parsed.data.product_id).eq('user_id', user.id);
            products = data || [];
        } else {
            const { data } = await supabase.from('amazon_products').select('*').eq('user_id', user.id).eq('is_active', true);
            products = data || [];
        }

        const updated = [];
        for (const product of products.slice(0, 10)) {
            const fresh = await fetchAmazonProduct(product.asin, product.affiliate_tag);
            const priceHistory = product.price_history || [];
            if (fresh.price && fresh.price !== product.current_price) {
                priceHistory.push({ price: fresh.price, date: new Date().toISOString() });
            }

            const oldPrice = Number(product.current_price);
            const newPrice = Number(fresh.price);
            const priceChange = oldPrice && newPrice
                ? ((newPrice - oldPrice) / oldPrice * 100).toFixed(1)
                : null;

            await supabase.from('amazon_products').update({
                current_price: fresh.price || product.current_price,
                title: fresh.title || product.title,
                rating: fresh.rating || product.rating,
                review_count: fresh.reviews || product.review_count,
                in_stock: fresh.in_stock,
                last_fetched: new Date().toISOString(),
                price_history: priceHistory.slice(-30),
            }).eq('id', product.id);

            updated.push({ id: product.id, label: product.label, asin: product.asin, old_price: product.current_price, new_price: fresh.price, price_change_pct: priceChange, in_stock: fresh.in_stock });
        }

        return NextResponse.json({ updated, count: updated.length });
    }

    if (body.action === 'generate_product_html') {
        const { asin, title, price, rating, reviews, affiliate_url, style } = body;
        const prompt = `Generate a clean HTML product box/card for embedding in a blog post.

Product: ${title || asin}
Price: ${price ? '$' + price : 'Check price'}
Rating: ${rating || 'N/A'}
Reviews: ${reviews || 0}
Affiliate URL: ${affiliate_url}
Style: ${style || 'simple'}

Return JSON: { "html": "complete self-contained HTML with inline CSS for a product card", "schema_json": "Product schema JSON-LD string" }`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); }
        catch { result = { html: '<div>Product card generation failed</div>' }; }
        return NextResponse.json({ result, provider });
    }

    if (body.action === 'delete') {
        await supabase.from('amazon_products').delete().eq('id', body.product_id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
