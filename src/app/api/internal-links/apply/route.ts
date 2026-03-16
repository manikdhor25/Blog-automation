import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createWordPressClient } from '@/lib/wordpress/client';
import { getLinkingEngine } from '@/lib/engines/linking-engine';
import { getAuthUser } from '@/lib/auth-guard';

interface LinkChange {
    postId: string;
    wpPostId: number;
    links: {
        anchorText: string;
        targetUrl: string;
        targetTitle: string;
        relevanceScore: number;
        type: 'internal' | 'external';
    }[];
}

// POST /api/internal-links/apply — Apply selected internal links to WordPress posts
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { site_id, changes } = await req.json() as { site_id: string; changes: LinkChange[] };

        if (!site_id || !changes || changes.length === 0) {
            return NextResponse.json({ error: 'site_id and changes[] required' }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();
        const engine = getLinkingEngine();

        // Get site for WP credentials
        const { data: site } = await supabase
            .from('sites')
            .select('*')
            .eq('id', site_id)
            .single();

        if (!site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        const wp = createWordPressClient(site);
        const results: { postId: string; title: string; success: boolean; linksAdded: number; error?: string }[] = [];

        for (const change of changes) {
            try {
                // Fetch current content from Supabase
                const { data: post } = await supabase
                    .from('posts')
                    .select('id, title, content_html, wp_post_id')
                    .eq('id', change.postId)
                    .single();

                if (!post || !post.content_html) {
                    results.push({
                        postId: change.postId,
                        title: 'Unknown',
                        success: false,
                        linksAdded: 0,
                        error: 'Post not found or empty content',
                    });
                    continue;
                }

                // Insert links into content
                const updatedContent = engine.insertLinksIntoContent(post.content_html, change.links);

                // Check if content actually changed
                if (updatedContent === post.content_html) {
                    results.push({
                        postId: change.postId,
                        title: post.title,
                        success: true,
                        linksAdded: 0,
                        error: 'No anchor text matches found in content',
                    });
                    continue;
                }

                // Push to WordPress
                const wpPostId = change.wpPostId || post.wp_post_id;
                if (wpPostId) {
                    await wp.updatePost(wpPostId, { content: updatedContent });
                }

                // Update Supabase
                await supabase
                    .from('posts')
                    .update({ content_html: updatedContent })
                    .eq('id', change.postId);

                // Count actual links inserted by comparing content
                const linkCountBefore = (post.content_html.match(/<a\s/gi) || []).length;
                const linkCountAfter = (updatedContent.match(/<a\s/gi) || []).length;
                const actualLinksAdded = linkCountAfter - linkCountBefore;

                results.push({
                    postId: change.postId,
                    title: post.title,
                    success: true,
                    linksAdded: actualLinksAdded,
                });
            } catch (err) {
                results.push({
                    postId: change.postId,
                    title: '',
                    success: false,
                    linksAdded: 0,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }

        const successCount = results.filter(r => r.success && r.linksAdded > 0).length;
        const totalLinksAdded = results.reduce((sum, r) => sum + r.linksAdded, 0);

        return NextResponse.json({
            success: true,
            results,
            summary: {
                postsUpdated: successCount,
                totalLinksAdded,
                failures: results.filter(r => !r.success).length,
            },
        });
    } catch (error) {
        console.error('[InternalLinks] Apply failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Apply failed' },
            { status: 500 }
        );
    }
}
