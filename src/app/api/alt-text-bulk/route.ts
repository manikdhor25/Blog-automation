// ============================================================
// RankMaster Pro - Image Alt-Text Bulk Generator API
// Scan WP site → find images without alt-text → AI-generate → push back
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['scan', 'generate', 'push_to_wp', 'list']),
    site_id: z.string().uuid().optional(),
    post_id: z.string().uuid().optional(),
    image_urls: z.array(z.string()).max(50).optional(),
    keyword: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    push_all: z.boolean().default(false).optional(),
});

async function generateAltTexts(imageUrls: string[], keyword: string, niche: string): Promise<Array<{ url: string; alt_text: string; title_attr: string }>> {
    if (imageUrls.length === 0) return [];

    const urlList = imageUrls.slice(0, 20).map((url, i) => `${i + 1}. ${url}`).join('\n');
    const prompt = `Generate SEO-optimized alt text for blog images in the ${niche || 'general'} niche.
Target keyword context: "${keyword || niche || 'general topic'}"

Image URLs:
${urlList}

Rules:
- Alt text: 5-15 words, descriptive, keyword-natural (not keyword-stuffed)
- Include keyword where naturally fits
- Describe what's visually in the image based on filename/URL clues
- No "image of" or "picture of" — start with descriptive word
- Title attr: slightly longer version (10-20 words)

Return ONLY valid JSON array:
[
  {
    "url": "exact image URL from list",
    "alt_text": "descriptive alt text here",
    "title_attr": "longer title attribute text here"
  }
]`;

    const result = await routeAI({ task: 'meta_generation', prompt, systemPrompt: 'SEO image optimization expert. Descriptive, keyword-natural. Return JSON array only.', maxTokens: 1500, jsonMode: true });
    if (!result.success || !result.content) return imageUrls.map(url => ({ url, alt_text: `${keyword || niche || 'image'} - ${url.split('/').pop()?.split('.')[0] || 'photo'}`, title_attr: '' }));

    try {
        const jsonMatch = result.content.match(/\[[\s\S]*\]/);
        return JSON.parse(jsonMatch?.[0] || '[]');
    } catch { return []; }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'scan') {
        const { post_id, site_id } = parsed.data;

        let postsQuery = auth.supabase.from('posts').select('id, title, content_html, keywords(keyword)').eq('user_id', auth.user.id).eq('status', 'published');
        if (post_id) postsQuery = postsQuery.eq('id', post_id);
        else if (site_id) postsQuery = postsQuery.eq('site_id', site_id);
        const { data: posts } = await postsQuery.limit(50);

        const results = [];
        for (const post of posts || []) {
            const html = post.content_html || '';
            // Images without alt
            const noAltImages = (html.match(/<img(?![^>]*alt=)[^>]*src="([^"]+)"[^>]*>/gi) || []).map((img: string) => img.match(/src="([^"]+)"/)?.[1] || '').filter(Boolean);
            // Images with empty alt
            const emptyAltImages = (html.match(/<img[^>]*alt=""[^>]*src="([^"]+)"[^>]*>/gi) || []).map((img: string) => img.match(/src="([^"]+)"/)?.[1] || '').filter(Boolean);
            const allMissing = [...new Set([...noAltImages, ...emptyAltImages])];

            if (allMissing.length > 0) {
                results.push({
                    post_id: post.id,
                    post_title: post.title,
                    missing_count: allMissing.length,
                    image_urls: allMissing.slice(0, 20),
                    keyword: (post as unknown as { keywords?: { keyword: string } }).keywords?.keyword || '',
                });
            }
        }

        return NextResponse.json({ posts_with_missing: results.length, total_missing: results.reduce((s, r) => s + r.missing_count, 0), results });
    }

    if (action === 'generate') {
        const { image_urls, keyword, niche, post_id, site_id } = parsed.data;
        if (!image_urls?.length && !post_id) return NextResponse.json({ error: 'image_urls or post_id required' }, { status: 400 });

        let urls = image_urls || [];
        let postKeyword = keyword || '';

        if (post_id && !urls.length) {
            const { data: post } = await auth.supabase.from('posts').select('content_html, keywords(keyword)').eq('id', post_id).single();
            const html = post?.content_html || '';
            urls = (html.match(/<img(?![^>]*alt="[^"]+")[^>]*src="([^"]+)"[^>]*>/gi) || []).map((img: string) => img.match(/src="([^"]+)"/)?.[1] || '').filter(Boolean);
            postKeyword = (post as unknown as { keywords?: { keyword: string } })?.keywords?.keyword || keyword || '';
        }

        const generated = await generateAltTexts(urls, postKeyword, niche || '');

        // Save generated alt texts
        if (generated.length > 0 && post_id) {
            await auth.supabase.from('alt_text_results').insert(
                generated.map(g => ({ user_id: auth.user.id, post_id: post_id || null, image_url: g.url, alt_text: g.alt_text, title_attr: g.title_attr, applied: false }))
            );
        }

        return NextResponse.json({ generated, count: generated.length });
    }

    if (action === 'push_to_wp') {
        const { post_id } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('content_html, site_id, wp_post_id').eq('id', post_id).eq('user_id', auth.user.id).single();
        const { data: altResults } = await auth.supabase.from('alt_text_results').select('*').eq('post_id', post_id).eq('user_id', auth.user.id).eq('applied', false);

        if (!altResults?.length) return NextResponse.json({ message: 'No pending alt texts. Generate first.' });

        let updatedHtml = post?.content_html || '';
        let applied = 0;

        for (const r of altResults) {
            const before = updatedHtml;
            updatedHtml = updatedHtml.replace(
                new RegExp(`(<img[^>]*src="${r.image_url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*)(>|/>)`, 'gi'),
                `$1 alt="${r.alt_text}" title="${r.title_attr}"$2`
            );
            if (updatedHtml !== before) applied++;
        }

        // Update post HTML
        await auth.supabase.from('posts').update({ content_html: updatedHtml, updated_at: new Date().toISOString() }).eq('id', post_id);
        await auth.supabase.from('alt_text_results').update({ applied: true, applied_at: new Date().toISOString() }).eq('post_id', post_id).eq('user_id', auth.user.id);

        // Push to WordPress if WP post ID exists
        if (post?.site_id && post?.wp_post_id) {
            const { data: site } = await auth.supabase.from('sites').select('url, username, app_password_encrypted').eq('id', post.site_id).single();
            if (site) {
                const credentials = Buffer.from(`${site.username}:${site.app_password_encrypted}`).toString('base64');
                await fetch(`${site.url.replace(/\/$/, '')}/wp-json/wp/v2/posts/${post.wp_post_id}`, {
                    method: 'PUT',
                    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: updatedHtml }),
                    signal: AbortSignal.timeout(15000),
                });
            }
        }

        return NextResponse.json({ success: true, alt_texts_applied: applied });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const postId = new URL(request.url).searchParams.get('post_id');
    let query = auth.supabase.from('alt_text_results').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (postId) query = query.eq('post_id', postId);
    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: data || [] });
}
