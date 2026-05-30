// ============================================================
// RankMaster Pro - Multi-language Content Generator API
// Generate content in ES/DE/FR/PT with hreflang auto-injection
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const SUPPORTED_LANGUAGES = ['es', 'de', 'fr', 'pt', 'it', 'nl', 'pl', 'ja', 'zh', 'hi', 'ar'] as const;
type SupportedLang = typeof SUPPORTED_LANGUAGES[number];

const LANG_NAMES: Record<SupportedLang, string> = {
    es: 'Spanish', de: 'German', fr: 'French', pt: 'Portuguese',
    it: 'Italian', nl: 'Dutch', pl: 'Polish', ja: 'Japanese',
    zh: 'Chinese (Simplified)', hi: 'Hindi', ar: 'Arabic',
};

const Schema = z.object({
    action: z.enum(['translate', 'generate_native', 'add_hreflang', 'list', 'delete']),
    post_id: z.string().uuid().optional(),
    source_language: z.string().default('en').optional(),
    target_language: z.enum(SUPPORTED_LANGUAGES).optional(),
    target_languages: z.array(z.enum(SUPPORTED_LANGUAGES)).max(5).optional(),
    keyword: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    site_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'translate' || action === 'generate_native') {
        const { post_id, target_language, keyword, niche, site_id } = parsed.data;
        const lang = target_language;
        if (!lang) return NextResponse.json({ error: 'target_language required' }, { status: 400 });

        let title = '', content = '', metaDesc = '';

        if (post_id) {
            const { data: post } = await auth.supabase.from('posts').select('title, content_markdown, meta_description, keywords(keyword)').eq('id', post_id).eq('user_id', auth.user.id).single();
            if (post) {
                title = post.title;
                content = post.content_markdown;
                metaDesc = post.meta_description;
            }
        }

        const langName = LANG_NAMES[lang as SupportedLang];
        const isNative = action === 'generate_native';

        const prompt = isNative
            ? `You are a native ${langName} SEO content writer. Write an original SEO article in ${langName} for the keyword "${keyword || title}" in the ${niche || 'general'} niche.

DO NOT translate — write fresh, natural ${langName} content that native speakers would write.

Return ONLY valid JSON:
{
  "title": "H1 title in ${langName} (keyword-rich)",
  "content": "full article in ${langName} (800-1200 words, proper ${langName} headings with ##)",
  "meta_title": "SEO meta title in ${langName} (55-60 chars)",
  "meta_description": "meta description in ${langName} (145-155 chars)",
  "hreflang_tag": "<link rel='alternate' hreflang='${lang}' href='URL_PLACEHOLDER' />",
  "slug_suggestion": "url-slug-in-${lang}",
  "notes": "localization notes (currency, dates, cultural references used)"
}`
            : `You are an expert ${langName} translator and SEO specialist. Translate and localize this content for ${langName}-speaking audiences.

Original title: "${title}"
Original content excerpt: ${content.substring(0, 3000)}
Original meta: ${metaDesc}

IMPORTANT: Don't just translate — localize. Adapt examples, references, currency (use €/£/¥ as appropriate), and cultural context.

Return ONLY valid JSON:
{
  "title": "localized title in ${langName}",
  "content": "full localized content in ${langName}",
  "meta_title": "SEO meta title in ${langName}",
  "meta_description": "meta description in ${langName}",
  "hreflang_tag": "<link rel='alternate' hreflang='${lang}' href='URL_PLACEHOLDER' />",
  "slug_suggestion": "url-slug",
  "localization_changes": ["change 1", "change 2"]
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: `Expert ${langName} content writer. Return only JSON.`, maxTokens: 3000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            const data = JSON.parse(jsonMatch?.[0] || result.content);

            const { data: saved } = await auth.supabase.from('multilang_content').insert({
                user_id: auth.user.id,
                source_post_id: post_id || null,
                site_id: site_id || null,
                target_language: lang,
                action_type: action,
                title: data.title || '',
                content: data.content || '',
                meta_title: data.meta_title || '',
                meta_description: data.meta_description || '',
                hreflang_tag: data.hreflang_tag || '',
                slug_suggestion: data.slug_suggestion || '',
                word_count: (data.content || '').split(/\s+/).length,
            }).select('id').single();

            return NextResponse.json({ content: data, id: saved?.id, provider: result.provider, language: langName });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'add_hreflang') {
        const { post_id, site_id } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        const { data: translations } = await auth.supabase.from('multilang_content').select('target_language, slug_suggestion').eq('source_post_id', post_id).eq('user_id', auth.user.id);
        const { data: post } = await auth.supabase.from('posts').select('slug').eq('id', post_id).single();
        const { data: site } = site_id ? await auth.supabase.from('sites').select('url').eq('id', site_id).single() : { data: null };

        const baseUrl = site?.url?.replace(/\/$/, '') || 'https://yoursite.com';
        const hreflangTags = [
            `<link rel="alternate" hreflang="en" href="${baseUrl}/${post?.slug}/" />`,
            ...(translations || []).map((t: { target_language: string; slug_suggestion: string }) =>
                `<link rel="alternate" hreflang="${t.target_language}" href="${baseUrl}/${t.target_language}/${t.slug_suggestion}/" />`
            ),
            `<link rel="alternate" hreflang="x-default" href="${baseUrl}/${post?.slug}/" />`,
        ].join('\n');

        return NextResponse.json({ hreflang_tags: hreflangTags, language_count: (translations || []).length + 1 });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('multilang_content').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const postId = new URL(request.url).searchParams.get('post_id');
    let query = auth.supabase.from('multilang_content').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (postId) query = query.eq('source_post_id', postId);

    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ translations: data || [], supported_languages: Object.entries(LANG_NAMES).map(([code, name]) => ({ code, name })) });
}
