// ============================================================
// RankMaster Pro - Social Listening Monitor API
// Track brand+keyword mentions on Reddit, Twitter, Quora
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['scan', 'scan_reddit', 'list_mentions', 'mark_actioned', 'get_opportunities']),
    keywords: z.array(z.string()).max(10).optional(),
    brand_name: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    site_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

async function searchReddit(query: string): Promise<Array<{
    title: string; url: string; subreddit: string; score: number;
    num_comments: number; created_utc: number; selftext: string;
}>> {
    try {
        const res = await fetch(
            `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25`,
            { headers: { 'User-Agent': 'RankMaster/1.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data?.children || []).map((c: { data: { title: string; url: string; subreddit: string; score: number; num_comments: number; created_utc: number; selftext: string } }) => ({
            title: c.data.title,
            url: `https://reddit.com${c.data.url}`,
            subreddit: c.data.subreddit,
            score: c.data.score,
            num_comments: c.data.num_comments,
            created_utc: c.data.created_utc,
            selftext: c.data.selftext?.substring(0, 300) || '',
        }));
    } catch { return []; }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'scan' || action === 'scan_reddit') {
        const { keywords, brand_name, niche } = parsed.data;
        const searchTerms = [...(keywords || []), ...(brand_name ? [brand_name] : []), ...(niche ? [niche] : [])].slice(0, 5);

        if (searchTerms.length === 0) return NextResponse.json({ error: 'keywords, brand_name, or niche required' }, { status: 400 });

        const allMentions = [];

        for (const term of searchTerms) {
            const posts = await searchReddit(term);
            for (const post of posts) {
                // Classify opportunity type
                const isQuestion = /\?|how|what|which|best|recommend/i.test(post.title);
                const isLinkOpp = /recommend|best|resource|guide|tutorial|where can/i.test(post.title + post.selftext);
                const isBrandMention = brand_name && (post.title + post.selftext).toLowerCase().includes(brand_name.toLowerCase());

                allMentions.push({
                    source: 'reddit',
                    search_term: term,
                    title: post.title,
                    url: post.url,
                    subreddit: post.subreddit,
                    score: post.score,
                    comments: post.num_comments,
                    created_at: new Date(post.created_utc * 1000).toISOString(),
                    excerpt: post.selftext,
                    opportunity_type: isBrandMention ? 'brand_mention' : isLinkOpp ? 'link_opportunity' : isQuestion ? 'answer_opportunity' : 'general',
                    engagement: post.score + post.num_comments,
                });
            }
        }

        // Sort by engagement
        allMentions.sort((a, b) => b.engagement - a.engagement);

        // Save to DB
        if (allMentions.length > 0) {
            await auth.supabase.from('social_mentions').insert(
                allMentions.slice(0, 50).map(m => ({
                    user_id: auth.user.id,
                    source: m.source,
                    search_term: m.search_term,
                    title: m.title,
                    url: m.url,
                    platform_id: m.url,
                    opportunity_type: m.opportunity_type,
                    engagement_score: m.engagement,
                    excerpt: m.excerpt,
                    discovered_at: new Date().toISOString(),
                    status: 'new',
                }))
            );
        }

        return NextResponse.json({ mentions: allMentions, count: allMentions.length, opportunities: allMentions.filter(m => m.opportunity_type !== 'general').length });
    }

    if (action === 'get_opportunities') {
        const { niche, site_id } = parsed.data;

        // Get recent high-engagement mentions
        const { data: mentions } = await auth.supabase.from('social_mentions').select('*').eq('user_id', auth.user.id).neq('opportunity_type', 'general').eq('status', 'new').order('engagement_score', { ascending: false }).limit(20);

        if (!mentions?.length) return NextResponse.json({ opportunities: [] });

        // AI-analyze and suggest actions
        const mentionList = (mentions || []).slice(0, 5).map(m => `${m.opportunity_type}: "${m.title}" on ${m.url}`).join('\n');

        const prompt = `Analyze these social media mentions and suggest specific actions to gain links or traffic.

Niche: ${niche || 'general'}
Mentions:
${mentionList}

Return ONLY valid JSON array:
[
  {
    "mention_url": "url",
    "action": "what to do",
    "action_type": "answer_question|suggest_resource|engage_brand_mention|pitch_link",
    "template": "exact reply or comment to post",
    "expected_outcome": "what you'll get from this action"
  }
]`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'Social media strategist. Specific, actionable. Return only JSON array.', maxTokens: 1000, jsonMode: true });
        let actionPlan = [];
        if (result.success && result.content) {
            try { const m = result.content.match(/\[[\s\S]*\]/); actionPlan = JSON.parse(m?.[0] || '[]'); } catch { /* skip */ }
        }

        return NextResponse.json({ opportunities: mentions, action_plan: actionPlan });
    }

    if (action === 'mark_actioned') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('social_mentions').update({ status: 'actioned' }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const oppType = searchParams.get('type');
    const status = searchParams.get('status') || 'new';

    let query = auth.supabase.from('social_mentions').select('*').eq('user_id', auth.user.id).order('engagement_score', { ascending: false });
    if (status !== 'all') query = query.eq('status', status);
    if (oppType) query = query.eq('opportunity_type', oppType);

    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mentions: data || [] });
}
