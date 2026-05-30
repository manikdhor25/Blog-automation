import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const CreateSchema = z.object({
    action: z.literal('create'),
    platform: z.enum(['twitter', 'linkedin', 'pinterest', 'facebook', 'instagram']),
    content: z.string().min(1),
    image_url: z.string().url().optional(),
    link_url: z.string().url().optional(),
    scheduled_at: z.string(),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    recurring: z.boolean().default(false),
    recurring_interval_days: z.number().int().optional(),
});

const GenerateSchema = z.object({
    action: z.literal('generate'),
    post_title: z.string().min(1),
    post_url: z.string().optional(),
    post_excerpt: z.string().optional(),
    niche: z.string().optional(),
    platforms: z.array(z.enum(['twitter', 'linkedin', 'pinterest', 'facebook'])).default(['twitter', 'linkedin']),
});

const BulkScheduleSchema = z.object({
    action: z.literal('bulk_schedule'),
    post_id: z.string().uuid(),
    post_title: z.string().min(1),
    post_url: z.string().optional(),
    post_excerpt: z.string().optional(),
    niche: z.string().optional(),
    platforms: z.array(z.string()),
    start_date: z.string(),
    spacing_days: z.number().int().min(1).default(3),
});

const PLATFORM_LIMITS: Record<string, number> = { twitter: 280, linkedin: 3000, pinterest: 500, facebook: 63206, instagram: 2200 };

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const from = url.searchParams.get('from') || new Date().toISOString().substring(0, 10);
    const to = url.searchParams.get('to') || new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10);

    const { data: scheduled } = await supabase.from('scheduled_social_posts')
        .select('*').eq('user_id', user.id)
        .gte('scheduled_at', from).lte('scheduled_at', to + 'T23:59:59')
        .order('scheduled_at', { ascending: true });

    const { data: stats } = await supabase.from('scheduled_social_posts').select('platform, status').eq('user_id', user.id);
    const platformStats: Record<string, { total: number; published: number; pending: number }> = {};
    for (const s of stats || []) {
        if (!platformStats[s.platform]) platformStats[s.platform] = { total: 0, published: 0, pending: 0 };
        platformStats[s.platform].total++;
        if (s.status === 'published') platformStats[s.platform].published++;
        if (s.status === 'scheduled') platformStats[s.platform].pending++;
    }

    return NextResponse.json({ posts: scheduled || [], platform_stats: platformStats });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create') {
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const charLimit = PLATFORM_LIMITS[d.platform];
        if (d.content.length > charLimit) {
            return NextResponse.json({ error: `${d.platform} limit is ${charLimit} chars (got ${d.content.length})` }, { status: 400 });
        }

        const { data, error } = await supabase.from('scheduled_social_posts').insert({
            user_id: user.id, post_id: d.post_id || null, site_id: d.site_id || null,
            platform: d.platform, content: d.content, image_url: d.image_url || null,
            link_url: d.link_url || null, scheduled_at: d.scheduled_at,
            status: 'scheduled', recurring: d.recurring,
            recurring_interval_days: d.recurring_interval_days || null,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ post: data });
    }

    if (body.action === 'generate') {
        const parsed = GenerateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Generate social media posts for this blog content:

Title: ${d.post_title}
URL: ${d.post_url || 'https://yourblog.com/post'}
${d.post_excerpt ? `Excerpt: ${d.post_excerpt.substring(0, 300)}` : ''}
Niche: ${d.niche || 'general'}

Generate one post per platform. Each should be unique, platform-appropriate, engaging.

Return JSON object with platform keys:
{
  ${d.platforms.map(p => `"${p}": { "content": "post text (respect char limits: twitter=280, linkedin=2000, pinterest=500)", "hashtags": ["tag1"], "suggested_image_alt": "alt text" }`).join(',\n  ')}
}`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt, json: true });
        let posts;
        try { posts = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
        return NextResponse.json({ posts, provider });
    }

    if (body.action === 'bulk_schedule') {
        const parsed = BulkScheduleSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Generate content for each platform
        const genRes = await fetch('/api/social-scheduler', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', post_title: d.post_title, post_url: d.post_url, post_excerpt: d.post_excerpt, niche: d.niche, platforms: d.platforms }),
        });
        const genData = await genRes.json();
        const posts = genData.posts || {};

        const scheduled = [];
        let dayOffset = 0;
        for (const platform of d.platforms) {
            if (!posts[platform]) continue;
            const schedDate = new Date(d.start_date);
            schedDate.setDate(schedDate.getDate() + dayOffset);
            schedDate.setHours(9, 0, 0, 0); // 9am

            const { data } = await supabase.from('scheduled_social_posts').insert({
                user_id: user.id, post_id: d.post_id, site_id: null,
                platform, content: posts[platform].content,
                link_url: d.post_url || null, scheduled_at: schedDate.toISOString(),
                status: 'scheduled', recurring: false,
            }).select().single();

            if (data) scheduled.push(data);
            dayOffset += d.spacing_days;
        }

        return NextResponse.json({ scheduled, count: scheduled.length });
    }

    if (body.action === 'update_status') {
        await supabase.from('scheduled_social_posts').update({ status: body.status }).eq('id', body.post_id).eq('user_id', user.id);
        return NextResponse.json({ updated: true });
    }

    if (body.action === 'delete') {
        await supabase.from('scheduled_social_posts').delete().eq('id', body.post_id).eq('user_id', user.id);
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
