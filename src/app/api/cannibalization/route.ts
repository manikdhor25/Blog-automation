import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/cannibalization — Detect keyword cannibalization
export async function GET(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const siteId = req.nextUrl.searchParams.get('site_id');

        if (!siteId) {
            return NextResponse.json({ error: 'site_id required' }, { status: 400 });
        }

        // Get all posts for this site
        const { data: posts } = await auth.supabase
            .from('posts')
            .select('id, title, slug, keyword, seo_score, status')
            .eq('site_id', siteId)
            .order('created_at', { ascending: false });

        if (!posts || posts.length === 0) {
            return NextResponse.json({ conflicts: [], summary: { total: 0, high: 0, medium: 0, low: 0 } });
        }

        // Get saved keywords for this site
        const { data: keywords } = await auth.supabase
            .from('keywords')
            .select('keyword, search_volume, difficulty')
            .eq('site_id', siteId);

        // Build keyword → posts mapping
        const keywordMap: Record<string, Array<{
            postId: string; title: string; slug: string; keyword: string; score: number; status: string;
        }>> = {};

        for (const post of posts) {
            if (!post.keyword) continue;
            const normalized = post.keyword.toLowerCase().trim();
            if (!keywordMap[normalized]) keywordMap[normalized] = [];
            keywordMap[normalized].push({
                postId: post.id,
                title: post.title,
                slug: post.slug,
                keyword: post.keyword,
                score: post.seo_score || 0,
                status: post.status || 'unknown',
            });
        }

        // Also check for partial overlaps (e.g., "best shoes" vs "best running shoes")
        const allKeywords = Object.keys(keywordMap);
        const partialOverlaps: Record<string, string[]> = {};
        for (let i = 0; i < allKeywords.length; i++) {
            for (let j = i + 1; j < allKeywords.length; j++) {
                const a = allKeywords[i];
                const b = allKeywords[j];
                if (a.includes(b) || b.includes(a)) {
                    if (!partialOverlaps[a]) partialOverlaps[a] = [];
                    partialOverlaps[a].push(b);
                }
            }
        }

        // Build conflicts list
        const conflicts: Array<{
            keyword: string;
            severity: 'high' | 'medium' | 'low';
            type: 'exact' | 'partial';
            posts: Array<{ postId: string; title: string; slug: string; score: number; status: string }>;
            recommendation: string;
            searchVolume?: number;
            difficulty?: number;
        }> = [];

        // Exact duplicates (high severity)
        for (const [kw, kwPosts] of Object.entries(keywordMap)) {
            if (kwPosts.length > 1) {
                const kwData = (keywords || []).find(k => k.keyword.toLowerCase() === kw);
                const sorted = [...kwPosts].sort((a, b) => b.score - a.score);
                const best = sorted[0];
                const others = sorted.slice(1);

                let recommendation = '';
                if (others.every(p => p.score < 40)) {
                    recommendation = `Merge weaker posts into "${best.title}" and 301 redirect.`;
                } else if (others.length === 1) {
                    recommendation = `Differentiate intent. Keep "${best.title}" as primary and refocus "${others[0].title}" on a related long-tail keyword.`;
                } else {
                    recommendation = `${kwPosts.length} posts target "${kw}". Keep best-performing and redirect or de-optimize others.`;
                }

                conflicts.push({
                    keyword: kw,
                    severity: kwPosts.length >= 3 ? 'high' : 'medium',
                    type: 'exact',
                    posts: kwPosts,
                    recommendation,
                    searchVolume: kwData?.search_volume,
                    difficulty: kwData?.difficulty,
                });
            }
        }

        // Partial overlaps (low-medium severity)
        for (const [primary, overlapping] of Object.entries(partialOverlaps)) {
            for (const secondary of overlapping) {
                const primaryPosts = keywordMap[primary] || [];
                const secondaryPosts = keywordMap[secondary] || [];
                if (primaryPosts.length > 0 && secondaryPosts.length > 0) {
                    const allPosts = [...primaryPosts, ...secondaryPosts];
                    conflicts.push({
                        keyword: `${primary} ↔ ${secondary}`,
                        severity: 'low',
                        type: 'partial',
                        posts: allPosts,
                        recommendation: `These keywords overlap. Consider using one as a pillar and the other as a supporting article with clear intent differentiation.`,
                    });
                }
            }
        }

        // Sort by severity
        const severityOrder = { high: 0, medium: 1, low: 2 };
        conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        const summary = {
            total: conflicts.length,
            high: conflicts.filter(c => c.severity === 'high').length,
            medium: conflicts.filter(c => c.severity === 'medium').length,
            low: conflicts.filter(c => c.severity === 'low').length,
        };

        return NextResponse.json({ conflicts, summary });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Cannibalization check failed' },
            { status: 500 }
        );
    }
}
