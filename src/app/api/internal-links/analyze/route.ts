import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getLinkingEngine } from '@/lib/engines/linking-engine';
import { getAuthUser } from '@/lib/auth-guard';

// POST /api/internal-links/analyze — Bulk analyze posts for internal link opportunities
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { site_id, offset = 0, limit = 20 } = await req.json();

        if (!site_id) {
            return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();
        const engine = getLinkingEngine();

        // Get site URL
        const { data: site } = await supabase
            .from('sites')
            .select('url')
            .eq('id', site_id)
            .single();

        if (!site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        // Get all posts for this site (for the link map)
        const { data: allPosts } = await supabase
            .from('posts')
            .select('id, title, slug, content_html, wp_post_id')
            .eq('site_id', site_id)
            .order('created_at', { ascending: false });

        if (!allPosts || allPosts.length === 0) {
            return NextResponse.json({
                results: [],
                total: 0,
                offset,
                hasMore: false,
                stats: { totalPosts: 0, totalSuggestions: 0, postsWithNoLinks: 0, avgLinksPerPost: 0 },
            });
        }

        // Build site post map using linking engine (includes keyword column)
        const linkGraph = await engine.buildSiteLinkGraph(site_id);
        const sitePostMap = linkGraph.posts;

        // Paginate — only analyze a batch
        const batch = allPosts.slice(offset, offset + limit);

        // Analyze each post in the batch
        const results = [];
        let totalSuggestions = 0;
        let postsWithNoLinks = 0;

        for (const post of batch) {
            // Count existing internal links in this post
            const siteUrl = site.url.replace(/\/$/, '');
            const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
            let internalLinkCount = 0;
            let match;
            while ((match = linkRegex.exec(post.content_html || '')) !== null) {
                const href = match[1];
                if (href.includes(siteUrl) || (href.startsWith('/') && !href.startsWith('//'))) {
                    internalLinkCount++;
                }
            }

            if (internalLinkCount === 0) postsWithNoLinks++;

            // Get AI suggestions for this post
            let suggestions: { anchorText: string; targetUrl: string; targetTitle: string; relevanceScore: number; type: string }[] = [];
            try {
                suggestions = await engine.suggestInternalLinks(
                    post.content_html || '',
                    post.title,
                    sitePostMap,
                    siteUrl
                );
            } catch (err) {
                console.warn(`[InternalLinks] AI suggestion failed for "${post.title}":`, err);
            }

            totalSuggestions += suggestions.length;

            results.push({
                postId: post.id,
                wpPostId: post.wp_post_id,
                title: post.title,
                slug: post.slug,
                currentInternalLinks: internalLinkCount,
                suggestions: suggestions.map((s, i) => ({
                    id: `${post.id}-${i}`,
                    ...s,
                })),
            });
        }

        return NextResponse.json({
            results,
            total: allPosts.length,
            offset,
            hasMore: offset + limit < allPosts.length,
            stats: {
                totalPosts: allPosts.length,
                totalSuggestions,
                postsWithNoLinks,
                avgLinksPerPost: allPosts.length > 0
                    ? parseFloat((totalSuggestions / batch.length).toFixed(1))
                    : 0,
            },
        });
    } catch (error) {
        console.error('[InternalLinks] Analysis failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Analysis failed' },
            { status: 500 }
        );
    }
}
