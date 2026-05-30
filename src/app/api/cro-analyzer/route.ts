import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const AnalyzeSchema = z.object({
    action: z.literal('analyze'),
    url: z.string().url().optional(),
    content: z.string().optional(),
    title: z.string().optional(),
    post_id: z.string().uuid().optional(),
    niche: z.string().optional(),
    affiliate_product: z.string().optional(),
    current_ctr: z.number().min(0).max(100).optional(),
});

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'analyze') {
        const parsed = AnalyzeSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        if (!d.content && !d.url) return NextResponse.json({ error: 'Provide content or URL' }, { status: 400 });

        const prompt = `Analyze this blog post/landing page for Conversion Rate Optimization (CRO). Focus on affiliate conversion improvement.

Title: ${d.title || 'unknown'}
Niche: ${d.niche || 'general'}
Affiliate Product: ${d.affiliate_product || 'not specified'}
Current CTR: ${d.current_ctr ? d.current_ctr + '%' : 'unknown'}

Content (first 3000 chars):
${(d.content || '').substring(0, 3000)}

Analyze every CTA, affiliate mention, trust signal, and conversion barrier. Be brutally specific.

Return JSON:
{
  "cro_score": number (0-100),
  "current_estimated_ctr": number,
  "optimized_estimated_ctr": number,
  "revenue_lift_potential": string,
  "cta_analysis": [
    {
      "location": "intro|middle|end|sidebar",
      "current_text": string,
      "issue": string,
      "optimized_text": string,
      "expected_improvement_pct": number
    }
  ],
  "trust_signals": {
    "present": [string],
    "missing": [string],
    "recommendations": [string]
  },
  "page_flow_issues": [string],
  "headline_test_ideas": [string],
  "button_copy_improvements": [{ "current": string, "improved": string, "reason": string }],
  "social_proof_opportunities": [string],
  "urgency_scarcity_opportunities": [string],
  "quick_wins": [
    { "action": string, "effort": "5min"|"30min"|"2hr", "expected_ctr_boost_pct": number }
  ],
  "full_rewrite_recommendation": boolean,
  "a_b_test_ideas": [string]
}`;

        const { text, provider } = await routeAI({ task: 'content_optimization', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        if (d.post_id) {
            await supabase.from('cro_analyses').insert({
                user_id: user.id, post_id: d.post_id, cro_score: result.cro_score || 0,
                current_ctr: d.current_ctr || null, optimized_ctr: result.optimized_estimated_ctr || null,
                quick_wins_count: result.quick_wins?.length || 0, result_data: result,
            });
        }

        return NextResponse.json({ result, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
