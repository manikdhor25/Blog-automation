import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/link-graph — Build internal link graph for a site
export async function GET(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const siteId = req.nextUrl.searchParams.get('site_id');

        if (!siteId) {
            return NextResponse.json({ error: 'site_id required' }, { status: 400 });
        }

        // Get all posts
        const { data: posts } = await auth.supabase
            .from('posts')
            .select('id, title, slug, keyword, seo_score, content')
            .eq('site_id', siteId)
            .order('created_at', { ascending: false });

        if (!posts || posts.length === 0) {
            return NextResponse.json({ nodes: [], edges: [], stats: { total: 0, orphans: 0, hubs: 0 } });
        }

        // Get site URL
        const { data: site } = await auth.supabase.from('sites').select('url').eq('id', siteId).single();
        const siteUrl = site?.url || '';

        // Build nodes
        const nodes = posts.map(p => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            keyword: p.keyword,
            score: p.seo_score || 0,
        }));

        // Scan content for internal links to build edges
        const edges: Array<{ source: string; target: string }> = [];
        const incomingCount: Record<string, number> = {};
        const outgoingCount: Record<string, number> = {};

        for (const post of posts) {
            if (!post.content) continue;
            outgoingCount[post.id] = 0;

            for (const other of posts) {
                if (other.id === post.id) continue;

                // Check if this post links to the other post
                const slugPatterns = [
                    `/${other.slug}`,
                    `${siteUrl}/${other.slug}`,
                    other.slug,
                ];

                const hasLink = slugPatterns.some(pattern =>
                    post.content.includes(pattern)
                );

                if (hasLink) {
                    edges.push({ source: post.id, target: other.id });
                    outgoingCount[post.id] = (outgoingCount[post.id] || 0) + 1;
                    incomingCount[other.id] = (incomingCount[other.id] || 0) + 1;
                }
            }
        }

        // Identify orphans (no incoming links) and hubs (many outgoing)
        const orphans = nodes.filter(n => !incomingCount[n.id] || incomingCount[n.id] === 0);
        const hubs = nodes
            .filter(n => (outgoingCount[n.id] || 0) >= 3)
            .sort((a, b) => (outgoingCount[b.id] || 0) - (outgoingCount[a.id] || 0));

        // Annotate nodes with link counts
        const annotatedNodes = nodes.map(n => ({
            ...n,
            incoming: incomingCount[n.id] || 0,
            outgoing: outgoingCount[n.id] || 0,
            isOrphan: !incomingCount[n.id] || incomingCount[n.id] === 0,
            isHub: (outgoingCount[n.id] || 0) >= 3,
        }));

        return NextResponse.json({
            nodes: annotatedNodes,
            edges,
            stats: {
                totalPages: nodes.length,
                totalLinks: edges.length,
                orphans: orphans.length,
                hubs: hubs.length,
                avgLinksPerPage: nodes.length > 0 ? (edges.length / nodes.length).toFixed(1) : 0,
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Link graph failed' },
            { status: 500 }
        );
    }
}
