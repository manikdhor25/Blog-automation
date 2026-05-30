// ============================================================
// RankMaster Pro - Context-Aware Content Idea Generator API
// Analyzes YOUR site gaps → specific monetizable ideas
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['generate', 'save', 'dismiss', 'list']),
    site_id: z.string().uuid().optional(),
    niche: z.string().max(200).optional(),
    monthly_revenue_goal: z.number().min(0).optional(),
    content_type_focus: z.enum(['affiliate', 'informational', 'mixed']).default('mixed').optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const { site_id, niche, monthly_revenue_goal, content_type_focus = 'mixed' } = parsed.data;

        // Get site context
        const [postsRes, kwRes, clustersRes, afRes] = await Promise.all([
            auth.supabase.from('posts').select('title, keyword_id').eq('user_id', auth.user.id).eq('status', 'published').limit(100),
            auth.supabase.from('keywords').select('keyword, search_volume, intent_type, status').eq('user_id', auth.user.id).limit(100),
            auth.supabase.from('topic_clusters').select('pillar_topic').eq('user_id', auth.user.id).limit(20),
            auth.supabase.from('affiliate_programs').select('name, network, commission_rate').eq('user_id', auth.user.id),
        ]);

        const existingTitles = (postsRes.data || []).map(p => p.title).join(', ');
        const existingKeywords = (kwRes.data || []).map(k => k.keyword).join(', ');
        const clusters = (clustersRes.data || []).map(c => c.pillar_topic).join(', ');
        const affiliatePrograms = (afRes.data || []).map(a => `${a.name} (${a.commission_rate}% on ${a.network})`).join(', ');

        const prompt = `You are a content strategist for a ${niche || 'general'} blog with affiliate income goals.

EXISTING CONTENT (don't suggest these):
${existingTitles || 'No posts yet'}

TRACKED KEYWORDS:
${existingKeywords || 'None tracked'}

TOPIC CLUSTERS:
${clusters || 'None defined'}

AFFILIATE PROGRAMS:
${affiliatePrograms || 'None configured'}

Monthly revenue goal: $${monthly_revenue_goal || 'not set'}
Content focus: ${content_type_focus}

Generate 20 highly specific, actionable content ideas that:
1. Fill obvious gaps in existing content
2. Complement existing topical clusters
3. Have affiliate monetization potential (link to existing programs)
4. Target keywords with real search demand
5. Are NOT already covered by existing posts

Return ONLY valid JSON array:
[
  {
    "title": "specific H1 title",
    "keyword": "primary target keyword",
    "search_volume_estimate": "1K-10K",
    "search_intent": "informational|commercial|transactional",
    "content_type": "review|comparison|how-to|listicle|guide|news",
    "monetization": "how to monetize this (which affiliate program)",
    "estimated_revenue_potential": "low|medium|high",
    "cluster": "which existing cluster this fits or 'new cluster'",
    "why_now": "why write this topic now",
    "priority_score": 85,
    "difficulty": "easy|medium|hard",
    "internal_links_from": ["existing post title to link from"]
  }
]`;

        const result = await routeAI({ task: 'keyword_suggestion', prompt, systemPrompt: 'Content strategist. Context-aware, monetization-focused. Return only JSON array.', maxTokens: 3000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const m = result.content.match(/\[[\s\S]*\]/);
            const ideas = JSON.parse(m?.[0] || '[]');

            // Save ideas
            if (ideas.length > 0) {
                await auth.supabase.from('content_ideas').insert(
                    ideas.map((idea: { title: string; keyword: string; search_volume_estimate: string; search_intent: string; content_type: string; monetization: string; estimated_revenue_potential: string; cluster: string; why_now: string; priority_score: number; difficulty: string }) => ({
                        user_id: auth.user.id,
                        site_id: site_id || null,
                        title: idea.title,
                        keyword: idea.keyword,
                        search_volume_estimate: idea.search_volume_estimate,
                        search_intent: idea.search_intent,
                        content_type: idea.content_type,
                        monetization: idea.monetization,
                        revenue_potential: idea.estimated_revenue_potential,
                        cluster: idea.cluster,
                        why_now: idea.why_now,
                        priority_score: idea.priority_score || 50,
                        difficulty: idea.difficulty,
                        status: 'new',
                    }))
                );
            }

            return NextResponse.json({ ideas, count: ideas.length, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'save') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('content_ideas').update({ status: 'saved' }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'dismiss') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('content_ideas').update({ status: 'dismissed' }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'new';

    let query = auth.supabase.from('content_ideas').select('*').eq('user_id', auth.user.id).order('priority_score', { ascending: false });
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ideas: data || [] });
}
