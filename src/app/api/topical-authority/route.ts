import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const AnalyzeSchema = z.object({
    action: z.literal('analyze'),
    site_id: z.string().uuid().optional(),
    niche: z.string().min(1),
    topics: z.array(z.string()).optional(),
    competitor_domains: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('topical_authority_scores')
        .select('*').eq('user_id', user.id).order('analyzed_at', { ascending: false }).limit(10);
    return NextResponse.json({ scores: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'analyze') {
        const parsed = AnalyzeSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Pull existing posts for the site to inform AI
        let postSummary = '';
        if (d.site_id) {
            const { data: posts } = await supabase.from('posts')
                .select('title, primary_keyword, word_count').eq('site_id', d.site_id).limit(50);
            if (posts?.length) {
                postSummary = posts.map(p => `- ${p.title} (kw: ${p.primary_keyword || 'unknown'}, ${p.word_count || 0}w)`).join('\n');
            }
        }

        const prompt = `Analyze the topical authority of a ${d.niche} website.

${postSummary ? `Existing posts:\n${postSummary}\n` : ''}
${d.topics?.length ? `Topics to cover: ${d.topics.join(', ')}` : ''}
${d.competitor_domains.length ? `Compare against competitors: ${d.competitor_domains.join(', ')}` : ''}

Evaluate topical authority across the main sub-topics of ${d.niche}. For each sub-topic:
1. Rate coverage depth (0-100)
2. List covered angles
3. List missing angles (content gaps)
4. Estimate competitor advantage

Return JSON:
{
  "overall_score": number (0-100),
  "niche": "${d.niche}",
  "grade": "A"|"B"|"C"|"D"|"F",
  "summary": "2-3 sentence assessment",
  "topics": [
    {
      "topic": "sub-topic name",
      "coverage_score": number,
      "posts_covering": number,
      "covered_angles": ["angle1"],
      "missing_angles": ["gap1", "gap2"],
      "competitor_has_advantage": boolean,
      "priority": "high"|"medium"|"low",
      "recommended_posts": ["post title idea 1", "post title idea 2"]
    }
  ],
  "quick_wins": ["specific post idea with keyword that fills gap"],
  "eeat_assessment": {
    "expertise_score": number,
    "authoritativeness_score": number,
    "trustworthiness_score": number,
    "recommendations": ["rec1", "rec2"]
  },
  "competitor_gap_count": number
}`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        const { data: saved } = await supabase.from('topical_authority_scores').insert({
            user_id: user.id, site_id: d.site_id || null, niche: d.niche,
            overall_score: result.overall_score, grade: result.grade,
            topic_count: result.topics?.length || 0,
            gaps_count: result.topics?.reduce((sum: number, t: { missing_angles: string[] }) => sum + (t.missing_angles?.length || 0), 0) || 0,
            quick_wins_count: result.quick_wins?.length || 0,
            score_data: result, analyzed_at: new Date().toISOString(),
        }).select().single();

        return NextResponse.json({ score: result, saved, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
