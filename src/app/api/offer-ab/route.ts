import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const CreateTestSchema = z.object({
    action: z.literal('create_test'),
    post_id: z.string().uuid().optional(),
    keyword: z.string().min(1),
    offer_a: z.object({ name: z.string(), url: z.string(), commission_rate: z.number().optional(), price: z.number().optional() }),
    offer_b: z.object({ name: z.string(), url: z.string(), commission_rate: z.number().optional(), price: z.number().optional() }),
    test_duration_days: z.number().int().min(7).max(90).default(14),
    site_id: z.string().uuid().optional(),
});

const RecordClickSchema = z.object({
    action: z.literal('record_click'),
    test_id: z.string().uuid(),
    variant: z.enum(['a', 'b']),
    converted: z.boolean().default(false),
    commission_amount: z.number().optional(),
});

const AnalyzeSchema = z.object({
    action: z.literal('analyze'),
    test_id: z.string().uuid(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const postId = url.searchParams.get('post_id');

    let query = supabase.from('offer_ab_tests').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (postId) query = query.eq('post_id', postId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tests: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create_test') {
        const parsed = CreateTestSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data, error } = await supabase.from('offer_ab_tests').insert({
            user_id: user.id,
            post_id: d.post_id || null,
            site_id: d.site_id || null,
            keyword: d.keyword,
            offer_a_name: d.offer_a.name,
            offer_a_url: d.offer_a.url,
            offer_a_commission_rate: d.offer_a.commission_rate || null,
            offer_a_price: d.offer_a.price || null,
            offer_b_name: d.offer_b.name,
            offer_b_url: d.offer_b.url,
            offer_b_commission_rate: d.offer_b.commission_rate || null,
            offer_b_price: d.offer_b.price || null,
            test_duration_days: d.test_duration_days,
            status: 'running',
            clicks_a: 0, clicks_b: 0, conversions_a: 0, conversions_b: 0,
            revenue_a: 0, revenue_b: 0,
            started_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + d.test_duration_days * 86400000).toISOString(),
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ test: data });
    }

    if (body.action === 'record_click') {
        const parsed = RecordClickSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: test } = await supabase.from('offer_ab_tests').select('*').eq('id', d.test_id).single();
        if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

        const updates: Record<string, number> = {};
        if (d.variant === 'a') {
            updates.clicks_a = (test.clicks_a || 0) + 1;
            if (d.converted) { updates.conversions_a = (test.conversions_a || 0) + 1; updates.revenue_a = (test.revenue_a || 0) + (d.commission_amount || 0); }
        } else {
            updates.clicks_b = (test.clicks_b || 0) + 1;
            if (d.converted) { updates.conversions_b = (test.conversions_b || 0) + 1; updates.revenue_b = (test.revenue_b || 0) + (d.commission_amount || 0); }
        }
        await supabase.from('offer_ab_tests').update(updates).eq('id', d.test_id);
        return NextResponse.json({ recorded: true });
    }

    if (body.action === 'analyze') {
        const parsed = AnalyzeSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { data: test } = await supabase.from('offer_ab_tests').select('*').eq('id', parsed.data.test_id).single();
        if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

        const ctr_a = test.clicks_a > 0 ? ((test.conversions_a / test.clicks_a) * 100).toFixed(2) : '0';
        const ctr_b = test.clicks_b > 0 ? ((test.conversions_b / test.clicks_b) * 100).toFixed(2) : '0';
        const epc_a = test.clicks_a > 0 ? (test.revenue_a / test.clicks_a).toFixed(4) : '0';
        const epc_b = test.clicks_b > 0 ? (test.revenue_b / test.clicks_b).toFixed(4) : '0';

        const prompt = `Analyze this affiliate offer A/B test and provide a recommendation:

Keyword: ${test.keyword}

Offer A: ${test.offer_a_name}
- Clicks: ${test.clicks_a}, Conversions: ${test.conversions_a}, Revenue: $${test.revenue_a}
- CTR: ${ctr_a}%, EPC: $${epc_a}
- Commission Rate: ${test.offer_a_commission_rate || 'unknown'}%

Offer B: ${test.offer_b_name}
- Clicks: ${test.clicks_b}, Conversions: ${test.conversions_b}, Revenue: $${test.revenue_b}
- CTR: ${ctr_b}%, EPC: $${epc_b}
- Commission Rate: ${test.offer_b_commission_rate || 'unknown'}%

Provide JSON: { "winner": "a"|"b"|"inconclusive", "confidence_pct": number, "lift_pct": number, "recommendation": string, "reasoning": string, "statistical_significance": string, "action_items": string[] }`;

        const { text, provider } = await routeAI({ task: 'data_analysis', prompt, json: true });
        let analysis;
        try { analysis = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); } catch { analysis = { winner: 'inconclusive', confidence_pct: 0, recommendation: text }; }

        if (analysis.winner !== 'inconclusive') {
            await supabase.from('offer_ab_tests').update({ status: 'concluded', winner: analysis.winner, analysis }).eq('id', parsed.data.test_id);
        }

        return NextResponse.json({ analysis: { ...analysis, ctr_a, ctr_b, epc_a, epc_b }, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
