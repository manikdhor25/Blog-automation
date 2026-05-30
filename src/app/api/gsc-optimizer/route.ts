import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const AnalyzeSchema = z.object({
    action: z.literal('analyze'),
    site_id: z.string().uuid().optional(),
    min_impressions: z.number().int().default(100),
    max_ctr: z.number().default(3),
    limit: z.number().int().default(50),
});

const OptimizeSchema = z.object({
    action: z.literal('optimize'),
    query: z.string().min(1),
    current_title: z.string().min(1),
    current_meta: z.string().optional(),
    impressions: z.number().int(),
    clicks: z.number().int(),
    position: z.number(),
    url: z.string().optional(),
    post_id: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');

    let q = supabase.from('gsc_ctr_opportunities').select('*').eq('user_id', user.id).order('impressions', { ascending: false });
    if (siteId) q = q.eq('site_id', siteId);
    const { data } = await q.limit(100);

    // Pull from gsc_data if available
    let gscQ = supabase.from('gsc_data').select('query, impressions, clicks, ctr, position, page').eq('user_id', user.id).order('impressions', { ascending: false });
    if (siteId) gscQ = gscQ.eq('site_id', siteId);
    const { data: gscData } = await gscQ.limit(200);

    // Filter for low CTR / high impression opportunities
    const opportunities = (gscData || []).filter(r => r.impressions >= 100 && r.ctr < 0.03 && r.position <= 30);

    return NextResponse.json({ opportunities: data || [], gsc_data: opportunities, total_gsc_queries: gscData?.length || 0 });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'analyze') {
        const parsed = AnalyzeSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Pull GSC data
        let q = supabase.from('gsc_data').select('*').eq('user_id', user.id).gte('impressions', d.min_impressions).lte('ctr', d.max_ctr / 100);
        if (d.site_id) q = q.eq('site_id', d.site_id);
        const { data: gscData } = await q.order('impressions', { ascending: false }).limit(d.limit);

        if (!gscData?.length) return NextResponse.json({ message: 'No GSC data found. Connect Search Console and wait for data sync.', opportunities: [] });

        // Score opportunities
        const scored = gscData.map(r => ({
            ...r,
            opportunity_score: Math.round((r.impressions * (0.03 - Math.min(r.ctr, 0.03)) * 100)),
            potential_clicks: Math.round(r.impressions * 0.03 - r.clicks),
        })).sort((a, b) => b.opportunity_score - a.opportunity_score);

        // Save top opportunities
        for (const opp of scored.slice(0, 20)) {
            await supabase.from('gsc_ctr_opportunities').upsert({
                user_id: user.id, site_id: d.site_id || null, query: opp.query,
                page: opp.page, impressions: opp.impressions, clicks: opp.clicks,
                ctr: opp.ctr, position: opp.position,
                opportunity_score: opp.opportunity_score, potential_clicks: opp.potential_clicks,
                status: 'pending',
            }, { onConflict: 'user_id,query,page' });
        }

        return NextResponse.json({ opportunities: scored.slice(0, 50), total: scored.length });
    }

    if (body.action === 'optimize') {
        const parsed = OptimizeSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Optimize this page's title and meta description to improve CTR from Google Search.

Search Query: "${d.query}"
Current Title: "${d.current_title}"
Current Meta: "${d.current_meta || 'not set'}"
Position: #${d.position.toFixed(1)}
Impressions: ${d.impressions.toLocaleString()} / month
Current Clicks: ${d.clicks}
Current CTR: ${((d.clicks / d.impressions) * 100).toFixed(2)}%

Goal: Increase CTR above 3%. The query "${d.query}" is what users searched. Optimize for click-through.

Return JSON:
{
  "optimized_title": "new title max 60 chars with power word/number",
  "optimized_meta": "new meta 120-155 chars with clear value proposition and CTA",
  "title_changes": ["what changed and why"],
  "ctr_prediction": number (expected CTR after optimization),
  "potential_monthly_clicks": number,
  "a_b_variants": [
    { "title": "variant 2 title", "meta": "variant 2 meta" }
  ]
}`;

        const { text, provider } = await routeAI({ task: 'content_optimization', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        // Apply to post if given
        if (d.post_id && result.optimized_meta) {
            await supabase.from('posts').update({ meta_description: result.optimized_meta }).eq('id', d.post_id).eq('user_id', user.id);
        }

        // Mark as optimized
        await supabase.from('gsc_ctr_opportunities').update({ status: 'optimized', optimized_at: new Date().toISOString() }).eq('user_id', user.id).eq('query', d.query);

        return NextResponse.json({ result, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
