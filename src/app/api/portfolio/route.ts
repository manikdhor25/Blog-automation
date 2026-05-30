import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    // Pull all sites
    const { data: sites } = await supabase.from('sites').select('*').eq('user_id', user.id);
    if (!sites?.length) return NextResponse.json({ portfolio: [] });

    const portfolio = await Promise.all(sites.map(async (site) => {
        const siteId = site.id;

        // Post stats
        const { count: totalPosts } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('site_id', siteId);
        const { count: publishedPosts } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('site_id', siteId).eq('status', 'publish');

        // Rank tracking
        const { data: rankData } = await supabase.from('rank_positions').select('position, keyword').eq('site_id', siteId).order('checked_at', { ascending: false }).limit(100);
        const top10 = rankData?.filter(r => r.position <= 10).length || 0;
        const top3 = rankData?.filter(r => r.position <= 3).length || 0;

        // Keywords
        const { count: keywordCount } = await supabase.from('keywords').select('*', { count: 'exact', head: true }).eq('site_id', siteId);

        // Decay alerts
        const { count: decayCount } = await supabase.from('decay_alerts').select('*', { count: 'exact', head: true }).eq('site_id', siteId).eq('status', 'active');

        // Recent affiliate earnings
        const thisMonth = new Date().toISOString().substring(0, 7);
        const { data: earnings } = await supabase.from('affiliate_earnings').select('revenue').eq('site_id', siteId).eq('month', thisMonth);
        const monthlyRevenue = earnings?.reduce((sum, e) => sum + (e.revenue || 0), 0) || 0;

        // Click tracker
        const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data: clicks } = await supabase.from('link_clicks').select('converted, commission_amount').eq('user_id', user.id).gte('created_at', since30);
        const clickRevenue = clicks?.filter(c => c.converted).reduce((sum, c) => sum + (c.commission_amount || 0), 0) || 0;

        // Monetization score avg
        const { data: monScores } = await supabase.from('monetization_scores').select('score').eq('site_id', siteId);
        const avgMonScore = monScores?.length ? Math.round(monScores.reduce((s, m) => s + m.score, 0) / monScores.length) : null;

        // Topical authority
        const { data: authScore } = await supabase.from('topical_authority_scores').select('overall_score, grade').eq('site_id', siteId).order('analyzed_at', { ascending: false }).limit(1).single();

        // Pending tasks
        const { count: pendingTasks } = await supabase.from('team_tasks').select('*', { count: 'exact', head: true }).eq('site_id', siteId).in('status', ['assigned', 'in_progress']);

        // Content pipeline
        const { count: pipelineRuns } = await supabase.from('pipeline_runs').select('*', { count: 'exact', head: true }).eq('site_id', siteId);

        return {
            id: siteId,
            name: site.name,
            url: site.url,
            niche: site.niche || '',
            total_posts: totalPosts || 0,
            published_posts: publishedPosts || 0,
            keywords_tracked: keywordCount || 0,
            top10_keywords: top10,
            top3_keywords: top3,
            decay_alerts: decayCount || 0,
            monthly_revenue: monthlyRevenue + clickRevenue,
            avg_monetization_score: avgMonScore,
            topical_authority: authScore ? { score: authScore.overall_score, grade: authScore.grade } : null,
            pending_tasks: pendingTasks || 0,
            pipeline_runs: pipelineRuns || 0,
            created_at: site.created_at,
        };
    }));

    // Totals
    const totals = {
        sites: portfolio.length,
        posts: portfolio.reduce((s, p) => s + p.total_posts, 0),
        keywords: portfolio.reduce((s, p) => s + p.keywords_tracked, 0),
        monthly_revenue: portfolio.reduce((s, p) => s + p.monthly_revenue, 0),
        decay_alerts: portfolio.reduce((s, p) => s + p.decay_alerts, 0),
        pending_tasks: portfolio.reduce((s, p) => s + p.pending_tasks, 0),
    };

    return NextResponse.json({ portfolio, totals });
}
