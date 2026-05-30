// ============================================================
// RankMaster Pro - LSI / Semantic Keyword Expander API
// Find related terms, NLP entities, semantic variations
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    keyword: z.string().min(1).max(200),
    niche: z.string().max(200).optional(),
    post_id: z.string().uuid().optional(),
    existing_keywords: z.array(z.string()).max(50).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { keyword, niche, existing_keywords = [] } = parsed.data;

    const existing = existing_keywords.length ? `\nAvoid these (already in post): ${existing_keywords.slice(0, 20).join(', ')}` : '';

    const prompt = `You are an NLP/SEO expert. Generate comprehensive semantic keyword data for: "${keyword}" in the ${niche || 'general'} niche.${existing}

Return ONLY valid JSON:
{
  "primary_keyword": "${keyword}",
  "lsi_keywords": ["related term 1", "related term 2"],
  "semantic_variations": ["synonym/variation 1", "variation 2"],
  "nlp_entities": [
    {"entity": "entity name", "type": "PRODUCT|PERSON|ORG|CONCEPT|PLACE", "relevance": 0.9}
  ],
  "related_questions": ["question 1?", "question 2?"],
  "co_occurring_terms": ["term that appears with keyword", "term 2"],
  "topic_clusters": ["broader topic 1", "broader topic 2"],
  "intent_modifiers": {
    "informational": ["how to", "what is", "guide to"],
    "commercial": ["best", "review", "vs", "alternatives"],
    "transactional": ["buy", "cheap", "deal", "discount"]
  },
  "content_gaps": ["angle not yet covered 1", "angle 2"],
  "readability_level": "beginner|intermediate|advanced",
  "estimated_word_count": 2000
}

Provide 15-25 LSI keywords, 8-12 entities, 10 related questions.`;

    const result = await routeAI({ task: 'keyword_suggestion', prompt, systemPrompt: 'NLP/SEO expert. Return only JSON.', maxTokens: 1500, jsonMode: true });
    if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

    try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        const data = JSON.parse(jsonMatch?.[0] || result.content);
        return NextResponse.json({ ...data, provider: result.provider });
    } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
}
