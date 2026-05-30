// ============================================================
// RankMaster Pro - Content ROI Calculator API
// Actual profit per post: time + AI cost vs revenue
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['calculate', 'log_time', 'get_report', 'list']),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    hourly_rate: z.number().min(0).default(50).optional(),
    hours_spent: z.number().min(0).optional(),
    hosting_cost_monthly: z.number().min(0).default(20).optional(),
    months: z.number().int().min(1).max(60).default(6).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'calculate') {
        const { site_id, hourly_rate = 50, hosting_cost_monthly = 20, months = 6 } = parsed.data;

        // Get all posts for site with their affiliate data
        let postsQuery = auth.supabase.from('posts').select('id, title, slug, overall_score, status, created_at, published_at').eq('user_id', auth.user.id).eq('status', 'published');
        if (site_id) postsQuery = postsQuery.eq('site_id', site_id);
        const { data: posts } = await postsQuery.limit(100);

        // Get AI costs from content_records
        const { data: records } = await auth.supabase.from('content_records').select('post_id, generation_duration_ms').eq('user_id', auth.user.id).not('post_id', 'is', null);
        const costByPost = Object.fromEntries((records || []).map((r: { post_id: string; generation_duration_ms: number }) => [r.post_id, r.generation_duration_ms]));

        // Get affiliate revenue per post
        const { data: affLinks } = await auth.supabase.from('affiliate_links').select('post_id, clicks, conversions').eq('user_id', auth.user.id).not('post_id', 'is', null);
        const affByPost = new Map<string, { clicks: number; conversions: number }>();
        for (const l of affLinks || []) {
            if (!l.post_id) continue;
            const existing = affByPost.get(l.post_id) || { clicks: 0, conversions: 0 };
            existing.clicks += l.clicks || 0;
            existing.conversions += l.conversions || 0;
            affByPost.set(l.post_id, existing);
        }

        const perPost = (posts || []).map(post => {
            const aiCost = (costByPost[post.id] || 0) / 1000 * 0.04; // rough: 1000ms ≈ $0.04
            const laborCost = hourly_rate * 0.5; // avg 30min editing per AI-generated post
            const hostingAlloc = hosting_cost_monthly * months / Math.max((posts || []).length, 1);
            const totalCost = aiCost + laborCost + hostingAlloc;

            const aff = affByPost.get(post.id) || { clicks: 0, conversions: 0 };
            const estRevenue = aff.conversions * 15; // rough avg affiliate sale value
            const roi = totalCost > 0 ? ((estRevenue - totalCost) / totalCost) * 100 : 0;

            return {
                post_id: post.id,
                title: post.title,
                overall_score: post.overall_score,
                ai_cost: parseFloat(aiCost.toFixed(2)),
                labor_cost: parseFloat(laborCost.toFixed(2)),
                hosting_alloc: parseFloat(hostingAlloc.toFixed(2)),
                total_cost: parseFloat(totalCost.toFixed(2)),
                affiliate_clicks: aff.clicks,
                affiliate_conversions: aff.conversions,
                est_revenue: estRevenue,
                profit: parseFloat((estRevenue - totalCost).toFixed(2)),
                roi_pct: parseFloat(roi.toFixed(1)),
            };
        }).sort((a, b) => b.profit - a.profit);

        const totalCost = perPost.reduce((s, p) => s + p.total_cost, 0);
        const totalRevenue = perPost.reduce((s, p) => s + p.est_revenue, 0);
        const blendedROI = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;

        return NextResponse.json({
            per_post: perPost,
            summary: {
                total_posts: perPost.length,
                total_cost: parseFloat(totalCost.toFixed(2)),
                total_revenue: parseFloat(totalRevenue.toFixed(2)),
                total_profit: parseFloat((totalRevenue - totalCost).toFixed(2)),
                blended_roi_pct: parseFloat(blendedROI.toFixed(1)),
                top_performer: perPost[0] || null,
                avg_profit_per_post: perPost.length ? parseFloat(((totalRevenue - totalCost) / perPost.length).toFixed(2)) : 0,
                profitable_posts: perPost.filter(p => p.profit > 0).length,
            },
        });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data: sites } = await auth.supabase.from('sites').select('id, name').eq('user_id', auth.user.id);
    return NextResponse.json({ sites: sites || [] });
}
