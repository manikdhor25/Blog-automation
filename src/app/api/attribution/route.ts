// ============================================================
// RankMaster Pro - Revenue Attribution API
// Maps keyword → post → affiliate clicks → revenue
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'funnel';
    const siteId = searchParams.get('site_id');

    if (view === 'funnel') {
        // Full funnel: keywords with posts → affiliate links → revenue
        let kQuery = auth.supabase
            .from('keywords')
            .select('id, keyword, search_volume, intent_type, priority_score')
            .eq('user_id', auth.user.id)
            .not('status', 'eq', 'archived')
            .order('priority_score', { ascending: false })
            .limit(100);
        if (siteId) kQuery = kQuery.eq('site_id', siteId);

        const { data: keywords } = await kQuery;

        // Posts with affiliate link count + click count
        let pQuery = auth.supabase
            .from('posts')
            .select('id, title, keyword_id, seo_score, overall_score, published_at, status')
            .eq('user_id', auth.user.id)
            .not('keyword_id', 'is', null);
        if (siteId) pQuery = pQuery.eq('site_id', siteId);
        const { data: posts } = await pQuery;

        // Affiliate links with click counts
        const { data: links } = await auth.supabase
            .from('affiliate_links')
            .select('post_id, clicks, conversions, affiliate_programs(commission_rate, commission_type, avg_order_value)')
            .eq('user_id', auth.user.id)
            .not('post_id', 'is', null);

        // Revenue records
        const { data: revenue } = await auth.supabase
            .from('affiliate_revenue')
            .select('program_id, amount, month')
            .eq('user_id', auth.user.id)
            .order('month', { ascending: false })
            .limit(120);

        // Build attribution map
        const postLinkMap = new Map<string, { clicks: number; conversions: number; est_revenue: number }>();
        for (const link of links || []) {
            if (!link.post_id) continue;
            const existing = postLinkMap.get(link.post_id) || { clicks: 0, conversions: 0, est_revenue: 0 };
            const prog = link.affiliate_programs as unknown as { commission_rate: number; commission_type: string; avg_order_value: number } | null;
            const commRate = prog?.commission_rate || 0;
            const conversions = link.conversions || 0;
            // Flat: fixed payout per conversion. Percentage: needs the program's
            // average order value (revenue = conversions x AOV x rate/100).
            // If AOV is unset (0), percentage revenue stays 0 (unknown) rather
            // than fabricating a number.
            const perConversion = prog?.commission_type === 'flat'
                ? commRate
                : (prog?.avg_order_value || 0) * (commRate / 100);
            existing.clicks += link.clicks || 0;
            existing.conversions += conversions;
            existing.est_revenue += conversions * perConversion;
            postLinkMap.set(link.post_id, existing);
        }

        const keywordMap = new Map((keywords || []).map(k => [k.id, k]));

        const funnel = (posts || []).map(post => {
            const kw = post.keyword_id ? keywordMap.get(post.keyword_id) : null;
            const linkData = postLinkMap.get(post.id) || { clicks: 0, conversions: 0, est_revenue: 0 };
            return {
                post_id: post.id,
                post_title: post.title,
                keyword: kw?.keyword || null,
                search_volume: kw?.search_volume || 0,
                intent: kw?.intent_type || null,
                seo_score: post.seo_score,
                overall_score: post.overall_score,
                status: post.status,
                affiliate_clicks: linkData.clicks,
                conversions: linkData.conversions,
                est_revenue: linkData.est_revenue,
                published_at: post.published_at,
            };
        }).sort((a, b) => b.affiliate_clicks - a.affiliate_clicks);

        const totalRevenue = (revenue || []).reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0);
        const totalClicks = funnel.reduce((s, f) => s + f.affiliate_clicks, 0);

        return NextResponse.json({
            funnel,
            summary: {
                total_posts_with_keywords: funnel.length,
                total_affiliate_clicks: totalClicks,
                total_revenue: totalRevenue,
                top_earning_post: funnel[0] || null,
                avg_clicks_per_post: funnel.length ? Math.round(totalClicks / funnel.length) : 0,
            },
        });
    }

    if (view === 'top_keywords') {
        // Which keywords drive the most affiliate clicks
        const { data: posts } = await auth.supabase
            .from('posts')
            .select('id, title, keyword_id, keywords(keyword, search_volume, cpc)')
            .eq('user_id', auth.user.id)
            .not('keyword_id', 'is', null);

        const { data: links } = await auth.supabase
            .from('affiliate_links')
            .select('post_id, clicks, conversions')
            .eq('user_id', auth.user.id)
            .not('post_id', 'is', null)
            .gt('clicks', 0);

        const postMap = new Map((posts || []).map(p => [p.id, p]));

        const kwClicks = new Map<string, { keyword: string; volume: number; clicks: number; conversions: number; cpc: number }>();
        for (const link of links || []) {
            const post = link.post_id ? postMap.get(link.post_id) : null;
            if (!post?.keyword_id) continue;
            const kw = (post as unknown as { keywords?: { keyword: string; search_volume: number; cpc: number } }).keywords;
            const existing = kwClicks.get(post.keyword_id) || { keyword: kw?.keyword || '', volume: kw?.search_volume || 0, clicks: 0, conversions: 0, cpc: kw?.cpc || 0 };
            existing.clicks += link.clicks || 0;
            existing.conversions += link.conversions || 0;
            kwClicks.set(post.keyword_id, existing);
        }

        const sorted = [...kwClicks.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 50);
        return NextResponse.json({ top_keywords: sorted });
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
}
