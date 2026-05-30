import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const GradeSchema = z.object({
    action: z.literal('grade'),
    title: z.string().min(1),
    content: z.string().min(100),
    meta_description: z.string().optional(),
    focus_keyword: z.string().optional(),
    post_id: z.string().uuid().optional(),
    target_word_count: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const postId = url.searchParams.get('post_id');
    let query = supabase.from('content_grades').select('*').eq('user_id', user.id).order('graded_at', { ascending: false });
    if (postId) query = query.eq('post_id', postId);
    const { data } = await query.limit(50);
    return NextResponse.json({ grades: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'grade') {
        const parsed = GradeSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const wordCount = d.content.split(/\s+/).filter(Boolean).length;
        const hasImages = d.content.includes('<img') || d.content.includes('![');
        const headingCount = (d.content.match(/<h[2-6]|^#{2,6}/gm) || []).length;
        const linkCount = (d.content.match(/<a |href=/g) || []).length;

        const prompt = `Grade this blog post on 12 SEO and quality dimensions. Be specific and actionable.

Title: ${d.title}
Focus Keyword: ${d.focus_keyword || 'not specified'}
Meta Description: ${d.meta_description || 'missing'}
Word Count: ${wordCount}
Target Word Count: ${d.target_word_count || 'not specified'}
H2/H3 Count: ${headingCount}
Link Count: ${linkCount}
Has Images: ${hasImages}

Content (first 3000 chars):
${d.content.substring(0, 3000)}

Grade each dimension 0-100 and give specific fixes. Return JSON:
{
  "overall_score": number,
  "overall_grade": "A+"|"A"|"B"|"C"|"D"|"F",
  "dimensions": {
    "content_depth": { "score": number, "assessment": string, "fix": string },
    "keyword_optimization": { "score": number, "assessment": string, "fix": string },
    "readability": { "score": number, "assessment": string, "fix": string },
    "heading_structure": { "score": number, "assessment": string, "fix": string },
    "meta_optimization": { "score": number, "assessment": string, "fix": string },
    "internal_linking": { "score": number, "assessment": string, "fix": string },
    "external_linking": { "score": number, "assessment": string, "fix": string },
    "media_usage": { "score": number, "assessment": string, "fix": string },
    "eeat_signals": { "score": number, "assessment": string, "fix": string },
    "user_intent_match": { "score": number, "assessment": string, "fix": string },
    "cta_effectiveness": { "score": number, "assessment": string, "fix": string },
    "schema_markup": { "score": number, "assessment": string, "fix": string }
  },
  "top_3_priorities": [
    { "issue": string, "impact": "high"|"medium", "effort": "low"|"medium"|"high", "fix": string }
  ],
  "strengths": [string],
  "estimated_ranking_improvement": string
}`;

        const { text, provider } = await routeAI({ task: 'content_optimization', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        if (d.post_id) {
            await supabase.from('content_grades').upsert({
                user_id: user.id, post_id: d.post_id, title: d.title,
                overall_score: result.overall_score, overall_grade: result.overall_grade,
                dimensions: result.dimensions, priorities: result.top_3_priorities,
                grade_data: result, graded_at: new Date().toISOString(),
            }, { onConflict: 'user_id,post_id' });
        }

        return NextResponse.json({ result, word_count: wordCount, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
