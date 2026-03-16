import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { siteId } = await request.json();

        // Get site details — scoped to authenticated user
        const { data: site, error: siteError } = await auth.supabase
            .from('sites')
            .select('*')
            .eq('id', siteId)
            .eq('user_id', auth.user.id)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        // Fetch posts from WordPress REST API
        const wpUrl = site.url.replace(/\/$/, '');
        const authHeader = 'Basic ' + Buffer.from(`${site.username}:${site.app_password_encrypted}`).toString('base64');

        const postsRes = await fetch(`${wpUrl}/wp-json/wp/v2/posts?per_page=100&status=publish,draft`, {
            headers: { Authorization: authHeader },
        });

        if (!postsRes.ok) {
            return NextResponse.json({ error: `WordPress API error: ${postsRes.status}` }, { status: 502 });
        }

        const wpPosts = await postsRes.json();
        let synced = 0;
        let created = 0;

        for (const wp of wpPosts) {
            // Check if post already exists
            const { data: existing } = await auth.supabase
                .from('posts')
                .select('id')
                .eq('site_id', siteId)
                .eq('wp_post_id', wp.id)
                .single();

            const postData = {
                site_id: siteId,
                wp_post_id: wp.id,
                title: wp.title?.rendered?.replace(/(<([^>]+)>)/gi, '') || 'Untitled',
                slug: wp.slug || '',
                content_html: wp.content?.rendered || '',
                content_markdown: '',
                status: wp.status === 'publish' ? 'published' : 'draft',
                meta_title: wp.title?.rendered?.replace(/(<([^>]+)>)/gi, '') || '',
                meta_description: wp.excerpt?.rendered?.replace(/(<([^>]+)>)/gi, '').trim() || '',
                published_at: wp.date || null,
                seo_score: 0,
                aeo_score: 0,
                eeat_score: 0,
                readability_score: 0,
                snippet_score: 0,
                overall_score: 0,
                schema_markup_json: {},
                decay_alert: false,
            };

            if (existing) {
                await auth.supabase.from('posts').update(postData).eq('id', existing.id);
                synced++;
            } else {
                await auth.supabase.from('posts').insert(postData);
                created++;
            }
        }

        return NextResponse.json({
            success: true,
            totalWpPosts: wpPosts.length,
            synced,
            created,
            message: `Synced ${wpPosts.length} posts (${created} new, ${synced} updated)`,
        });
    } catch (error) {
        logger.error('WordPress sync failed', { route: '/api/sites/sync' }, error);
        return NextResponse.json({ error: 'Failed to sync posts' }, { status: 500 });
    }
}
