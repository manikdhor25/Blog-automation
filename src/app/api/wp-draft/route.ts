// ============================================================
// RankMaster Pro - WordPress Draft Auto-Pusher API
// Push content as WP draft for editorial review
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['push_draft', 'push_batch', 'update_draft', 'list_drafts']),
    post_id: z.string().uuid().optional(),
    post_ids: z.array(z.string().uuid()).max(20).optional(),
    site_id: z.string().uuid().optional(),
    include_meta: z.boolean().default(true).optional(),
    include_schema: z.boolean().default(true).optional(),
    categories: z.array(z.number()).optional(),
    tags: z.array(z.number()).optional(),
    wp_post_id: z.number().int().optional(),
});

async function pushToWP(
    siteUrl: string,
    credentials: string,
    title: string,
    content: string,
    metaTitle: string,
    metaDesc: string,
    schemaJson: Record<string, unknown>,
    categories: number[],
    tags: number[],
    wpPostId?: number
) {
    const baseUrl = siteUrl.replace(/\/$/, '') + '/wp-json/wp/v2/posts';
    const method = wpPostId ? 'PUT' : 'POST';
    const url = wpPostId ? `${baseUrl}/${wpPostId}` : baseUrl;

    // Inject schema into content
    const schemaTag = Object.keys(schemaJson).length > 0
        ? `\n\n<script type="application/ld+json">${JSON.stringify(schemaJson)}</script>`
        : '';

    const body: Record<string, unknown> = {
        title: { raw: title },
        content: { raw: content + schemaTag },
        status: 'draft',
    };
    if (categories?.length) body.categories = categories;
    if (tags?.length) body.tags = tags;

    const res = await fetch(url, {
        method,
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `WP API: ${res.status}`);
    }

    const data = await res.json();

    // Try to set Yoast SEO meta if plugin active
    if (metaTitle || metaDesc) {
        await fetch(`${baseUrl}/${data.id}`, {
            method: 'PUT',
            headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meta: {
                    _yoast_wpseo_title: metaTitle,
                    _yoast_wpseo_metadesc: metaDesc,
                    rank_math_title: metaTitle,
                    rank_math_description: metaDesc,
                },
            }),
            signal: AbortSignal.timeout(10000),
        }).catch(() => {}); // Non-fatal
    }

    return { wp_post_id: data.id, wp_edit_url: `${siteUrl.replace(/\/$/, '')}/wp-admin/post.php?post=${data.id}&action=edit`, wp_preview_url: data.link + '?preview=true' };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    const pushSingle = async (postId: string) => {
        const { data: post } = await auth.supabase.from('posts').select('*').eq('id', postId).eq('user_id', auth.user.id).single();
        if (!post) throw new Error('Post not found');

        const siteId = parsed.data.site_id || post.site_id;
        const { data: site } = await auth.supabase.from('sites').select('url, username, app_password_encrypted').eq('id', siteId).single();
        if (!site) throw new Error('Site not found');

        const credentials = Buffer.from(`${site.username}:${site.app_password_encrypted}`).toString('base64');
        const result = await pushToWP(
            site.url, credentials,
            post.title, post.content_html,
            post.meta_title, post.meta_description,
            parsed.data.include_schema ? (post.schema_markup_json || {}) : {},
            parsed.data.categories || [],
            parsed.data.tags || [],
            parsed.data.wp_post_id || post.wp_post_id || undefined
        );

        // Update post with WP ID
        await auth.supabase.from('posts').update({ wp_post_id: result.wp_post_id, updated_at: new Date().toISOString() }).eq('id', postId);

        return { post_id: postId, post_title: post.title, ...result };
    };

    if (action === 'push_draft') {
        const { post_id } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });
        try {
            const result = await pushSingle(post_id);
            return NextResponse.json({ success: true, result });
        } catch (err) {
            return NextResponse.json({ error: err instanceof Error ? err.message : 'Push failed' }, { status: 500 });
        }
    }

    if (action === 'push_batch') {
        const { post_ids } = parsed.data;
        if (!post_ids?.length) return NextResponse.json({ error: 'post_ids required' }, { status: 400 });

        const results = [];
        for (const id of post_ids) {
            try {
                const result = await pushSingle(id);
                results.push({ ...result, success: true });
            } catch (err) {
                results.push({ post_id: id, success: false, error: err instanceof Error ? err.message : 'Failed' });
            }
        }

        const succeeded = results.filter(r => r.success).length;
        return NextResponse.json({ pushed: succeeded, failed: results.length - succeeded, results });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const siteId = new URL(request.url).searchParams.get('site_id');
    let query = auth.supabase.from('posts').select('id, title, status, wp_post_id, overall_score, created_at').eq('user_id', auth.user.id).not('wp_post_id', 'is', null);
    if (siteId) query = query.eq('site_id', siteId);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ posts_in_wp: data || [] });
}
