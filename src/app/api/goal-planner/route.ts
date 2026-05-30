// ============================================================
// RankMaster Pro - Revenue Goal Planner API
// Reverse-engineer income goal → exact content + keyword plan
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['plan', 'save', 'list', 'delete', 'track_progress']),
    monthly_goal: z.number().min(100).max(1000000).optional(),
    current_monthly_revenue: z.number().min(0).default(0).optional(),
    niche: z.string().max(200).optional(),
    avg_commission_rate: z.number().min(0.1).max(50).default(5).optional(),
    avg_order_value: z.number().min(1).default(50).optional(),
    current_monthly_traffic: z.number().int().min(0).default(0).optional(),
    affiliate_ctr_pct: z.number().min(0.1).max(20).default(3).optional(),
    conversion_rate_pct: z.number().min(0.01).max(20).default(2).optional(),
    timeframe_months: z.number().int().min(1).max(36).default(12).optional(),
    site_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

function calcRevenueModel(params: {
    monthly_goal: number;
    current_revenue: number;
    avg_commission_rate: number;
    avg_order_value: number;
    affiliate_ctr_pct: number;
    conversion_rate_pct: number;
    current_traffic: number;
    timeframe_months: number;
}) {
    const revenueGap = params.monthly_goal - params.current_revenue;
    const avgCommissionPerSale = (params.avg_order_value * params.avg_commission_rate) / 100;
    const salesNeeded = revenueGap / avgCommissionPerSale;
    const clicksNeeded = salesNeeded / (params.conversion_rate_pct / 100);
    const trafficNeeded = clicksNeeded / (params.affiliate_ctr_pct / 100);
    const trafficGap = trafficNeeded - params.current_traffic;
    const monthlyTrafficGrowthNeeded = trafficGap / params.timeframe_months;

    // Posts needed (assuming 100 sessions/post/month for new posts)
    const avgSessionsPerPost = 150; // conservative estimate
    const postsNeeded = Math.ceil(trafficGap / avgSessionsPerPost);
    const postsPerMonth = Math.ceil(postsNeeded / params.timeframe_months);

    // Milestones
    const milestones = [
        { month: 1, target_revenue: params.current_revenue * 1.2, posts_to_publish: postsPerMonth * 1 },
        { month: 3, target_revenue: params.current_revenue + (revenueGap * 0.15), posts_to_publish: postsPerMonth * 3 },
        { month: 6, target_revenue: params.current_revenue + (revenueGap * 0.4), posts_to_publish: postsPerMonth * 6 },
        { month: 12, target_revenue: params.monthly_goal, posts_to_publish: postsNeeded },
    ].filter(m => m.month <= params.timeframe_months);

    return {
        revenue_gap: Math.round(revenueGap),
        avg_commission_per_sale: parseFloat(avgCommissionPerSale.toFixed(2)),
        monthly_sales_needed: Math.ceil(salesNeeded),
        monthly_clicks_needed: Math.ceil(clicksNeeded),
        monthly_traffic_needed: Math.ceil(trafficNeeded),
        traffic_gap: Math.ceil(trafficGap),
        monthly_traffic_growth_needed: Math.ceil(monthlyTrafficGrowthNeeded),
        total_posts_needed: postsNeeded,
        posts_per_month: postsPerMonth,
        milestones,
        feasibility: postsPerMonth <= 20 ? 'achievable' : postsPerMonth <= 40 ? 'ambitious' : 'very_ambitious',
        weekly_posts: Math.ceil(postsPerMonth / 4),
    };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'plan') {
        const {
            monthly_goal = 5000, current_monthly_revenue = 0, niche,
            avg_commission_rate = 5, avg_order_value = 50,
            current_monthly_traffic = 0, affiliate_ctr_pct = 3,
            conversion_rate_pct = 2, timeframe_months = 12, site_id,
        } = parsed.data;

        // Auto-pull current data if site_id provided
        let autoRevenue = current_monthly_revenue;
        let autoTraffic = current_monthly_traffic;

        if (site_id) {
            const [revRes, gaRes] = await Promise.all([
                auth.supabase.from('affiliate_revenue').select('amount').eq('user_id', auth.user.id).order('month', { ascending: false }).limit(3),
                auth.supabase.from('ga4_page_metrics').select('sessions').eq('user_id', auth.user.id).eq('site_id', site_id),
            ]);
            if (!current_monthly_revenue && revRes.data?.length) {
                autoRevenue = revRes.data.reduce((s: number, r: { amount: number }) => s + r.amount, 0) / revRes.data.length;
            }
            if (!current_monthly_traffic && gaRes.data?.length) {
                autoTraffic = (gaRes.data as Array<{ sessions: number }>).reduce((s, r) => s + r.sessions, 0);
            }
        }

        const model = calcRevenueModel({
            monthly_goal, current_revenue: autoRevenue, avg_commission_rate,
            avg_order_value, affiliate_ctr_pct, conversion_rate_pct,
            current_traffic: autoTraffic, timeframe_months,
        });

        // AI-generated action plan
        const prompt = `Create a specific action plan for a ${niche || 'general'} affiliate blog to reach $${monthly_goal}/month in ${timeframe_months} months.

Current state: $${autoRevenue}/month revenue, ${autoTraffic} monthly sessions
Gap to fill: $${model.revenue_gap}/month
Posts needed: ${model.total_posts_needed} posts (${model.posts_per_month}/month)
Traffic needed: ${model.monthly_traffic_needed}/month

Return ONLY valid JSON:
{
  "priority_content_types": ["content type 1 with % of posts", "type 2"],
  "keyword_strategy": "specific keyword tier strategy (long-tail first, etc.)",
  "quick_wins": ["action to take this week for immediate revenue boost"],
  "month_1_actions": ["specific action 1", "action 2", "action 3"],
  "month_3_actions": ["action at 3 months"],
  "top_affiliate_programs_to_join": ["program 1 for this niche", "program 2"],
  "content_calendar_template": ["Week 1: X", "Week 2: Y", "Week 3: Z", "Week 4: W"],
  "traffic_sources_priority": ["source 1", "source 2", "source 3"],
  "bottleneck_risk": "biggest risk to achieving this goal",
  "confidence_score": 75
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'Expert affiliate marketing strategist. Specific, numbers-driven. Return only JSON.', maxTokens: 1500, jsonMode: true });
        let aiPlan = {};
        if (result.success && result.content) {
            try { const m = result.content.match(/\{[\s\S]*\}/); aiPlan = JSON.parse(m?.[0] || result.content); } catch { /* skip */ }
        }

        const fullPlan = { ...model, monthly_goal, niche, timeframe_months, current_revenue: autoRevenue, current_traffic: autoTraffic, ...aiPlan };

        // Save plan
        const { data: saved } = await auth.supabase.from('goal_plans').insert({
            user_id: auth.user.id,
            site_id: site_id || null,
            monthly_goal,
            niche: niche || '',
            timeframe_months,
            plan_data: fullPlan,
            current_revenue: autoRevenue,
            target_posts: model.total_posts_needed,
        }).select('id').single();

        return NextResponse.json({ plan: fullPlan, id: saved?.id, provider: result.provider });
    }

    if (action === 'track_progress') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data: plan } = await auth.supabase.from('goal_plans').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

        const [revRes, postsRes] = await Promise.all([
            auth.supabase.from('affiliate_revenue').select('amount').eq('user_id', auth.user.id).order('month', { ascending: false }).limit(1),
            auth.supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id).eq('status', 'published').gte('created_at', plan.created_at),
        ]);

        const currentRevenue = revRes.data?.[0]?.amount || 0;
        const postsPublished = (postsRes.count as number) || 0;
        const revenueProgress = plan.monthly_goal > 0 ? (currentRevenue / plan.monthly_goal) * 100 : 0;
        const postsProgress = plan.target_posts > 0 ? (postsPublished / plan.target_posts) * 100 : 0;

        return NextResponse.json({
            plan,
            progress: {
                current_revenue: currentRevenue,
                revenue_progress_pct: parseFloat(revenueProgress.toFixed(1)),
                posts_published: postsPublished,
                posts_progress_pct: parseFloat(postsProgress.toFixed(1)),
                on_track: revenueProgress >= postsProgress * 0.8,
            },
        });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('goal_plans').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('goal_plans').select('id, monthly_goal, niche, timeframe_months, target_posts, current_revenue, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ plans: data || [] });
}
