import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const PredictSchema = z.object({
    action: z.literal('predict'),
    keyword: z.string().min(1),
    niche: z.string().optional(),
    your_da: z.number().int().min(1).max(100).optional(),
    word_count: z.number().int().min(300).default(1500),
    post_type: z.enum(['how_to', 'listicle', 'review', 'comparison', 'guide', 'news']).default('guide'),
    has_schema: z.boolean().default(false),
    has_video: z.boolean().default(false),
    monetization: z.array(z.string()).default(['affiliate']),
    site_id: z.string().uuid().optional(),
    publish_date: z.string().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('post_predictions')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ predictions: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'predict') {
        const parsed = PredictSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `You are an SEO and affiliate marketing expert. Predict the performance of a blog post before it's published.

Keyword: "${d.keyword}"
Niche: ${d.niche || 'general'}
Your DA: ${d.your_da || 'unknown (new site assumed)'}
Word Count: ${d.word_count}
Post Type: ${d.post_type}
Has Schema: ${d.has_schema}
Has Video: ${d.has_video}
Monetization: ${d.monetization.join(', ')}
Target Publish Date: ${d.publish_date || 'ASAP'}

Based on typical keyword competition, DA requirements, and content factors, predict realistic performance.
Be conservative and data-driven, not optimistic.

Return JSON:
{
  "ranking_probability": {
    "top_3": number (0-100),
    "top_10": number (0-100),
    "top_30": number (0-100)
  },
  "time_to_rank_months": number,
  "expected_monthly_traffic": {
    "month_3": number,
    "month_6": number,
    "month_12": number
  },
  "expected_monthly_revenue": {
    "month_3": number,
    "month_6": number,
    "month_12": number
  },
  "confidence_score": number (0-100),
  "key_factors": [
    { "factor": string, "impact": "positive"|"negative"|"neutral", "explanation": string }
  ],
  "improvements_to_increase_success": [
    { "action": string, "probability_boost": number, "effort": "low"|"medium"|"high" }
  ],
  "competitive_advantage_needed": string,
  "break_even_timeline": string,
  "roi_estimate": string,
  "publish_timing_advice": string
}`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let prediction;
        try { prediction = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        await supabase.from('post_predictions').insert({
            user_id: user.id, site_id: d.site_id || null, keyword: d.keyword,
            niche: d.niche || null, post_type: d.post_type, word_count: d.word_count,
            top10_probability: prediction.ranking_probability?.top_10 || 0,
            time_to_rank: prediction.time_to_rank_months || 0,
            month12_traffic: prediction.expected_monthly_traffic?.month_12 || 0,
            month12_revenue: prediction.expected_monthly_revenue?.month_12 || 0,
            confidence_score: prediction.confidence_score || 0,
            prediction_data: prediction,
        });

        return NextResponse.json({ prediction, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
