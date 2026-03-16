import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAIRouter } from '@/lib/ai/router';

// POST /api/repurpose — Generate social media snippets from a blog post
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const rateLimited = checkRateLimit(auth.user.id, '/api/repurpose', { maxRequests: 10, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const { post_id, site_id, formats } = body;

        if (!post_id || !site_id) {
            return NextResponse.json({ error: 'post_id and site_id required' }, { status: 400 });
        }

        const { data: post, error: postError } = await auth.supabase
            .from('posts')
            .select('title, content, keyword, slug')
            .eq('id', post_id)
            .single();

        if (postError || !post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        const requestedFormats = formats || ['twitter', 'linkedin', 'email', 'video_script'];

        const prompt = `You are a social media content expert. Given this blog post, create repurposed content for the requested formats.

Blog Post Title: ${post.title}
Target Keyword: ${post.keyword || 'N/A'}
Content (first 2000 chars): ${(post.content || '').slice(0, 2000)}

Generate content for these formats: ${requestedFormats.join(', ')}

Respond in valid JSON format:
{
    "twitter": {
        "thread": ["tweet1 (max 280 chars)", "tweet2", "tweet3"],
        "single": "Single engaging tweet with hashtags (max 280 chars)"
    },
    "linkedin": {
        "post": "Professional LinkedIn post (300-600 words) with emojis and line breaks"
    },
    "email": {
        "subject": "Email subject line",
        "preview": "Email preview text (max 90 chars)",
        "body": "Newsletter-style email body (200-400 words)"
    },
    "video_script": {
        "hook": "Opening hook (first 3 seconds)",
        "outline": ["Point 1", "Point 2", "Point 3"],
        "cta": "Call to action"
    }
}

Only include requested formats. Make content engaging and platform-appropriate.`;

        const router = getAIRouter();
        await router.loadKeys();
        const result = await router.generate('content_writing', prompt);

        let snippets;
        try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            snippets = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
            snippets = { raw: result };
        }

        return NextResponse.json({
            snippets,
            source: { title: post.title, keyword: post.keyword, slug: post.slug },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Repurposing failed' },
            { status: 500 }
        );
    }
}
