// ============================================================
// RankMaster Pro - Analytics API Route
// Aggregates real data from all tables for the analytics dashboard
// ============================================================

import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;
        const supabase = auth.supabase;

        // Get user's site IDs for scoping
        const { data: userSites } = await supabase.from('sites').select('id').eq('user_id', auth.user.id);
        const siteIds = (userSites || []).map(s => s.id);

        // Fetch all data in parallel — scoped to user's sites
        const siteFilter = siteIds.length > 0;
        const [sitesRes, keywordsRes, postsRes, queueRes, decayRes, usageRes, backlinksRes, rankRes, abTestsRes, affRevRes] = await Promise.allSettled([
            supabase.from('sites').select('id, name, url, niche', { count: 'exact' }).eq('user_id', auth.user.id),
            siteFilter ? supabase.from('keywords').select('id, keyword, search_volume, difficulty, status, intent_type, created_at', { count: 'exact' }).in('site_id', siteIds) : Promise.resolve({ data: [], count: 0 }),
            siteFilter ? supabase.from('posts').select('id, title, status, seo_score, published_at, created_at', { count: 'exact' }).in('site_id', siteIds) : Promise.resolve({ data: [], count: 0 }),
            supabase.from('content_queue').select('id, status, score, scheduled_at, created_at', { count: 'exact' }).eq('user_id', auth.user.id),
            siteFilter ? supabase.from('posts').select('id').eq('decay_alert', true).in('site_id', siteIds) : Promise.resolve({ data: [] }),
            supabase.from('api_usage').select('provider, model, task, tokens_in, tokens_out, estimated_cost, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(200),
            siteFilter ? supabase.from('backlinks').select('id, status', { count: 'exact' }).eq('user_id', auth.user.id) : Promise.resolve({ data: [], count: 0 }),
            siteFilter ? supabase.from('rank_tracking').select('id, keyword, position, created_at').in('site_id', siteIds).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
            supabase.from('ab_tests').select('id, status').eq('user_id', auth.user.id),
            supabase.from('affiliate_revenue').select('id, amount, created_at').eq('user_id', auth.user.id),
        ]);

        const sites = sitesRes.status === 'fulfilled' ? (sitesRes.value.data || []) : [];
        const keywords = keywordsRes.status === 'fulfilled' ? (keywordsRes.value.data || []) : [];
        const posts = postsRes.status === 'fulfilled' ? (postsRes.value.data || []) : [];
        const queue = queueRes.status === 'fulfilled' ? (queueRes.value.data || []) : [];
        const decayAlerts = decayRes.status === 'fulfilled' ? (decayRes.value.data || []) : [];
        const usage = usageRes.status === 'fulfilled' ? (usageRes.value.data || []) : [];
        const backlinks = backlinksRes.status === 'fulfilled' ? (backlinksRes.value.data || []) : [];
        const rankData = rankRes.status === 'fulfilled' ? (rankRes.value.data || []) : [];

        const publishedPosts = posts.filter(p => p.status === 'published');
        const draftPosts = posts.filter(p => p.status === 'draft');
        const scores = posts.filter(p => p.seo_score > 0).map(p => p.seo_score);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        // Queue stats
        const queueByStatus = {
            draft: queue.filter(q => q.status === 'draft').length,
            review: queue.filter(q => q.status === 'review').length,
            scheduled: queue.filter(q => q.status === 'scheduled').length,
            published: queue.filter(q => q.status === 'published').length,
        };

        // Keyword intent distribution
        const intentDist = keywords.reduce((acc: Record<string, number>, k) => {
            const intent = k.intent_type || 'unknown';
            acc[intent] = (acc[intent] || 0) + 1;
            return acc;
        }, {});

        // API costs
        const totalApiCost = usage.reduce((s, u) => s + parseFloat(u.estimated_cost || '0'), 0);
        const totalApiCalls = usage.length;

        // Today's cost
        const todayStr = new Date().toISOString().split('T')[0];
        const todayCost = usage
            .filter(u => u.created_at && u.created_at.startsWith(todayStr))
            .reduce((s, u) => s + parseFloat(u.estimated_cost || '0'), 0);

        // Rank tracking stats — get latest position per keyword
        const latestRanks = new Map<string, number>();
        for (const r of rankData) {
            if (!latestRanks.has(r.keyword)) {
                latestRanks.set(r.keyword, r.position);
            }
        }
        const totalTracked = latestRanks.size;
        const top10 = Array.from(latestRanks.values()).filter(p => p <= 10).length;
        const top3 = Array.from(latestRanks.values()).filter(p => p <= 3).length;
        const top20 = Array.from(latestRanks.values()).filter(p => p <= 20).length;
        const notRanking = Array.from(latestRanks.values()).filter(p => !p || p > 100).length;

        // A/B test stats
        const abTests = abTestsRes.status === 'fulfilled' ? (abTestsRes.value.data || []) : [];
        const activeTests = abTests.filter(t => t.status === 'running' || t.status === 'active').length;
        const completedTests = abTests.filter(t => t.status === 'completed' || t.status === 'winner_declared').length;

        // Affiliate revenue
        const affRevenue = affRevRes.status === 'fulfilled' ? (affRevRes.value.data || []) : [];
        const totalRevenue = affRevenue.reduce((s: number, r: { amount?: number }) => s + (r.amount || 0), 0);
        const thisMonthStr = new Date().toISOString().slice(0, 7);
        const thisMonthRevenue = affRevenue
            .filter((r: { created_at?: string }) => r.created_at?.startsWith(thisMonthStr))
            .reduce((s: number, r: { amount?: number }) => s + (r.amount || 0), 0);

        // Posts per week (last 4 weeks)
        const weeklyPosts: number[] = [0, 0, 0, 0];
        const now = new Date();
        posts.forEach(p => {
            const created = new Date(p.created_at);
            const weeksAgo = Math.floor((now.getTime() - created.getTime()) / (7 * 86400000));
            if (weeksAgo >= 0 && weeksAgo < 4) weeklyPosts[weeksAgo]++;
        });

        // Backlink stats
        const activeBacklinks = backlinks.filter(b => b.status === 'active').length;
        const newBacklinks = backlinks.filter(b => b.status === 'new').length;
        const lostBacklinks = backlinks.filter(b => b.status === 'lost').length;

        return NextResponse.json({
            overview: {
                totalSites: sites.length,
                totalKeywords: keywords.length,
                totalPosts: posts.length,
                publishedPosts: publishedPosts.length,
                draftPosts: draftPosts.length,
                avgScore,
                decayAlerts: decayAlerts.length,
                totalBacklinks: backlinks.length,
                activeBacklinks,
                newBacklinks,
                lostBacklinks,
            },
            rankTracking: {
                totalTracked,
                top10,
                top3,
                top20,
                notRanking,
                total: totalTracked,
            },
            abTests: {
                active: activeTests,
                completed: completedTests,
                avgLift: 0,
            },
            affiliateRevenue: {
                total: totalRevenue,
                thisMonth: thisMonthRevenue,
                clicks: affRevenue.length,
            },
            costs: {
                totalCost: totalApiCost,
                todayCost,
                totalCalls: totalApiCalls,
            },
            backlinks: {
                total: backlinks.length,
                active: activeBacklinks,
                new: newBacklinks,
                lost: lostBacklinks,
            },
            queue: queueByStatus,
            intentDistribution: intentDist,
            weeklyPosts,
            apiUsage: {
                totalCost: totalApiCost,
                totalCalls: totalApiCalls,
                recentUsage: usage.slice(0, 20),
            },
            sites: sites.map(s => ({ id: s.id, name: s.name, niche: s.niche })),
        });
    } catch (error) {
        logger.error('Analytics aggregation failed', { route: '/api/analytics' }, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
            { status: 500 }
        );
    }
}
