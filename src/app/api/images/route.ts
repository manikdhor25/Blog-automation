import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAIRouter } from '@/lib/ai/router';

// POST /api/images/generate — Generate image prompts and alt text for content
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const rateLimited = checkRateLimit(auth.user.id, '/api/images', { maxRequests: 15, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const { title, keyword, content, count } = body;

        if (!title) {
            return NextResponse.json({ error: 'title required' }, { status: 400 });
        }

        const router = getAIRouter();
        await router.loadKeys();

        const imageCount = Math.min(count || 3, 6);

        const prompt = `You are an expert at creating image prompts for blog posts and generating SEO-optimized alt text.

Article Title: ${title}
Keyword: ${keyword || 'N/A'}
Content Preview: ${(content || '').slice(0, 1000)}

Generate ${imageCount} image suggestions for this article. For each, provide:
1. A detailed prompt suitable for AI image generation (DALL-E, Midjourney)
2. SEO-optimized alt text (include keyword naturally, max 125 chars)
3. Suggested placement in the article
4. Image type (hero, infographic, diagram, photo, illustration)

Respond in valid JSON:
{
    "images": [
        {
            "prompt": "Detailed image generation prompt here",
            "alt_text": "SEO-optimized alt text with keyword",
            "placement": "Hero image / After introduction / Before conclusion / etc",
            "type": "hero|infographic|diagram|photo|illustration",
            "filename_suggestion": "keyword-descriptive-name.webp",
            "dimensions": "1200x630|1200x800|800x800"
        }
    ],
    "open_graph": {
        "prompt": "Social sharing image prompt (1200x630)",
        "alt_text": "OG image alt text"
    },
    "twitter_card": {
        "prompt": "Twitter card image prompt (1200x600)",
        "alt_text": "Twitter card alt text"
    }
}`;



        const result = await router.generate('content_writing', prompt);

        let images;
        try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            images = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
            images = { raw: result };
        }

        return NextResponse.json({ images, title, keyword });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Image generation failed' },
            { status: 500 }
        );
    }
}
