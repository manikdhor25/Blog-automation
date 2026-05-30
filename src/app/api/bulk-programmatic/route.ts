import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';
import { cleanAIPatterns } from '@/lib/engines/human-writing-rules';
import { runQualityControl, type QCInput } from '@/lib/engines/quality-control-engine';
import { moderateContent, injectDisclaimers } from '@/lib/engines/content-moderation';

const CreateTemplateSchema = z.object({
    action: z.literal('create_template'),
    name: z.string().min(1),
    niche: z.string().min(1),
    template_type: z.enum(['city_service', 'product_review', 'vs_comparison', 'best_for_category', 'how_to_with_variable', 'custom']),
    title_pattern: z.string().min(1),
    content_outline: z.string().min(1),
    variable_columns: z.array(z.string()).min(1),
    site_id: z.string().uuid().optional(),
});

const GenerateBulkSchema = z.object({
    action: z.literal('generate'),
    template_id: z.string().uuid(),
    rows: z.array(z.record(z.string(), z.string())).min(1).max(50),
    auto_save_posts: z.boolean().default(true),
    site_id: z.string().uuid().optional(),
});

const GenerateFromCsvSchema = z.object({
    action: z.literal('generate_from_csv'),
    niche: z.string().min(1),
    template_type: z.string(),
    title_pattern: z.string().min(1),
    rows: z.array(z.record(z.string(), z.string())).min(1).max(50),
    word_count_per_page: z.number().int().min(800).max(2000).default(800),
    auto_save_posts: z.boolean().default(true),
    site_id: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data: templates } = await supabase.from('programmatic_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const { data: batches } = await supabase.from('programmatic_batches').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ templates: templates || [], batches: batches || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create_template') {
        const parsed = CreateTemplateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data, error } = await supabase.from('programmatic_templates').insert({
            user_id: user.id, site_id: d.site_id || null, name: d.name, niche: d.niche,
            template_type: d.template_type, title_pattern: d.title_pattern,
            content_outline: d.content_outline, variable_columns: d.variable_columns,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ template: data });
    }

    if (body.action === 'generate_from_csv') {
        const parsed = GenerateFromCsvSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: batch } = await supabase.from('programmatic_batches').insert({
            user_id: user.id, site_id: d.site_id || null, template_id: null,
            name: `${d.niche} â€” ${d.template_type} batch`,
            total_pages: d.rows.length, generated_pages: 0, status: 'generating',
        }).select().single();

        const generated = [];
        for (const row of d.rows.slice(0, 50)) {
            // Build title by replacing {variable} placeholders
            let title = d.title_pattern;
            for (const [key, val] of Object.entries(row)) {
                title = title.replace(new RegExp(`\\{${key}\\}`, 'gi'), val as string);
            }

            const variables = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join('\n');

            const prompt = `Write a ${d.word_count_per_page}-word SEO blog post for programmatic SEO.

Title: ${title}
Variables: ${variables}
Niche: ${d.niche}
Template type: ${d.template_type}

CRITICAL REQUIREMENTS:
- Write as a real human expert, NOT as AI
- Use short sentences (mostly under 18 words), contractions, and simple vocabulary
- Vary paragraph length: mix 1-line with 3-4 line paragraphs
- NEVER use: "Moreover", "Furthermore", "Additionally", "In conclusion", "delve into", "leverage", "seamless"
- Every statistic MUST have a source attribution
- Include at least 3 H2 sections with substantive content under each
- Include practical, specific advice â€” not generic filler
- Include 1 real-world example or case study
- Write focused, useful content. No fluff. Natural keyword use.
Return JSON: { "title": "${title}", "slug": "url-slug", "content": "HTML content", "meta_description": "155 char meta", "word_count": number }`;

            const { text } = await routeAI({ task: 'content_writing', prompt, json: true });
            let pageData: Record<string, unknown>;
            try { pageData = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); }
            catch { pageData = { title, slug: title.toLowerCase().replace(/\s+/g, '-'), content: text, meta_description: '' }; }

            // â”€â”€ Quality Pipeline per page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            try {
                let pageContent = (pageData.content as string) || '';
                
                // Clean AI patterns
                pageContent = cleanAIPatterns(pageContent);
                
                // Run 10-dimension QC scoring
                const qcInput: QCInput = {
                    primaryKeyword: title,
                    secondaryKeywords: [],
                    searchIntent: 'informational',
                    targetAudience: 'general',
                    content: pageContent,
                };
                const qcReport = runQualityControl(qcInput);
                
                // Content moderation
                const modResult = moderateContent(pageContent, d.niche);
                if (modResult.disclaimers.length > 0) {
                    pageContent = injectDisclaimers(pageContent, modResult.disclaimers);
                }
                
                // Update page data
                pageData.content = pageContent;
                pageData.quality_score = qcReport.overallScore;
                pageData.publish_decision = qcReport.publishDecision;
                pageData.moderation_risk = modResult.riskLevel;
                
                // Skip pages that score below 5.0 (too low quality for any use)
                if (qcReport.overallScore < 5.0) {
                    console.warn(`[BulkProgrammatic] Page "${title}" scored ${qcReport.overallScore}/10 â€” skipping`);
                    pageData.status = 'quality_rejected';
                }
            } catch (qcError) {
                console.error(`[BulkProgrammatic] Quality check failed for "${title}":`, qcError);
                pageData.quality_score = null;
            }

            generated.push(pageData);

            if (d.auto_save_posts !== false && d.site_id && pageData.content) {
                await supabase.from('posts').insert({
                    user_id: user.id, site_id: d.site_id,
                    title: pageData.title as string || title,
                    slug: pageData.slug as string,
                    content: pageData.content as string,
                    meta_description: pageData.meta_description as string,
                    status: 'draft', word_count: pageData.word_count as number || d.word_count_per_page,
                    batch_id: batch?.id || null,
                });
            }
        }

        // Update batch
        if (batch) {
            await supabase.from('programmatic_batches').update({ generated_pages: generated.length, status: 'completed' }).eq('id', batch.id);
        }

        return NextResponse.json({ generated, batch, count: generated.length });
    }

    if (body.action === 'generate') {
        const parsed = GenerateBulkSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: template } = await supabase.from('programmatic_templates').select('*').eq('id', d.template_id).single();
        if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

        const generated = [];
        for (const row of d.rows.slice(0, 20)) {
            let title = template.title_pattern;
            for (const [key, val] of Object.entries(row)) {
                title = title.replace(new RegExp(`\\{${key}\\}`, 'gi'), val as string);
            }

            const variables = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join('\n');
            const prompt = `Write an SEO page using this template.

Title: ${title}
Variables: ${variables}
Niche: ${template.niche}
Content outline: ${template.content_outline}

CRITICAL REQUIREMENTS:
- Write as a real human expert with genuine knowledge
- Use short sentences, contractions, and varied paragraph lengths
- NEVER use AI filler phrases: "Moreover", "Furthermore", "delve into", "leverage", "seamless"
- Include specific examples and actionable advice
- Every claim needs evidence or attribution

Return JSON: { "title": string, "slug": string, "content": "HTML", "meta_description": string, "word_count": number }`;

            const { text } = await routeAI({ task: 'content_writing', prompt, json: true });
            let pageData: Record<string, unknown>;
            try { pageData = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); }
            catch { pageData = { title, slug: title.toLowerCase().replace(/\s+/g, '-'), content: text }; }
            generated.push(pageData);
        }

        return NextResponse.json({ generated, count: generated.length });
    }

    if (body.action === 'preview_template') {
        const { title_pattern, variables } = body;
        let preview = title_pattern;
        if (variables) {
            for (const [k, v] of Object.entries(variables)) {
                preview = preview.replace(new RegExp(`\\{${k}\\}`, 'gi'), v as string);
            }
        }
        return NextResponse.json({ preview });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
