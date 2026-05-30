// ============================================================
// RankMaster Pro - Content Freshness Auto-Scheduler API
// Intelligently queue refresh tasks based on age+rank+competition
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['analyze', 'schedule_all', 'get_queue', 'dismiss']),
    site_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

function calcFreshnessScore(post: {
    published_at: string | null;
    last_optimized_at: string | null;
    seo_score: number;
    decay_alert: boolean;
    overall_score: number;
}): { score: number; urgency: string; reason: string } {
    const now = Date.now();
    const publishedDate = post.published_at ? new Date(post.published_at).getTime() : now - 365 * 24 * 60 * 60 * 1000;
    const lastOptimized = post.last_optimized_at ? new Date(post.last_optimized_at).getTime() : publishedDate;
    const daysSinceOptimized = (now - lastOptimized) / (1000 * 60 * 60 * 24);
    const daysSincePublished = (now - publishedDate) / (1000 * 60 * 60 * 24);

    let score = 0;
    const reasons: string[] = [];

    // Age factor
    if (daysSinceOptimized > 365) { score += 40; reasons.push(`Not updated in ${Math.round(daysSinceOptimized / 30)} months`); }
    else if (daysSinceOptimized > 180) { score += 25; reasons.push(`${Math.round(daysSinceOptimized / 30)} months since last update`); }
    else if (daysSinceOptimized > 90) { score += 15; reasons.push('3+ months old'); }

    // Decay alert
    if (post.decay_alert) { score += 30; reasons.push('Ranking decline detected'); }

    // Low SEO score
    if (post.seo_score < 50) { score += 20; reasons.push(`Low SEO score: ${post.seo_score}/100`); }
    else if (post.seo_score < 65) { score += 10; }

    // Age for high-value content
    if (daysSincePublished > 90 && post.overall_score > 70) { score += 10; reasons.push('High-value post due for refresh'); }

    const urgency = score >= 60 ? 'critical' : score >= 40 ? 'high' : score >= 25 ? 'medium' : 'low';

    return { score: Math.min(100, score), urgency, reason: reasons.join('. ') };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'analyze') {
        const { site_id } = parsed.data;

        let query = auth.supabase.from('posts').select('id, title, seo_score, overall_score, decay_alert, published_at, last_optimized_at, site_id').eq('user_id', auth.user.id).eq('status', 'published');
        if (site_id) query = query.eq('site_id', site_id);
        const { data: posts } = await query;

        const analyzed = (posts || []).map(post => {
            const freshness = calcFreshnessScore(post);
            return { post_id: post.id, title: post.title, site_id: post.site_id, ...freshness };
        }).sort((a, b) => b.score - a.score);

        return NextResponse.json({
            analyzed,
            summary: {
                critical: analyzed.filter(p => p.urgency === 'critical').length,
                high: analyzed.filter(p => p.urgency === 'high').length,
                medium: analyzed.filter(p => p.urgency === 'medium').length,
                low: analyzed.filter(p => p.urgency === 'low').length,
            },
        });
    }

    if (action === 'schedule_all') {
        const { site_id } = parsed.data;

        let query = auth.supabase.from('posts').select('id, title, seo_score, overall_score, decay_alert, published_at, last_optimized_at, site_id').eq('user_id', auth.user.id).eq('status', 'published');
        if (site_id) query = query.eq('site_id', site_id);
        const { data: posts } = await query;

        const toSchedule = (posts || [])
            .map(post => ({ post, freshness: calcFreshnessScore(post) }))
            .filter(p => p.freshness.urgency === 'critical' || p.freshness.urgency === 'high')
            .slice(0, 20);

        // Create refresh workflows
        const existingWf = await auth.supabase.from('refresh_workflows').select('post_id').eq('user_id', auth.user.id).in('stage', ['flagged', 'planned', 'in_progress']);
        const existingIds = new Set((existingWf.data || []).map((w: { post_id: string }) => w.post_id));

        const toCreate = toSchedule.filter(p => !existingIds.has(p.post.id));
        if (toCreate.length > 0) {
            await auth.supabase.from('refresh_workflows').insert(
                toCreate.map(p => ({
                    user_id: auth.user.id,
                    post_id: p.post.id,
                    site_id: p.post.site_id,
                    post_title: p.post.title,
                    stage: 'flagged',
                    priority: p.freshness.urgency as 'critical' | 'high',
                    refresh_type: p.post.decay_alert ? 'fix_decay' : 'update_stats',
                    score_before: p.post.overall_score || 0,
                    notes: p.freshness.reason,
                    flagged_at: new Date().toISOString(),
                }))
            );
        }

        // Also create content tasks
        if (toCreate.length > 0) {
            await auth.supabase.from('team_tasks').insert(
                toCreate.map((p, i) => ({
                    owner_id: auth.user.id,
                    site_id: p.post.site_id,
                    task_type: 'refresh' as const,
                    title: `Refresh: ${p.post.title}`,
                    priority: p.freshness.urgency as 'urgent' | 'high' | 'normal' | 'low',
                    status: 'assigned' as const,
                    deadline: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                }))
            );
        }

        return NextResponse.json({ scheduled: toCreate.length, already_queued: toSchedule.length - toCreate.length });
    }

    if (action === 'dismiss') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('refresh_workflows').update({ stage: 'published' }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
