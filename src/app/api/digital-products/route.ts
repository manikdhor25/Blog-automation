// ============================================================
// RankMaster Pro - Digital Product Manager API
// Sell ebooks/templates/courses — Gumroad/Lemon Squeezy/Stripe
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['create', 'update', 'list', 'delete', 'log_sale', 'generate_description', 'get_summary']),
    id: z.string().uuid().optional(),
    name: z.string().max(200).optional(),
    type: z.enum(['ebook', 'template', 'course', 'checklist', 'swipe_file', 'membership', 'bundle', 'other']).optional(),
    price: z.number().min(0).optional(),
    currency: z.string().max(10).default('USD').optional(),
    platform: z.enum(['gumroad', 'lemon_squeezy', 'stripe', 'payhip', 'teachable', 'podia', 'direct']).optional(),
    product_url: z.string().url().optional(),
    checkout_url: z.string().url().optional(),
    niche: z.string().max(200).optional(),
    description: z.string().max(3000).optional(),
    image_url: z.string().optional(),
    is_active: z.boolean().optional(),
    sale_amount: z.number().min(0).optional(),
    sale_date: z.string().optional(),
    buyer_email: z.string().email().optional(),
});

async function fetchGumroadStats(apiKey: string, productId: string) {
    try {
        const res = await fetch(`https://api.gumroad.com/v2/products/${productId}?access_token=${apiKey}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        return { sales: data.product?.sales_count || 0, revenue: data.product?.revenue_cents / 100 || 0 };
    } catch { return null; }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate_description') {
        const { name, type, niche, price } = parsed.data;
        if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

        const prompt = `Write a high-converting product description for a digital product.

Product: "${name}"
Type: ${type || 'digital product'}
Niche: ${niche || 'general'}
Price: $${price || 0}

Return ONLY valid JSON:
{
  "headline": "benefit-driven headline (max 80 chars)",
  "subheadline": "supporting statement (max 120 chars)",
  "description": "3-4 paragraph sales description, benefit-focused, specific outcomes, no hype",
  "bullet_points": ["benefit 1", "benefit 2", "benefit 3", "benefit 4", "benefit 5"],
  "cta_text": "Buy Now button text",
  "seo_description": "150-char product meta description",
  "target_audience": "who this is for",
  "pain_points": ["problem 1", "problem 2", "problem 3"]
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'Conversion copywriter. Return only JSON.', maxTokens: 1000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            return NextResponse.json({ description: JSON.parse(jsonMatch?.[0] || result.content), provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'create') {
        const { name, type, price, currency, platform, product_url, checkout_url, niche, description, image_url } = parsed.data;
        if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('digital_products').insert({
            user_id: auth.user.id, name, type: type || 'other', price: price || 0,
            currency: currency || 'USD', platform: platform || 'direct',
            product_url: product_url || null, checkout_url: checkout_url || null,
            niche: niche || '', description: description || '', image_url: image_url || null,
            is_active: true, total_sales: 0, total_revenue: 0,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ product: data });
    }

    if (action === 'update') {
        const { id, action: _a, ...updates } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('digital_products').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'log_sale') {
        const { id, sale_amount, sale_date, buyer_email } = parsed.data;
        if (!id || sale_amount === undefined) return NextResponse.json({ error: 'id and sale_amount required' }, { status: 400 });

        await auth.supabase.from('digital_product_sales').insert({
            user_id: auth.user.id, product_id: id, amount: sale_amount,
            sale_date: sale_date || new Date().toISOString().split('T')[0],
            buyer_email: buyer_email || null,
        });

        // Update totals
        const { data: product } = await auth.supabase.from('digital_products').select('total_sales, total_revenue').eq('id', id).single();
        if (product) {
            await auth.supabase.from('digital_products').update({
                total_sales: (product.total_sales || 0) + 1,
                total_revenue: (product.total_revenue || 0) + sale_amount,
                updated_at: new Date().toISOString(),
            }).eq('id', id);
        }

        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('digital_products').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'get_summary') {
        const { data: products } = await auth.supabase.from('digital_products').select('total_sales, total_revenue, is_active, type').eq('user_id', auth.user.id);
        const totalRevenue = (products || []).reduce((s: number, p: { total_revenue: number }) => s + (p.total_revenue || 0), 0);
        const totalSales = (products || []).reduce((s: number, p: { total_sales: number }) => s + (p.total_sales || 0), 0);
        return NextResponse.json({ summary: { total_products: (products || []).length, active: (products || []).filter((p: { is_active: boolean }) => p.is_active).length, total_sales: totalSales, total_revenue: totalRevenue } });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('digital_products').select('*').eq('user_id', auth.user.id).order('total_revenue', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: data || [] });
}
