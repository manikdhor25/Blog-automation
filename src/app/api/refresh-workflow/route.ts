// ============================================================
// RankMaster Pro - Content Refresh Workflow API
// Decay alert → assign → rewrite → republish → measure lift
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['create', 'update_stage', 'assign', 'generate_refresh_plan', 'complete', 'list', 'delete', 'measure_lift']),
    id: z.string().uuid().optional(),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    assignee_email: z.string().email().optional(),
    stage: z.enum(['flagged', 'planned', 'in_progress', 'review', 'published', 'measuring']).optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    notes: z.string().max(2000).optional(),
    refresh_type: z.enum(['full_rewrite', 'update_stats', 'add_sections', 'fix_decay', 'expand_keyword']).optional(),
    target_improvements: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'create') {
        const { post_id, site_id, priority, refresh_type, notes } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        // Get post data
        const { data: post } = await auth.supabase.from('posts').select('title, seo_score, overall_score, published_at, keyword_id').eq('id', post_id).single();

        const { data, error } = await auth.supabase.from('refresh_workflows').insert({
            user_id: auth.user.id,
            post_id,
            site_id: site_id || null,
            post_title: post?.title || '',
            stage: 'flagged',
            priority: priority || 'medium',
            refresh_type: refresh_type || 'fix_decay',
            score_before: post?.overall_score || 0,
            notes: notes || '',
            flagged_at: new Date().toISOString(),
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ workflow: data });
    }

    if (action === 'generate_refresh_plan') {
        const { post_id } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('title, content_markdown, content_html, seo_score, overall_score, meta_description, keyword_id, keywords(keyword, search_volume, intent_type)').eq('id', post_id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const contentSnippet = (post.content_markdown || post.content_html?.replace(/<[^>]+>/g, ' ') || '').substring(0, 3000);
        const kw = (post as unknown as { keywords?: { keyword: string; search_intent: string } }).keywords;

        const prompt = `You are an SEO content strategist. Analyze this post and create a specific refresh action plan.

Post: "${post.title}"
Keyword: ${kw?.keyword || 'unknown'}
Current SEO score: ${post.seo_score}/100
Current overall score: ${post.overall_score}/100

Content excerpt:
${contentSnippet}

Return ONLY valid JSON:
{
  "refresh_urgency": "critical|high|medium|low",
  "estimated_time_hours": 2,
  "likely_issues": ["issue 1", "issue 2", "issue 3"],
  "action_plan": [
    {
      "task": "specific task description",
      "type": "add_content|rewrite_section|update_stats|add_images|fix_links|improve_meta|add_faq|update_schema",
      "section": "which section or heading",
      "effort": "15min|30min|1h|2h",
      "impact": "high|medium|low",
      "specific_instruction": "exact what to write or change"
    }
  ],
  "new_sections_to_add": ["section idea 1", "section idea 2"],
  "outdated_stats_to_update": ["stat 1", "stat 2"],
  "target_word_count": 2200,
  "target_seo_score": 85,
  "competitor_gaps": ["gap 1", "gap 2"]
}`;

        const result = await routeAI({ task: 'content_optimization', prompt, systemPrompt: 'SEO content refresh expert. Return only JSON.', maxTokens: 2000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Plan generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            const plan = JSON.parse(jsonMatch?.[0] || result.content);

            // Save plan to workflow if exists
            await auth.supabase.from('refresh_workflows')
                .update({ refresh_plan: plan, stage: 'planned', updated_at: new Date().toISOString() })
                .eq('post_id', post_id)
                .eq('user_id', auth.user.id)
                .eq('stage', 'flagged');

            return NextResponse.json({ plan, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'update_stage') {
        const { id, stage, notes } = parsed.data;
        if (!id || !stage) return NextResponse.json({ error: 'id and stage required' }, { status: 400 });

        const updates: Record<string, unknown> = { stage, updated_at: new Date().toISOString() };
        if (notes) updates.notes = notes;
        if (stage === 'published') updates.refreshed_at = new Date().toISOString();

        await auth.supabase.from('refresh_workflows').update(updates).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'assign') {
        const { id, assignee_email } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('refresh_workflows').update({ assignee_email: assignee_email || null, stage: 'in_progress', updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'measure_lift') {
        const { id, post_id } = parsed.data;
        if (!id || !post_id) return NextResponse.json({ error: 'id and post_id required' }, { status: 400 });

        const [wfRes, postRes] = await Promise.all([
            auth.supabase.from('refresh_workflows').select('score_before').eq('id', id).single(),
            auth.supabase.from('posts').select('overall_score, seo_score').eq('id', post_id).single(),
        ]);

        const scoreBefore = wfRes.data?.score_before || 0;
        const scoreAfter = postRes.data?.overall_score || 0;
        const lift = scoreAfter - scoreBefore;

        await auth.supabase.from('refresh_workflows').update({ score_after: scoreAfter, score_lift: lift, stage: 'measuring', updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ score_before: scoreBefore, score_after: scoreAfter, lift });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('refresh_workflows').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage');
    const siteId = searchParams.get('site_id');

    // Auto-create workflows for decay-flagged posts not yet in workflow
    if (searchParams.get('sync_decay') === '1') {
        const { data: decayPosts } = await auth.supabase.from('posts').select('id, title, site_id, overall_score').eq('user_id', auth.user.id).eq('decay_alert', true).limit(50);
        const { data: existing } = await auth.supabase.from('refresh_workflows').select('post_id').eq('user_id', auth.user.id);
        const existingIds = new Set((existing || []).map((e: { post_id: string }) => e.post_id));

        const toCreate = (decayPosts || []).filter(p => !existingIds.has(p.id));
        if (toCreate.length > 0) {
            await auth.supabase.from('refresh_workflows').insert(
                toCreate.map(p => ({ user_id: auth.user.id, post_id: p.id, site_id: p.site_id, post_title: p.title, stage: 'flagged', priority: 'high', refresh_type: 'fix_decay', score_before: p.overall_score || 0, flagged_at: new Date().toISOString() }))
            );
        }
    }

    let query = auth.supabase.from('refresh_workflows').select('*').eq('user_id', auth.user.id).order('flagged_at', { ascending: false });
    if (stage && stage !== 'all') query = query.eq('stage', stage);
    if (siteId) query = query.eq('site_id', siteId);

    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const stages = ['flagged', 'planned', 'in_progress', 'review', 'published', 'measuring'];
    const counts = Object.fromEntries(stages.map(s => [s, (data || []).filter(w => w.stage === s).length]));
    const avgLift = (data || []).filter(w => w.score_lift).reduce((s: number, w: { score_lift: number }) => s + w.score_lift, 0) / Math.max((data || []).filter(w => w.score_lift).length, 1);

    return NextResponse.json({ workflows: data || [], counts, avg_lift: parseFloat(avgLift.toFixed(1)) });
}
