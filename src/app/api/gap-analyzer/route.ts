// ============================================================
// RankMaster Pro - Topical Gap Analyzer API
// Find topics competitors rank for that you don't cover
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['analyze', 'get_suggestions', 'list', 'dismiss']),
    site_id: z.string().uuid().optional(),
    competitor_domains: z.array(z.string()).max(5).optional(),
    niche: z.string().max(200).optional(),
    your_topics: z.array(z.string()).max(200).optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'analyze') {
        const { site_id, competitor_domains, niche } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        // Get your existing topics from posts and keywords
        const [postsRes, keywordsRes, competitorsRes] = await Promise.all([
            auth.supabase.from('posts').select('title, slug').eq('site_id', site_id).eq('user_id', auth.user.id).limit(100),
            auth.supabase.from('keywords').select('keyword').eq('site_id', site_id).eq('user_id', auth.user.id).limit(200),
            auth.supabase.from('competitors').select('domain').eq('site_id', site_id).eq('user_id', auth.user.id),
        ]);

        const yourTopics = [
            ...(postsRes.data || []).map(p => p.title),
            ...(keywordsRes.data || []).map(k => k.keyword),
        ];

        const competitors = [
            ...(competitor_domains || []),
            ...(competitorsRes.data || []).map((c: { domain: string }) => c.domain),
        ].slice(0, 5);

        const { data: site } = await auth.supabase.from('sites').select('niche, url').eq('id', site_id).single();
        const siteNiche = niche || site?.niche || 'general';

        const topicsList = yourTopics.slice(0, 50).join(', ');
        const competitorsList = competitors.length ? competitors.join(', ') : 'similar sites in the niche';

        const prompt = `You are a content strategist analyzing topical gaps for a ${siteNiche} website.

Your existing content covers: ${topicsList || 'nothing yet'}
Competitor domains to analyze against: ${competitorsList}
Niche: ${siteNiche}

Identify 20 high-value topic gaps — topics that authoritative sites in this niche cover but that are NOT in the existing content list above.

Return ONLY valid JSON array:
[
  {
    "topic": "specific topic or keyword phrase",
    "content_type": "article|comparison|review|listicle|how-to|guide",
    "search_intent": "informational|commercial|transactional",
    "estimated_volume": "high|medium|low",
    "difficulty": "easy|medium|hard",
    "revenue_potential": "high|medium|low",
    "why_important": "why this gap hurts your authority",
    "suggested_title": "H1 title for the content",
    "priority_score": 85,
    "cluster": "which topical cluster this belongs to"
  }
]`;

        const result = await routeAI({ task: 'competitor_analysis', prompt, systemPrompt: 'Content strategist. Return only JSON array.', maxTokens: 3000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\[[\s\S]*\]/);
            const gaps = JSON.parse(jsonMatch?.[0] || '[]');

            // Save to DB
            if (gaps.length > 0) {
                await auth.supabase.from('topic_gaps').insert(
                    gaps.map((g: { topic: string; content_type: string; search_intent: string; estimated_volume: string; difficulty: string; revenue_potential: string; why_important: string; suggested_title: string; priority_score: number; cluster: string }) => ({
                        user_id: auth.user.id,
                        site_id,
                        topic: g.topic,
                        content_type: g.content_type,
                        search_intent: g.search_intent,
                        estimated_volume: g.estimated_volume,
                        difficulty: g.difficulty,
                        revenue_potential: g.revenue_potential,
                        why_important: g.why_important,
                        suggested_title: g.suggested_title,
                        priority_score: g.priority_score,
                        cluster: g.cluster,
                        status: 'new',
                    }))
                );
            }

            return NextResponse.json({ gaps, count: gaps.length, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'dismiss') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('topic_gaps').update({ status: 'dismissed' }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const status = searchParams.get('status') || 'new';

    let query = auth.supabase.from('topic_gaps').select('*').eq('user_id', auth.user.id).order('priority_score', { ascending: false });
    if (siteId) query = query.eq('site_id', siteId);
    if (status !== 'all') query = query.eq('status', status);

    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ gaps: data || [] });
}
