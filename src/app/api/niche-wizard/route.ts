import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ResearchSchema = z.object({
    action: z.literal('research'),
    seed_niche: z.string().optional(),
    budget: z.enum(['bootstrap', 'moderate', 'aggressive']).default('moderate'),
    time_commitment: z.enum(['part_time', 'full_time']).default('part_time'),
    monetization_preference: z.array(z.enum(['affiliate', 'adsense', 'info_products', 'sponsored', 'mixed'])).default(['affiliate']),
    avoid_niches: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('niche_research_results')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
    return NextResponse.json({ results: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'research') {
        const parsed = ResearchSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `You are a niche site expert. Find 8 profitable blog niches for someone with these criteria:

Budget: ${d.budget} (bootstrap = <$500, moderate = $500-2000, aggressive = $2000+)
Time: ${d.time_commitment}
Monetization preference: ${d.monetization_preference.join(', ')}
Seed idea: ${d.seed_niche || 'any'}
Avoid: ${d.avoid_niches.join(', ') || 'none'}

For each niche, provide realistic data. Balance well-known and hidden-gem niches.

Return JSON array:
[{
  "niche": "specific niche name",
  "parent_category": "health|finance|tech|lifestyle|hobby|pet|etc",
  "opportunity_score": number (0-100),
  "competition_level": "low"|"medium"|"high",
  "monetization_score": number (0-100),
  "traffic_potential": "low"|"medium"|"high"|"very_high",
  "time_to_revenue_months": number,
  "estimated_monthly_revenue_12mo": number,
  "estimated_monthly_revenue_24mo": number,
  "startup_cost_estimate": number,
  "top_affiliate_programs": ["program name with commission info"],
  "example_keywords": ["keyword with volume estimate"],
  "example_sites": ["domain.com (DA estimate)"],
  "content_ideas": ["post title idea 1", "post title idea 2"],
  "why_now": "why this niche is good in 2025",
  "risks": ["risk1"],
  "hidden_gem": boolean,
  "sub_niches": ["sub1", "sub2"]
}]`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let niches;
        try { niches = JSON.parse(text.match(/\[[\s\S]+\]/)?.[0] || '[]'); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        const { data: saved } = await supabase.from('niche_research_results').insert({
            user_id: user.id, seed_niche: d.seed_niche || null, budget: d.budget,
            time_commitment: d.time_commitment, niches_count: niches.length, result_data: niches,
        }).select().single();

        return NextResponse.json({ niches, saved, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
