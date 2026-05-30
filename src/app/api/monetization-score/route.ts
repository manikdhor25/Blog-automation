import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ScoreSchema = z.object({
    action: z.literal('score'),
    post_id: z.string().uuid().optional(),
    title: z.string().min(1),
    content: z.string().min(100),
    niche: z.string().optional(),
    current_monthly_traffic: z.number().int().min(0).default(0),
});

const BulkScoreSchema = z.object({
    action: z.literal('bulk_score'),
    site_id: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    const postId = url.searchParams.get('post_id');

    let query = supabase.from('monetization_scores').select('*').eq('user_id', user.id).order('score', { ascending: false });
    if (siteId) query = query.eq('site_id', siteId);
    if (postId) query = query.eq('post_id', postId);

    const { data } = await query.limit(50);
    return NextResponse.json({ scores: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'score') {
        const parsed = ScoreSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Analyze this blog post for monetization potential and give specific improvement recommendations.

Title: ${d.title}
Niche: ${d.niche || 'unknown'}
Monthly Traffic: ${d.current_monthly_traffic.toLocaleString()} visitors
Content preview: ${d.content.substring(0, 2000)}

Score this post across these dimensions and provide actionable improvements:

Return JSON:
{
  "score": number (0-100),
  "grade": "A"|"B"|"C"|"D"|"F",
  "monthly_revenue_potential": number (estimated $ per month at current traffic),
  "dimensions": {
    "affiliate_link_density": { "score": number, "current": string, "recommendation": string },
    "buyer_intent_strength": { "score": number, "assessment": string, "recommendation": string },
    "cta_effectiveness": { "score": number, "issues": [string], "recommendation": string },
    "product_coverage": { "score": number, "missing_products": [string] },
    "comparison_opportunity": { "score": number, "recommendation": string },
    "email_capture_opportunity": { "score": number, "recommendation": string }
  },
  "affiliate_products_to_add": [
    { "product": "product name", "type": "affiliate|adsense|sponsored", "placement": "intro|body|conclusion", "estimated_monthly": number }
  ],
  "quick_wins": [
    { "action": "specific action to take", "effort": "low|medium|high", "revenue_impact": "low|medium|high", "estimated_monthly_gain": number }
  ],
  "missing_ctas": ["CTA description and placement"],
  "content_gaps_for_more_revenue": ["gap description"]
}`;

        const { text, provider } = await routeAI({ task: 'data_analysis', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        if (d.post_id) {
            await supabase.from('monetization_scores').upsert({
                user_id: user.id, post_id: d.post_id,
                title: d.title, score: result.score, grade: result.grade,
                revenue_potential: result.monthly_revenue_potential || 0,
                quick_wins_count: result.quick_wins?.length || 0,
                score_data: result, scored_at: new Date().toISOString(),
            }, { onConflict: 'user_id,post_id' });
        }

        return NextResponse.json({ result, provider });
    }

    if (body.action === 'bulk_score') {
        const parsed = BulkScoreSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { data: posts } = await supabase.from('posts')
            .select('id, title, content, word_count').eq('site_id', parsed.data.site_id).limit(parsed.data.limit);
        if (!posts?.length) return NextResponse.json({ error: 'No posts found' }, { status: 404 });

        const results = [];
        for (const post of posts.slice(0, 5)) { // Limit to 5 for API cost
            if (!post.content) continue;
            const quickPrompt = `Score this post's monetization potential 0-100 and give 3 quick wins.
Title: ${post.title}
Content: ${post.content.substring(0, 500)}
Return JSON: { "score": number, "grade": "A"|"B"|"C"|"D"|"F", "revenue_potential": number, "quick_wins": [string] }`;
            const { text } = await routeAI({ task: 'data_analysis', prompt: quickPrompt, json: true });
            try {
                const r = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}');
                results.push({ post_id: post.id, title: post.title, ...r });
                await supabase.from('monetization_scores').upsert({
                    user_id: user.id, post_id: post.id, title: post.title,
                    score: r.score || 0, grade: r.grade || 'C',
                    revenue_potential: r.revenue_potential || 0,
                    quick_wins_count: r.quick_wins?.length || 0,
                    score_data: r, scored_at: new Date().toISOString(),
                }, { onConflict: 'user_id,post_id' });
            } catch { /* skip */ }
        }

        return NextResponse.json({ results, scored: results.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
