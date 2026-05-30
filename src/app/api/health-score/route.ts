// ============================================================
// RankMaster Pro - Site Health Score API
// Single 0-100 score: content + SEO + links + revenue + tech
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

interface HealthDimension { score: number; max: number; label: string; issues: string[]; }

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const siteId = new URL(request.url).searchParams.get('site_id');
    if (!siteId) {
        const { data: sites } = await auth.supabase.from('sites').select('id, name').eq('user_id', auth.user.id);
        return NextResponse.json({ sites: sites || [] });
    }

    // Gather all site data in parallel
    const [postsRes, keywordsRes, backlinksRes, affLinksRes, revRes, decayRes, abRes] = await Promise.all([
        auth.supabase.from('posts').select('seo_score, overall_score, decay_alert, status').eq('site_id', siteId).eq('user_id', auth.user.id),
        auth.supabase.from('keywords').select('status, priority_score').eq('site_id', siteId).eq('user_id', auth.user.id),
        auth.supabase.from('backlinks').select('domain_authority, status').eq('site_id', siteId).eq('user_id', auth.user.id),
        auth.supabase.from('affiliate_links').select('clicks, conversions, status').eq('site_id', siteId).eq('user_id', auth.user.id),
        auth.supabase.from('affiliate_revenue').select('amount').eq('user_id', auth.user.id).order('month', { ascending: false }).limit(3),
        auth.supabase.from('posts').select('id', { count: 'exact', head: true }).eq('site_id', siteId).eq('user_id', auth.user.id).eq('decay_alert', true),
        auth.supabase.from('ab_tests').select('status').eq('site_id', siteId).eq('user_id', auth.user.id),
    ]);

    const posts = postsRes.data || [];
    const keywords = keywordsRes.data || [];
    const backlinks = backlinksRes.data || [];
    const affLinks = affLinksRes.data || [];
    const revenue = revRes.data || [];
    const decayCount = (decayRes.count as number) || 0;
    const abTests = abRes.data || [];

    // ── Content Score (25 pts) ───────────────────────────────
    const publishedPosts = posts.filter(p => p.status === 'published').length;
    const avgSeo = posts.length ? posts.reduce((s, p) => s + (p.seo_score || 0), 0) / posts.length : 0;
    const avgOverall = posts.length ? posts.reduce((s, p) => s + (p.overall_score || 0), 0) / posts.length : 0;
    const contentIssues: string[] = [];
    if (publishedPosts < 10) contentIssues.push('Less than 10 published posts');
    if (avgSeo < 60) contentIssues.push(`Low average SEO score (${avgSeo.toFixed(0)}/100)`);
    if (decayCount > 0) contentIssues.push(`${decayCount} posts flagged for decay`);
    const contentScore = Math.min(25, Math.round((publishedPosts >= 10 ? 8 : publishedPosts * 0.8) + (avgSeo / 100) * 10 + (avgOverall / 100) * 7));

    // ── Keyword Score (20 pts) ───────────────────────────────
    const rankingKws = keywords.filter(k => k.status === 'ranking').length;
    const kwIssues: string[] = [];
    if (keywords.length === 0) kwIssues.push('No keywords tracked');
    if (rankingKws < 5) kwIssues.push(`Only ${rankingKws} keywords ranking in top results`);
    const kwScore = Math.min(20, Math.round((keywords.length > 0 ? 5 : 0) + Math.min(15, rankingKws * 1.5)));

    // ── Backlink Score (20 pts) ──────────────────────────────
    const activeBacklinks = backlinks.filter(b => b.status === 'active').length;
    const avgDA = backlinks.length ? backlinks.reduce((s, b) => s + (b.domain_authority || 0), 0) / backlinks.length : 0;
    const blIssues: string[] = [];
    if (activeBacklinks < 10) blIssues.push('Less than 10 active backlinks');
    if (avgDA < 20) blIssues.push(`Low average referring domain DA (${avgDA.toFixed(0)})`);
    const blScore = Math.min(20, Math.round(Math.min(10, activeBacklinks * 0.5) + (avgDA / 100) * 10));

    // ── Monetization Score (20 pts) ──────────────────────────
    const totalAffClicks = affLinks.reduce((s, l) => s + (l.clicks || 0), 0);
    const totalRevenue = revenue.reduce((s, r) => s + (r.amount || 0), 0);
    const monIssues: string[] = [];
    if (affLinks.length === 0) monIssues.push('No affiliate links tracked');
    if (totalRevenue === 0) monIssues.push('No affiliate revenue recorded');
    const monScore = Math.min(20, Math.round((affLinks.length > 0 ? 5 : 0) + (totalAffClicks > 100 ? 7 : totalAffClicks * 0.07) + (totalRevenue > 0 ? 8 : 0)));

    // ── Optimization Score (15 pts) ──────────────────────────
    const optIssues: string[] = [];
    if (decayCount > 3) optIssues.push(`${decayCount} posts need refreshing`);
    if (abTests.filter(t => t.status === 'running').length === 0) optIssues.push('No active A/B tests');
    const optScore = Math.min(15, Math.round((decayCount === 0 ? 7 : Math.max(0, 7 - decayCount)) + (abTests.length > 0 ? 8 : 0)));

    const total = contentScore + kwScore + blScore + monScore + optScore;
    const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';
    const label = total >= 85 ? 'Excellent' : total >= 70 ? 'Good' : total >= 55 ? 'Average' : total >= 40 ? 'Needs Work' : 'Critical';

    const dimensions: Record<string, HealthDimension> = {
        content: { score: contentScore, max: 25, label: 'Content Quality', issues: contentIssues },
        keywords: { score: kwScore, max: 20, label: 'Keyword Rankings', issues: kwIssues },
        backlinks: { score: blScore, max: 20, label: 'Link Authority', issues: blIssues },
        monetization: { score: monScore, max: 20, label: 'Monetization', issues: monIssues },
        optimization: { score: optScore, max: 15, label: 'Optimization', issues: optIssues },
    };

    const allIssues = Object.values(dimensions).flatMap(d => d.issues);

    return NextResponse.json({
        score: total,
        grade,
        label,
        dimensions,
        all_issues: allIssues,
        stats: { posts: publishedPosts, keywords_ranking: rankingKws, backlinks: activeBacklinks, monthly_revenue: totalRevenue / Math.max(revenue.length, 1) },
    });
}
