import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ClassifySchema = z.object({
    action: z.literal('classify'),
    keywords: z.array(z.string()).min(1).max(100),
    niche: z.string().optional(),
});

export async function POST(req: NextRequest) {
    await getAuthUser(req);
    const body = await req.json();

    if (body.action === 'classify') {
        const parsed = ClassifySchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Classify the search intent for each of these keywords. Be precise.

Keywords:
${d.keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

${d.niche ? `Niche context: ${d.niche}` : ''}

For each keyword, determine:
- intent: "informational" | "commercial" | "transactional" | "navigational"
- sub_intent: "how_to" | "what_is" | "best_of" | "comparison" | "review" | "buy" | "find" | "brand" | "other"
- funnel_stage: "awareness" | "consideration" | "decision"
- content_type: "article" | "listicle" | "review" | "comparison" | "landing_page" | "tool"
- monetization: "high" | "medium" | "low"
- confidence: 0-1

Return JSON array (same order as input):
[{ "keyword": string, "intent": string, "sub_intent": string, "funnel_stage": string, "content_type": string, "monetization": string, "confidence": number, "reasoning": string }]`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let results;
        try { results = JSON.parse(text.match(/\[[\s\S]+\]/)?.[0] || '[]'); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        // Stats
        const stats = { informational: 0, commercial: 0, transactional: 0, navigational: 0, high_monetization: 0 };
        for (const r of results) {
            if (stats[r.intent as keyof typeof stats] !== undefined) stats[r.intent as keyof typeof stats]++;
            if (r.monetization === 'high') stats.high_monetization++;
        }

        return NextResponse.json({ results, stats, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
