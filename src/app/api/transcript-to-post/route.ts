import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ConvertSchema = z.object({
    action: z.literal('convert'),
    transcript: z.string().min(100),
    source_type: z.enum(['youtube', 'podcast', 'video', 'interview', 'webinar']).default('youtube'),
    source_url: z.string().url().optional(),
    title_hint: z.string().optional(),
    niche: z.string().optional(),
    target_word_count: z.number().int().min(500).max(5000).default(1500),
    include_timestamps: z.boolean().default(true),
    site_id: z.string().uuid().optional(),
    auto_save: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'convert') {
        const parsed = ConvertSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Extract timestamps if present (format: 00:00 or [00:00])
        const timestampRegex = /(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-â€“]?\s*)(.*?)(?=(?:\[?\d{1,2}:\d{2}|\n\n|$))/gs;
        const segments: Array<{ time: string; text: string }> = [];
        let match;
        while ((match = timestampRegex.exec(d.transcript)) !== null) {
            if (match[2]?.trim()) segments.push({ time: match[1], text: match[2].trim() });
        }

        const prompt = `Convert this ${d.source_type} transcript into a high-quality, SEO-optimized blog post.

${d.title_hint ? `Topic hint: ${d.title_hint}` : ''}
${d.niche ? `Niche: ${d.niche}` : ''}
Target word count: ${d.target_word_count}
Source: ${d.source_url || d.source_type}
${d.include_timestamps && segments.length > 0 ? `Transcript with timestamps:\n${segments.slice(0, 20).map(s => `[${s.time}] ${s.text}`).join('\n')}` : `Transcript:\n${d.transcript.substring(0, 4000)}`}

Transform the spoken content into:
1. Compelling H1 title with SEO keyword
2. Introduction that hooks readers
3. Well-structured H2 sections (not just copying transcript order)
4. Key quotes formatted as blockquotes
5. Key takeaways section
6. Conclusion with CTA
${d.include_timestamps ? '7. Include [timestamp links] to video where relevant' : ''}

Return JSON:
{
  "title": "SEO-optimized post title",
  "slug": "url-slug",
  "meta_description": "155 char meta",
  "content": "full HTML post",
  "word_count": number,
  "key_takeaways": ["takeaway 1", "takeaway 2"],
  "focus_keyword": "primary keyword",
  "tags": ["tag1", "tag2"]
}`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt, json: true });
        let result: Record<string, unknown>;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        // Auto-save if requested
        if (d.auto_save && d.site_id && result.content) {
            const { data: post } = await supabase.from('posts').insert({
                user_id: user.id, site_id: d.site_id,
                title: result.title as string || d.title_hint || 'Transcript Post',
                slug: result.slug as string,
                content: result.content as string,
                meta_description: result.meta_description as string,
                primary_keyword: result.focus_keyword as string,
                tags: result.tags || [],
                word_count: result.word_count as number || 0,
                status: 'draft',
            }).select('id, title').single();

            return NextResponse.json({ result, post, provider });
        }

        return NextResponse.json({ result, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
