// ============================================================
// RankMaster Pro - Social Publishing API
// Schedule and publish to Pinterest, Twitter, LinkedIn
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { publishToPinterest, publishToTwitter, publishToLinkedIn, adaptContentForPlatform } from '@/lib/engines/social-publisher';
import { z } from 'zod';

const SocialSchema = z.object({
    action: z.enum(['generate_content', 'publish', 'schedule', 'list', 'delete', 'get_accounts']),
    platform: z.enum(['pinterest', 'twitter', 'linkedin', 'all']).optional(),
    post_id: z.string().uuid().optional(),
    blog_title: z.string().max(500).optional(),
    blog_excerpt: z.string().max(2000).optional(),
    blog_url: z.string().url().optional(),
    blog_keyword: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    content: z.string().max(3000).optional(),
    image_url: z.string().optional(),
    scheduled_at: z.string().optional(),
    id: z.string().uuid().optional(),
    board_id: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = SocialSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate_content') {
        const { blog_title, blog_excerpt, blog_url, blog_keyword, niche, platform } = parsed.data;
        if (!blog_title) return NextResponse.json({ error: 'blog_title required' }, { status: 400 });

        const prompt = `Create social media content for a blog post about "${blog_keyword || blog_title}" in the ${niche || 'general'} niche.

Blog post: "${blog_title}"
Excerpt: "${(blog_excerpt || '').substring(0, 500)}"
URL: ${blog_url || ''}

Return ONLY valid JSON:
{
  "pinterest": {
    "title": "max 100 chars, compelling, keyword-rich",
    "description": "max 500 chars, includes keyword, benefit-focused, ends with CTA",
    "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
  },
  "twitter": {
    "text": "max 240 chars, punchy, includes emoji, no hashtags in body",
    "hashtags": ["tag1", "tag2", "tag3"]
  },
  "linkedin": {
    "text": "max 600 chars, professional tone, insight-driven, ends with question or CTA",
    "hashtags": ["tag1", "tag2", "tag3"]
  }
}`;

        const result = await routeAI({ task: 'meta_generation', prompt, systemPrompt: 'Social media expert. Return only JSON.', maxTokens: 1000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            const content = JSON.parse(jsonMatch?.[0] || result.content);
            return NextResponse.json({ content, provider: result.provider });
        } catch {
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }
    }

    if (action === 'publish') {
        const { platform, content, image_url, blog_url, board_id } = parsed.data;
        if (!platform || !content) return NextResponse.json({ error: 'platform and content required' }, { status: 400 });

        // Get social credentials
        const { data: settings } = await auth.supabase
            .from('settings')
            .select('key, value')
            .in('key', [
                'pinterest_access_token', 'pinterest_board_id',
                'twitter_bearer_token',
                'linkedin_access_token', 'linkedin_person_urn',
            ]);

        const s = Object.fromEntries((settings || []).map((row: { key: string; value: string }) => [row.key, row.value]));
        const results = [];

        const platformsToPublish = platform === 'all' ? ['pinterest', 'twitter', 'linkedin'] : [platform];

        for (const p of platformsToPublish) {
            let result;
            if (p === 'pinterest') {
                if (!s.pinterest_access_token) { results.push({ platform: 'pinterest', success: false, error: 'Pinterest not configured' }); continue; }
                result = await publishToPinterest(
                    { platform: 'pinterest', content, image_url, link_url: blog_url, board_id: board_id || s.pinterest_board_id },
                    s.pinterest_access_token, s.pinterest_board_id
                );
            } else if (p === 'twitter') {
                if (!s.twitter_bearer_token) { results.push({ platform: 'twitter', success: false, error: 'Twitter not configured' }); continue; }
                result = await publishToTwitter(
                    { platform: 'twitter', content, link_url: blog_url },
                    s.twitter_bearer_token
                );
            } else if (p === 'linkedin') {
                if (!s.linkedin_access_token || !s.linkedin_person_urn) { results.push({ platform: 'linkedin', success: false, error: 'LinkedIn not configured' }); continue; }
                result = await publishToLinkedIn(
                    { platform: 'linkedin', content, link_url: blog_url },
                    s.linkedin_access_token, s.linkedin_person_urn
                );
            } else continue;
            results.push(result);
        }

        // Log all publish attempts
        await auth.supabase.from('social_posts').insert(
            results.map(r => ({
                user_id: auth.user.id,
                post_id: parsed.data.post_id || null,
                platform: r.platform,
                content: content.substring(0, 1000),
                image_url: image_url || null,
                blog_url: blog_url || null,
                platform_post_id: r.post_id || null,
                platform_post_url: r.post_url || null,
                status: r.success ? 'published' : 'failed',
                error: r.error || null,
                published_at: r.success ? new Date().toISOString() : null,
            }))
        );

        return NextResponse.json({ results });
    }

    if (action === 'schedule') {
        const { platform, content, image_url, blog_url, scheduled_at } = parsed.data;
        if (!platform || !content || !scheduled_at) return NextResponse.json({ error: 'platform, content, scheduled_at required' }, { status: 400 });

        const { data, error } = await auth.supabase
            .from('social_posts')
            .insert({
                user_id: auth.user.id,
                post_id: parsed.data.post_id || null,
                platform,
                content: content.substring(0, 1000),
                image_url: image_url || null,
                blog_url: blog_url || null,
                status: 'scheduled',
                scheduled_at,
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ scheduled: data });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('social_posts').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const status = searchParams.get('status');

    let query = auth.supabase
        .from('social_posts')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(200);

    if (platform) query = query.eq('platform', platform);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const summary = {
        total: data?.length || 0,
        published: data?.filter(p => p.status === 'published').length || 0,
        scheduled: data?.filter(p => p.status === 'scheduled').length || 0,
        failed: data?.filter(p => p.status === 'failed').length || 0,
        by_platform: {
            pinterest: data?.filter(p => p.platform === 'pinterest').length || 0,
            twitter: data?.filter(p => p.platform === 'twitter').length || 0,
            linkedin: data?.filter(p => p.platform === 'linkedin').length || 0,
        },
    };

    return NextResponse.json({ posts: data || [], summary });
}
