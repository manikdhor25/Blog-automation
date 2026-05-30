import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const RunPipelineSchema = z.object({
    action: z.literal('run'),
    keyword: z.string().min(1),
    niche: z.string().optional(),
    site_id: z.string().uuid().optional(),
    target_word_count: z.number().int().min(500).max(5000).default(1800),
    post_type: z.enum(['how_to', 'listicle', 'review', 'comparison', 'guide']).default('guide'),
    auto_publish_draft: z.boolean().default(false),
    stages: z.array(z.enum(['brief', 'outline', 'write', 'optimize', 'meta'])).default(['brief', 'outline', 'write', 'optimize', 'meta']),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('pipeline_runs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ runs: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'run') {
        const parsed = RunPipelineSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const stages = d.stages;
        const result: Record<string, unknown> = {};
        const providers: string[] = [];

        // Stage 1: Brief
        if (stages.includes('brief')) {
            const briefPrompt = `Create a concise content brief for a ${d.niche || 'blog'} post targeting "${d.keyword}".
Return JSON: { "search_intent": string, "target_audience": string, "key_points": [string], "competitor_angles": [string], "unique_angle": string, "required_entities": [string] }`;
            const { text, provider } = await routeAI({ task: 'seo_analysis', prompt: briefPrompt, json: true });
            try { result.brief = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); } catch { result.brief = { error: 'parse failed' }; }
            providers.push(provider);
        }

        // Stage 2: Outline
        if (stages.includes('outline')) {
            const outlinePrompt = `Create an SEO-optimized outline for a ${d.post_type} post about "${d.keyword}" targeting ${d.target_word_count} words.
${result.brief ? `Brief context: ${JSON.stringify(result.brief)}` : ''}
Return JSON: { "title": string, "h2_sections": [{ "heading": string, "word_count_target": number, "key_points": [string] }], "faq_questions": [string] }`;
            const { text, provider } = await routeAI({ task: 'content_writing', prompt: outlinePrompt, json: true });
            try { result.outline = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); } catch { result.outline = {}; }
            providers.push(provider);
        }

        // Stage 3: Write
        if (stages.includes('write')) {
            const outline = result.outline as Record<string, unknown>;
            const writePrompt = `Write a complete ${d.post_type} blog post about "${d.keyword}" for a ${d.niche || 'blog'}.
${outline?.title ? `Title: ${outline.title}` : ''}
Target word count: ${d.target_word_count} words
${outline?.h2_sections ? `Structure: ${JSON.stringify(outline.h2_sections)}` : ''}

Write full HTML content. Natural keyword use. Engaging intro. Include affiliate product placeholders as [AFFILIATE: product name].
Include internal link placeholders as [INTERNAL: topic].

Return JSON: { "title": string, "content": string, "word_count": number, "slug": string }`;
            const { text, provider } = await routeAI({ task: 'content_writing', prompt: writePrompt, json: true });
            try { result.draft = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); } catch { result.draft = {}; }
            providers.push(provider);
        }

        // Stage 4: Optimize
        if (stages.includes('optimize') && result.draft) {
            const draft = result.draft as Record<string, string>;
            const optPrompt = `Optimize this blog post for SEO. Focus keyword: "${d.keyword}".
Title: ${draft.title || ''}
Content preview: ${(draft.content || '').substring(0, 1000)}

Return JSON: { "optimized_title": string, "keyword_suggestions": [string], "optimization_notes": [string], "seo_score": number }`;
            const { text, provider } = await routeAI({ task: 'content_optimization', prompt: optPrompt, json: true });
            try { result.optimization = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); } catch { result.optimization = {}; }
            providers.push(provider);
        }

        // Stage 5: Meta
        if (stages.includes('meta') && result.draft) {
            const draft = result.draft as Record<string, string>;
            const metaPrompt = `Write SEO meta tags for this post.
Title: ${draft.title || ''}
Keyword: ${d.keyword}
Return JSON: { "meta_title": string (max 60 chars), "meta_description": string (max 155 chars), "og_title": string, "og_description": string, "schema_type": string }`;
            const { text, provider } = await routeAI({ task: 'content_optimization', prompt: metaPrompt, json: true });
            try { result.meta = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); } catch { result.meta = {}; }
            providers.push(provider);
        }

        // Save to DB
        const draft = result.draft as Record<string, unknown>;
        const meta = result.meta as Record<string, string> | undefined;
        const { data: run } = await supabase.from('pipeline_runs').insert({
            user_id: user.id, site_id: d.site_id || null, keyword: d.keyword,
            post_type: d.post_type, stages_completed: stages,
            title: draft?.title as string || '',
            word_count: draft?.word_count as number || 0,
            status: 'completed', result_data: result,
        }).select().single();

        // Save as post if site + auto_publish
        if (d.site_id && d.auto_publish_draft && draft?.content) {
            await supabase.from('posts').insert({
                user_id: user.id, site_id: d.site_id,
                title: (draft.title as string) || d.keyword,
                content: draft.content as string,
                slug: (draft.slug as string) || d.keyword.toLowerCase().replace(/\s+/g, '-'),
                primary_keyword: d.keyword,
                meta_description: meta?.meta_description || '',
                status: 'draft', word_count: draft.word_count as number || 0,
            });
        }

        return NextResponse.json({ run, result, providers });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
