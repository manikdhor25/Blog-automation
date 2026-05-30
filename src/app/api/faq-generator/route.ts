import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const GenerateSchema = z.object({
    action: z.literal('generate'),
    keyword: z.string().min(1),
    post_id: z.string().uuid().optional(),
    content: z.string().optional(),
    niche: z.string().optional(),
    faq_count: z.number().int().min(3).max(15).default(7),
    include_schema: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'generate') {
        const parsed = GenerateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Generate ${d.faq_count} high-quality FAQ questions and answers for a blog post about "${d.keyword}".

${d.niche ? `Niche: ${d.niche}` : ''}
${d.content ? `Post context:\n${d.content.substring(0, 1500)}` : ''}

Requirements:
- Questions should reflect real user searches (PAA-style)
- Answers: 40-80 words, direct, conversational
- Mix of question types: what/how/why/when/best/can
- Optimized for featured snippets

Return JSON:
{
  "faqs": [
    { "question": "Q?", "answer": "A.", "schema_markup": true }
  ],
  "schema_json": "complete FAQ Page schema JSON-LD string",
  "html_snippet": "ready-to-paste HTML with FAQ accordion markup"
}`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        if (d.post_id) {
            await supabase.from('faq_results').insert({
                user_id: user.id, post_id: d.post_id, keyword: d.keyword,
                faq_count: result.faqs?.length || 0, result_data: result,
            });
        }

        return NextResponse.json({ result, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
