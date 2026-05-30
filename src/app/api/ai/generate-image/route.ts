// ============================================================
// RankMaster Pro - AI Image Generator API
// DALL-E 3 + Stable Diffusion (via OpenRouter) image generation
// Featured images, Pinterest pins, product lifestyle shots
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const ImageGenSchema = z.object({
    action: z.enum(['generate', 'list', 'delete']),
    prompt: z.string().min(1).max(1000).optional(),
    title: z.string().max(500).optional(),
    keyword: z.string().max(200).optional(),
    style: z.enum(['realistic', 'illustration', 'minimalist', 'infographic', 'pinterest', 'product']).optional(),
    format: z.enum(['featured', 'pinterest', 'square', 'wide']).optional(),
    provider: z.enum(['dall-e-3', 'dall-e-2', 'stable-diffusion']).optional(),
    post_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

const SIZE_MAP: Record<string, string> = {
    featured: '1792x1024',  // 16:9 blog featured image
    pinterest: '1024x1536', // 2:3 Pinterest optimal
    square: '1024x1024',    // Square (Instagram)
    wide: '1792x1024',      // Wide hero
};

const STYLE_PROMPTS: Record<string, string> = {
    realistic: 'photorealistic, professional photography, high quality, detailed',
    illustration: 'digital illustration, flat design, modern, vibrant colors',
    minimalist: 'minimalist design, clean, simple, white background, elegant',
    infographic: 'infographic style, data visualization, icons, colorful charts',
    pinterest: 'pinterest style, lifestyle photography, warm tones, aspirational, vertical composition',
    product: 'product photography, clean background, professional studio lighting',
};

function buildImagePrompt(title: string, keyword: string, style: string, format: string): string {
    const styleHint = STYLE_PROMPTS[style] || STYLE_PROMPTS.realistic;
    const formatHint = format === 'pinterest' ? 'vertical orientation, tall format, text overlay space at top and bottom' : 'horizontal landscape orientation';

    return `Create a ${formatHint} blog featured image for an article titled "${title}" about "${keyword}".
Style: ${styleHint}.
No text or typography in the image.
Professional quality, suitable for a blog post.
The image should visually represent the topic clearly.`;
}

async function generateWithDallE(
    prompt: string,
    size: string,
    model: 'dall-e-3' | 'dall-e-2',
    apiKey: string
): Promise<{ url: string } | null> {
    try {
        const res = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model === 'dall-e-3' ? 'dall-e-3' : 'dall-e-2',
                prompt,
                n: 1,
                size: model === 'dall-e-3' ? size : '1024x1024', // dall-e-2 supports limited sizes
                quality: 'standard',
                response_format: 'url',
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        return { url: data.data?.[0]?.url };
    } catch (err) {
        throw err;
    }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = ImageGenSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const {
            prompt: customPrompt, title = '', keyword = '',
            style = 'realistic', format = 'featured',
            provider = 'dall-e-3', post_id,
        } = parsed.data;

        const { data: settings } = await auth.supabase
            .from('settings')
            .select('key, value')
            .in('key', ['openai_api_key', 'openrouter_api_key']);

        const s = Object.fromEntries((settings || []).map((r: { key: string; value: string }) => [r.key, r.value]));

        if (!s.openai_api_key && provider !== 'stable-diffusion') {
            return NextResponse.json({ error: 'OpenAI API key not configured in Settings' }, { status: 400 });
        }

        const finalPrompt = customPrompt || buildImagePrompt(title, keyword, style, format);
        const size = SIZE_MAP[format] || '1792x1024';

        let imageUrl: string | null = null;
        let usedProvider = provider;
        let error: string | null = null;

        // Try DALL-E 3 first
        if (s.openai_api_key && (provider === 'dall-e-3' || provider === 'dall-e-2')) {
            try {
                const result = await generateWithDallE(finalPrompt, size, provider, s.openai_api_key);
                imageUrl = result?.url || null;
            } catch (err) {
                error = err instanceof Error ? err.message : 'DALL-E generation failed';
                // Try DALL-E 2 as fallback if DALL-E 3 failed
                if (provider === 'dall-e-3' && s.openai_api_key) {
                    try {
                        const fallback = await generateWithDallE(finalPrompt, '1024x1024', 'dall-e-2', s.openai_api_key);
                        imageUrl = fallback?.url || null;
                        usedProvider = 'dall-e-2';
                        error = null;
                    } catch { /* both failed */ }
                }
            }
        }

        if (!imageUrl) {
            return NextResponse.json({ error: error || 'Image generation failed. Check OpenAI API key in Settings.' }, { status: 500 });
        }

        // Save generation record
        const { data: saved } = await auth.supabase
            .from('generated_images')
            .insert({
                user_id: auth.user.id,
                post_id: post_id || null,
                prompt: finalPrompt.substring(0, 500),
                title: title || keyword,
                style,
                format,
                provider: usedProvider,
                image_url: imageUrl,
                size,
                created_at: new Date().toISOString(),
            })
            .select('id')
            .single();

        return NextResponse.json({
            image_url: imageUrl,
            prompt: finalPrompt,
            provider: usedProvider,
            size,
            id: saved?.id,
            alt_text: `${keyword || title} - ${style} image`,
        });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('generated_images').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('post_id');

    let query = auth.supabase
        .from('generated_images')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(100);

    if (postId) query = query.eq('post_id', postId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ images: data || [] });
}
