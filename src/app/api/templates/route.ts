// ============================================================
// RankMaster Pro - Post Template Library API
// Save successful post structures, reuse for new content
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['save_from_post', 'create_manual', 'list', 'delete', 'apply', 'generate_from_template']),
    id: z.string().uuid().optional(),
    post_id: z.string().uuid().optional(),
    template_name: z.string().max(200).optional(),
    template_type: z.enum(['review', 'comparison', 'how_to', 'listicle', 'news', 'case_study', 'beginner_guide', 'roundup']).optional(),
    niche: z.string().max(200).optional(),
    description: z.string().max(500).optional(),
    new_keyword: z.string().max(200).optional(),
    new_niche: z.string().max(200).optional(),
});

function extractStructure(html: string): { headings: Array<{ level: number; text: string }>; sections: string[]; word_count: number; has_faq: boolean; has_table: boolean; intro_present: boolean; conclusion_present: boolean } {
    const headings: Array<{ level: number; text: string }> = [];
    for (const match of html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi)) {
        headings.push({ level: parseInt(match[1]), text: match[2].replace(/<[^>]+>/g, '').trim() });
    }
    const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return {
        headings,
        sections: headings.filter(h => h.level === 2).map(h => h.text),
        word_count: wordCount,
        has_faq: /faq|frequently asked/i.test(html),
        has_table: /<table/i.test(html),
        intro_present: wordCount > 100,
        conclusion_present: /conclusion|final|verdict|bottom line/i.test(html),
    };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'save_from_post') {
        const { post_id, template_name, template_type } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('title, content_html, seo_score, overall_score, keywords(keyword)').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const structure = extractStructure(post.content_html || '');

        const { data, error } = await auth.supabase.from('post_templates').insert({
            user_id: auth.user.id,
            template_name: template_name || `Template from: ${post.title.substring(0, 60)}`,
            template_type: template_type || 'how_to',
            source_post_id: post_id,
            seo_score: post.seo_score,
            overall_score: post.overall_score,
            structure,
            headings_blueprint: structure.headings.map(h => ({ level: h.level, placeholder: h.text.replace(/specific|product|keyword/gi, '[KEYWORD]') })),
            word_count_target: structure.word_count,
            times_used: 0,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ template: data });
    }

    if (action === 'generate_from_template') {
        const { id, new_keyword, new_niche } = parsed.data;
        if (!id || !new_keyword) return NextResponse.json({ error: 'id and new_keyword required' }, { status: 400 });

        const { data: template } = await auth.supabase.from('post_templates').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

        const blueprint = template.headings_blueprint || [];
        const headingsList = blueprint.map((h: { level: number; placeholder: string }, i: number) => `${i + 1}. H${h.level}: ${h.placeholder}`).join('\n');

        const prompt = `Adapt this blog post structure for a new keyword.

New keyword: "${new_keyword}"
Niche: ${new_niche || template.niche || 'general'}
Template type: ${template.template_type}
Target word count: ${template.word_count_target}

Original heading structure:
${headingsList}

Adapt the headings for the new keyword. Keep the same structure/depth. Replace placeholders with specific, relevant headings.

Return ONLY valid JSON:
{
  "adapted_title": "H1 title for new keyword",
  "adapted_headings": [
    {"level": 2, "text": "specific heading for new keyword"},
    {"level": 3, "text": "subheading"}
  ],
  "meta_title": "SEO meta title (55-60 chars)",
  "meta_description": "meta description (145-155 chars)",
  "content_notes": ["specific tip 1 for this keyword", "tip 2"]
}`;

        const result = await routeAI({ task: 'outline_generation', prompt, systemPrompt: 'SEO content strategist. Adapt templates accurately. Return only JSON.', maxTokens: 1000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            const adapted = JSON.parse(m?.[0] || result.content);
            // Increment usage
            await auth.supabase.from('post_templates').update({ times_used: (template.times_used || 0) + 1 }).eq('id', id);
            return NextResponse.json({ adapted, template_name: template.template_name, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('post_templates').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('post_templates').select('id, template_name, template_type, seo_score, overall_score, word_count_target, times_used, created_at').eq('user_id', auth.user.id).order('times_used', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ templates: data || [] });
}
