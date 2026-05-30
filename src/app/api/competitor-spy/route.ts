import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const SpySchema = z.object({
    action: z.literal('spy'),
    competitor_url: z.string().url(),
    niche: z.string().optional(),
    depth: z.enum(['quick', 'deep']).default('quick'),
});

const CompareSchema = z.object({
    action: z.literal('compare'),
    your_keywords: z.array(z.string()),
    competitor_keywords: z.array(z.string()),
    niche: z.string().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('competitor_spy_results')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ results: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'spy') {
        const parsed = SpySchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const domain = new URL(d.competitor_url).hostname.replace('www.', '');

        // IMPORTANT: this analysis is an AI-generated ESTIMATE based on niche
        // patterns, NOT scraped/measured competitor data. The prompt and the
        // response are explicitly labeled so users do not mistake projected
        // figures for real traffic/keyword measurements.
        const prompt = `You are an SEO strategist producing an ESTIMATED competitor profile for ${domain}.
You do NOT have access to live analytics for this domain. Infer a plausible profile from the
niche and typical sites of this kind. All numbers are projections, not measurements.

Niche context: ${d.niche || 'general blog/affiliate'}
Analysis depth: ${d.depth}

Provide a mix of informational, commercial, and transactional keyword opportunities this type
of site likely targets. Mark every numeric figure as an estimate.

Return JSON (all numbers are ESTIMATES):
{
  "domain": "${domain}",
  "estimated_monthly_traffic": number,
  "estimated_domain_authority": number,
  "total_ranking_keywords": number,
  "top_keywords": [
    {
      "keyword": "keyword",
      "position": number (1-100),
      "search_volume": number,
      "traffic_share_pct": number,
      "intent": "informational"|"commercial"|"transactional"|"navigational",
      "difficulty": number (1-100),
      "content_type": "article"|"review"|"comparison"|"landing_page",
      "opportunity_for_you": "high"|"medium"|"low",
      "gap_reason": "why you should target this"
    }
  ],
  "content_themes": ["theme1", "theme2", "theme3"],
  "top_pages_estimated": [
    { "title": "estimated page title", "slug": "/estimated-slug", "estimated_traffic": number, "monetization": "affiliate|adsense|both" }
  ],
  "keyword_gaps": ["keywords they likely rank for that you probably don't"],
  "their_strengths": ["strength1"],
  "their_weaknesses": ["weakness you can exploit"],
  "attack_strategy": "2-3 sentence strategy to outrank them"
}`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        // Tag provenance so the UI/consumer never treats this as measured data.
        result.data_source = 'ai_estimated';
        result.disclaimer = 'AI-generated estimate based on niche patterns — not measured analytics. Connect DataForSEO/SERP API for real competitor metrics.';

        await supabase.from('competitor_spy_results').insert({
            user_id: user.id, competitor_url: d.competitor_url, domain,
            estimated_traffic: result.estimated_monthly_traffic || 0,
            estimated_da: result.estimated_domain_authority || 0,
            keywords_found: result.top_keywords?.length || 0,
            result_data: result,
        });

        return NextResponse.json({ result, provider, data_source: 'ai_estimated' });
    }

    if (body.action === 'compare') {
        const parsed = CompareSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const yourSet = new Set(d.your_keywords.map(k => k.toLowerCase()));
        const theirSet = new Set(d.competitor_keywords.map(k => k.toLowerCase()));

        const gaps = d.competitor_keywords.filter(k => !yourSet.has(k.toLowerCase()));
        const advantages = d.your_keywords.filter(k => !theirSet.has(k.toLowerCase()));
        const overlap = d.your_keywords.filter(k => theirSet.has(k.toLowerCase()));

        return NextResponse.json({ gaps, advantages, overlap, gap_count: gaps.length, advantage_count: advantages.length, overlap_count: overlap.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
