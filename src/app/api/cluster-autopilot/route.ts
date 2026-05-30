// ============================================================
// RankMaster Pro - Content Cluster Auto-Pilot API
// Input topic → full cluster map → schedule → auto-link
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['generate_cluster', 'save_cluster', 'schedule_cluster', 'get_status', 'list', 'delete']),
    pillar_topic: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    site_id: z.string().uuid().optional(),
    target_posts: z.number().int().min(5).max(30).default(15).optional(),
    publishing_frequency: z.enum(['daily', '3x_week', '2x_week', 'weekly']).default('3x_week').optional(),
    monetization_focus: z.enum(['affiliate', 'ads', 'mixed']).default('mixed').optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate_cluster') {
        const { pillar_topic, niche, target_posts = 15, publishing_frequency, monetization_focus } = parsed.data;
        if (!pillar_topic) return NextResponse.json({ error: 'pillar_topic required' }, { status: 400 });

        const freqDays: Record<string, number> = { daily: 1, '3x_week': 2.3, '2x_week': 3.5, weekly: 7 };
        const daysPerPost = freqDays[publishing_frequency || '3x_week'];
        const totalDays = Math.ceil(target_posts * daysPerPost);

        const prompt = `Design a complete topical authority cluster for "${pillar_topic}" in the ${niche || 'general'} niche.

Target: ${target_posts} posts
Publishing: ${publishing_frequency}
Monetization: ${monetization_focus}

Return ONLY valid JSON:
{
  "cluster_name": "${pillar_topic} Authority Cluster",
  "pillar_post": {
    "title": "The Ultimate Guide to [pillar topic] (2025)",
    "keyword": "main pillar keyword",
    "search_volume": "5K-20K",
    "type": "pillar",
    "publish_order": ${target_posts},
    "publish_week": ${Math.ceil(totalDays / 7)},
    "word_count_target": 5000,
    "monetization": "overview of all topics, soft affiliate links"
  },
  "supporting_posts": [
    {
      "title": "specific supporting post title",
      "keyword": "long-tail keyword",
      "search_volume": "500-2K",
      "type": "informational|commercial|transactional",
      "publish_order": 1,
      "publish_week": 1,
      "word_count_target": 1800,
      "monetization": "how to monetize this post",
      "links_to": ["pillar", "other supporting post title"],
      "priority": "high|medium|low",
      "difficulty": "easy|medium|hard"
    }
  ],
  "publishing_schedule": [
    {"week": 1, "posts": ["post title 1", "post title 2"]},
    {"week": 2, "posts": ["post title 3"]}
  ],
  "internal_linking_plan": "strategy for linking all posts together",
  "cluster_seo_strategy": "how this cluster builds topical authority",
  "estimated_completion_weeks": ${Math.ceil(totalDays / 7)},
  "estimated_monthly_traffic_at_completion": "10K-50K"
}`;

        const result = await routeAI({ task: 'content_optimization', prompt, systemPrompt: 'SEO cluster architect. Topical authority expert. Return only JSON.', maxTokens: 4000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            const cluster = JSON.parse(m?.[0] || result.content);
            return NextResponse.json({ cluster, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'save_cluster') {
        const { pillar_topic, niche, site_id } = parsed.data;
        const clusterData = body.cluster_data;
        if (!clusterData || !pillar_topic) return NextResponse.json({ error: 'cluster_data and pillar_topic required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('cluster_autopilot').insert({
            user_id: auth.user.id,
            site_id: site_id || null,
            pillar_topic,
            niche: niche || '',
            cluster_data: clusterData,
            total_posts: clusterData.supporting_posts?.length + 1 || 0,
            posts_created: 0,
            status: 'planned',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ cluster: data });
    }

    if (action === 'schedule_cluster') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data: cluster } = await auth.supabase.from('cluster_autopilot').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!cluster) return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });

        const clusterData = cluster.cluster_data as { supporting_posts?: Array<{ title: string; keyword: string; type: string; publish_week: number }> };
        const posts = clusterData.supporting_posts || [];

        // Create content tasks for each post in the cluster
        const tasks = posts.map((post) => ({
            user_id: auth.user.id,
            site_id: cluster.site_id,
            task_type: 'write' as const,
            title: post.title,
            keyword: post.keyword,
            priority: 'normal' as const,
            status: 'assigned' as const,
            deadline: new Date(Date.now() + (post.publish_week || 1) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        }));

        await auth.supabase.from('team_tasks').insert(tasks);
        await auth.supabase.from('cluster_autopilot').update({ status: 'scheduled' }).eq('id', id);

        return NextResponse.json({ scheduled: tasks.length, message: 'Tasks created in Team Manager' });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('cluster_autopilot').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('cluster_autopilot').select('id, pillar_topic, niche, total_posts, posts_created, status, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ clusters: data || [] });
}
