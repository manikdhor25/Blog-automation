// ============================================================
// RankMaster Pro - SEO Difficulty Predictor API
// Predict exact score needed to rank + content requirements
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['predict', 'batch_predict']),
    keyword: z.string().max(200).optional(),
    keywords: z.array(z.string()).max(20).optional(),
    niche: z.string().max(200).optional(),
    your_domain_authority: z.number().min(0).max(100).default(20).optional(),
});

// Returns the real organic competitor URLs for a keyword (best-effort scrape).
// We deliberately do NOT fabricate DA/word-count/schema metrics — feeding
// random numbers into the prediction prompt would make the "data-driven"
// output meaningless. For real competitor metrics, wire in the SERP/Moz API.
async function scrapeAndAnalyzeSERP(keyword: string): Promise<{ competitors: string[] }> {
    try {
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=10`;
        const res = await fetch(googleUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(8000),
        });
        const html = await res.text();
        const domains = (html.match(/\/url\?q=(https?:\/\/[^&"]+)/g) || [])
            .map(m => m.replace('/url?q=', ''))
            .filter(u => !u.includes('google.com'))
            .slice(0, 10);

        return { competitors: domains };
    } catch {
        return { competitors: [] };
    }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    const predictSingle = async (keyword: string) => {
        const { niche, your_domain_authority = 20 } = parsed.data;

        // Get competitor data
        const serpData = await scrapeAndAnalyzeSERP(keyword);

        const prompt = `Predict the SEO difficulty and requirements to rank #1 for "${keyword}" in the ${niche || 'general'} niche.

Your Domain Authority: ${your_domain_authority}
Current top-ranking competitor URLs: ${serpData.competitors.length ? JSON.stringify(serpData.competitors.slice(0, 5)) : 'unavailable — estimate from the keyword and niche'}

Return ONLY valid JSON:
{
  "keyword": "${keyword}",
  "difficulty_score": 65,
  "difficulty_label": "easy|medium|hard|very_hard",
  "min_seo_score_to_rank_top3": 82,
  "min_word_count": 2200,
  "min_backlinks_needed": 15,
  "da_requirement": 35,
  "can_rank_with_your_da": true,
  "time_to_rank_estimate": "3-6 months",
  "key_ranking_factors": ["factor 1", "factor 2", "factor 3"],
  "content_requirements": {
    "must_have_schema": true,
    "must_have_video": false,
    "must_have_table": true,
    "min_images": 3,
    "must_have_faq": true
  },
  "competing_features": ["featured snippet", "PAA", "video carousel"],
  "opportunity_score": 78,
  "quick_win_potential": "high|medium|low",
  "recommended_content_type": "comparison|review|how-to|guide",
  "differentiation_strategy": "what makes YOUR post win"
}`;

        const result = await routeAI({ task: 'content_scoring', prompt, systemPrompt: 'SEO difficulty predictor. Data-driven. Return only JSON.', maxTokens: 1000, jsonMode: true });
        if (!result.success || !result.content) return { keyword, error: 'Prediction failed' };

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            return JSON.parse(m?.[0] || result.content);
        } catch { return { keyword, error: 'Parse failed' }; }
    };

    if (action === 'predict') {
        const { keyword } = parsed.data;
        if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 });
        const prediction = await predictSingle(keyword);

        // Save prediction
        await auth.supabase.from('seo_predictions').insert({
            user_id: auth.user.id,
            keyword,
            difficulty_score: prediction.difficulty_score || 0,
            min_seo_score: prediction.min_seo_score_to_rank_top3 || 0,
            time_estimate: prediction.time_to_rank_estimate || '',
            prediction_data: prediction,
        });

        return NextResponse.json({ prediction });
    }

    if (action === 'batch_predict') {
        const { keywords } = parsed.data;
        if (!keywords?.length) return NextResponse.json({ error: 'keywords required' }, { status: 400 });

        const predictions = [];
        for (const kw of keywords.slice(0, 10)) {
            const p = await predictSingle(kw);
            predictions.push(p);
        }

        predictions.sort((a, b) => (a.opportunity_score || 0) - (b.opportunity_score || 0)).reverse();
        return NextResponse.json({ predictions, count: predictions.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('seo_predictions').select('id, keyword, difficulty_score, min_seo_score, time_estimate, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ predictions: data || [] });
}
