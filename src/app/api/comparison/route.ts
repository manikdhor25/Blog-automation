// ============================================================
// RankMaster Pro - Comparison Table Generator API
// AI-powered product vs product comparison tables
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const ComparisonSchema = z.object({
    action: z.enum(['generate', 'save', 'list', 'delete']),
    title: z.string().max(500).optional(),
    keyword: z.string().max(200).optional(),
    products: z.array(z.object({
        name: z.string(),
        affiliate_url: z.string().optional(),
        price: z.number().nullable().optional(),
        rating: z.number().nullable().optional(),
        image_url: z.string().nullable().optional(),
        features: z.record(z.string(), z.string()).optional(),
    })).min(2).max(10).optional(),
    criteria: z.array(z.string()).max(20).optional(),
    post_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = ComparisonSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const { products, keyword, criteria } = parsed.data;
        if (!products || products.length < 2) return NextResponse.json({ error: 'At least 2 products required' }, { status: 400 });

        const productList = products.map((p, i) => `${i + 1}. ${p.name}${p.price ? ` ($${p.price})` : ''}${p.rating ? ` - ${p.rating}/5` : ''}`).join('\n');
        const criteriaList = criteria?.join(', ') || 'price, performance, ease of use, value for money, durability';

        const prompt = `You are a professional product reviewer and affiliate marketer. Create a detailed comparison for the keyword "${keyword || 'product comparison'}".

Products to compare:
${productList}

Compare across these criteria: ${criteriaList}

Return ONLY valid JSON with this exact structure:
{
  "table_html": "<table>...</table>",
  "summary": "2-3 sentence overview",
  "winner": "product name",
  "winner_reason": "why this product wins",
  "products": [
    {
      "name": "Product Name",
      "pros": ["pro1", "pro2", "pro3"],
      "cons": ["con1", "con2"],
      "verdict": "1-2 sentence verdict",
      "score": 8.5,
      "badge": "Best Value | Best Overall | Budget Pick | Premium Choice",
      "scores": {
        "criterion_name": 8
      }
    }
  ],
  "schema_markup": { "@context": "https://schema.org", "@type": "ItemList", "itemListElement": [] },
  "faq": [
    { "question": "...", "answer": "..." }
  ]
}

The table_html should be a complete, styled HTML table with headers for each criterion and rows for each product. Use checkmarks (✓) and X marks for boolean features. Include affiliate-friendly styling.`;

        const result = await routeAI({
            task: 'content_writing',
            prompt,
            systemPrompt: 'Expert product reviewer. Return only valid JSON.',
            maxTokens: 3000,
            jsonMode: true,
        });

        if (!result.success || !result.content) {
            return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
        }

        let parsed_result;
        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            parsed_result = JSON.parse(jsonMatch?.[0] || result.content);
        } catch {
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }

        return NextResponse.json({ comparison: parsed_result, provider: result.provider });
    }

    if (action === 'save') {
        const { data, error } = await auth.supabase
            .from('comparison_tables')
            .insert({
                user_id: auth.user.id,
                post_id: parsed.data.post_id || null,
                title: parsed.data.title || 'Product Comparison',
                keyword: parsed.data.keyword || '',
                products_json: parsed.data.products || [],
                created_at: new Date().toISOString(),
            })
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ table: data });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('comparison_tables').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase
        .from('comparison_tables')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tables: data || [] });
}
