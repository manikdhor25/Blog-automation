// ============================================================
// RankMaster Pro - Affiliate Link Placement Optimizer API
// WHERE to place links for max CTR — position analysis + A/B
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['analyze', 'optimize', 'create_test', 'list_tests', 'record_click']),
    post_id: z.string().uuid().optional(),
    affiliate_url: z.string().url().optional(),
    product_name: z.string().max(200).optional(),
    test_id: z.string().uuid().optional(),
    position: z.enum(['intro', 'after_h2', 'middle', 'before_conclusion', 'conclusion', 'sidebar', 'sticky']).optional(),
});

const POSITION_CTR_BENCHMARKS: Record<string, number> = {
    intro: 2.1,
    after_h2: 3.4,
    middle: 2.8,
    before_conclusion: 4.2,
    conclusion: 3.8,
    sidebar: 1.2,
    sticky: 0.8,
};

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'analyze') {
        const { post_id } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('id, title, content_html, content_markdown').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const html = post.content_html || '';
        const text = post.content_markdown || html.replace(/<[^>]+>/g, ' ');

        // Find existing affiliate link positions
        const linkMatches = [...html.matchAll(/<a[^>]+href="([^"]*(?:affiliate|amz|go\/|shareasale)[^"]*)"[^>]*>(.*?)<\/a>/gi)];
        const currentPositions = linkMatches.map(m => {
            const idx = m.index || 0;
            const totalLen = html.length;
            const pct = (idx / totalLen) * 100;
            const zone = pct < 15 ? 'intro' : pct < 35 ? 'after_h2' : pct < 65 ? 'middle' : pct < 85 ? 'before_conclusion' : 'conclusion';
            return { url: m[1], anchor: m[2].replace(/<[^>]+>/g, ''), position_zone: zone, position_pct: Math.round(pct) };
        });

        const prompt = `Analyze this blog post's affiliate link placement strategy and provide optimization recommendations.

Post: "${post.title}"
Word count: ${text.split(/\s+/).length}
Current affiliate links: ${currentPositions.length} links at positions: ${currentPositions.map(p => `${p.position_pct}% (${p.position_zone})`).join(', ')}

Content excerpt:
${text.substring(0, 1500)}

Industry CTR benchmarks by position:
- Intro (0-15%): 2.1% avg CTR
- After H2 (15-35%): 3.4% avg CTR
- Middle (35-65%): 2.8% avg CTR
- Before conclusion (65-85%): 4.2% avg CTR ← highest
- Conclusion (85-100%): 3.8% avg CTR

Return ONLY valid JSON:
{
  "current_strategy_score": 65,
  "optimal_placements": [
    {
      "position": "before_conclusion",
      "reason": "highest CTR zone for affiliate links",
      "cta_text": "Check Current Price →",
      "html_snippet": "<div class='affiliate-cta'><a href='AFFILIATE_URL' rel='nofollow sponsored' target='_blank'>Check Current Price on Amazon →</a></div>",
      "expected_ctr": 4.2
    }
  ],
  "current_issues": ["issue 1", "issue 2"],
  "quick_wins": ["immediate change to make"],
  "cta_text_suggestions": ["Check Price →", "See Today's Deal →", "Buy Now →", "View on Amazon →"],
  "estimated_ctr_improvement": "1.5x"
}`;

        const result = await routeAI({ task: 'content_optimization', prompt, systemPrompt: 'Affiliate conversion rate optimizer. Data-driven. Return only JSON.', maxTokens: 1200, jsonMode: true });
        let analysis = { current_links: currentPositions, benchmarks: POSITION_CTR_BENCHMARKS };
        if (result.success && result.content) {
            try { const m = result.content.match(/\{[\s\S]*\}/); Object.assign(analysis, JSON.parse(m?.[0] || result.content)); } catch { /* skip */ }
        }

        return NextResponse.json({ analysis, current_links: currentPositions });
    }

    if (action === 'create_test') {
        const { post_id, affiliate_url, product_name } = parsed.data;
        if (!post_id || !affiliate_url) return NextResponse.json({ error: 'post_id and affiliate_url required' }, { status: 400 });

        // Create A/B test for two link positions
        const { data, error } = await auth.supabase.from('placement_tests').insert({
            user_id: auth.user.id,
            post_id,
            affiliate_url,
            product_name: product_name || '',
            variant_a_position: 'before_conclusion',
            variant_b_position: 'after_h2',
            variant_a_clicks: 0,
            variant_b_clicks: 0,
            variant_a_impressions: 0,
            variant_b_impressions: 0,
            status: 'running',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ test: data });
    }

    if (action === 'record_click') {
        const { test_id, position } = parsed.data;
        if (!test_id || !position) return NextResponse.json({ error: 'test_id and position required' }, { status: 400 });

        const { data: test } = await auth.supabase.from('placement_tests').select('variant_a_position, variant_a_clicks, variant_b_clicks').eq('id', test_id).single();
        if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

        const field = position === test.variant_a_position ? 'variant_a_clicks' : 'variant_b_clicks';
        const currentClicks = field === 'variant_a_clicks' ? test.variant_a_clicks : test.variant_b_clicks;
        await auth.supabase.from('placement_tests').update({ [field]: currentClicks + 1 }).eq('id', test_id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const postId = new URL(request.url).searchParams.get('post_id');
    let query = auth.supabase.from('placement_tests').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (postId) query = query.eq('post_id', postId);

    const { data, error } = await query.limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const benchmarks = POSITION_CTR_BENCHMARKS;
    return NextResponse.json({ tests: data || [], benchmarks });
}
