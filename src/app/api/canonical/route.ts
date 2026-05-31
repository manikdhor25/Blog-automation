// ============================================================
// RankMaster Pro - Auto-Canonical Manager API
// Detect syndicated/duplicate content → set/verify canonical URLs
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/utils/safe-url';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['scan', 'set_canonical', 'audit_site', 'fix_all']),
    site_id: z.string().uuid().optional(),
    post_id: z.string().uuid().optional(),
    canonical_url: z.string().url().optional(),
});

async function checkExistingCanonical(url: string): Promise<{ canonical: string | null; matches_self: boolean }> {
    try {
        const res = await safeFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankMaster/1.0)' }, signal: AbortSignal.timeout(8000) });
        const html = await res.text();
        const canonicalMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i);
        const canonical = canonicalMatch?.[1] || null;
        return { canonical, matches_self: canonical ? canonical.startsWith(url.split('?')[0]) : false };
    } catch { return { canonical: null, matches_self: false }; }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'scan') {
        const { post_id, site_id } = parsed.data;

        let postsQuery = auth.supabase.from('posts').select('id, title, slug, site_id, content_html').eq('user_id', auth.user.id).eq('status', 'published');
        if (post_id) postsQuery = postsQuery.eq('id', post_id);
        else if (site_id) postsQuery = postsQuery.eq('site_id', site_id);
        const { data: posts } = await postsQuery.limit(50);

        const results = [];
        for (const post of (posts || []).slice(0, 10)) {
            const { data: site } = await auth.supabase.from('sites').select('url').eq('id', post.site_id).single();
            if (!site) continue;

            const postUrl = `${site.url.replace(/\/$/, '')}/${post.slug}/`;
            const { canonical, matches_self } = await checkExistingCanonical(postUrl);

            // Check if content appears syndicated elsewhere
            const html = post.content_html || '';
            const hasSyndicationIndicator = /originally published|cross-posted|republished from/i.test(html);

            results.push({
                post_id: post.id,
                title: post.title,
                post_url: postUrl,
                existing_canonical: canonical,
                canonical_status: !canonical ? 'missing' : matches_self ? 'correct' : 'pointing_elsewhere',
                has_syndication_indicator: hasSyndicationIndicator,
                needs_attention: !canonical || !matches_self,
            });
        }

        const needsAttention = results.filter(r => r.needs_attention);
        return NextResponse.json({ results, needs_attention: needsAttention.length, total_scanned: results.length });
    }

    if (action === 'set_canonical') {
        const { post_id, canonical_url } = parsed.data;
        if (!post_id || !canonical_url) return NextResponse.json({ error: 'post_id and canonical_url required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('content_html, schema_markup_json').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        // Add canonical to schema or save to meta
        await auth.supabase.from('canonical_settings').upsert({
            user_id: auth.user.id,
            post_id,
            canonical_url,
            set_at: new Date().toISOString(),
        }, { onConflict: 'user_id,post_id' });

        return NextResponse.json({ success: true, canonical_url, note: 'Canonical saved. Add <link rel="canonical" href="' + canonical_url + '"> to your post\'s <head> or configure via your WordPress SEO plugin.' });
    }

    if (action === 'audit_site') {
        const { site_id } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const { data: posts } = await auth.supabase.from('posts').select('id, title, slug').eq('site_id', site_id).eq('user_id', auth.user.id).eq('status', 'published');
        const { data: site } = await auth.supabase.from('sites').select('url').eq('id', site_id).single();

        // Detect near-duplicate slugs
        const slugs = (posts || []).map(p => p.slug.toLowerCase());
        const duplicates = slugs.filter((s, i) => slugs.findIndex(x => x === s) !== i);

        return NextResponse.json({
            total_posts: (posts || []).length,
            duplicate_slugs: duplicates,
            site_url: site?.url,
            recommendation: duplicates.length > 0 ? `${duplicates.length} duplicate slugs detected. Set canonical on the weaker pages.` : 'No duplicate slugs detected.',
        });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data } = await auth.supabase.from('canonical_settings').select('*').eq('user_id', auth.user.id).order('set_at', { ascending: false });
    return NextResponse.json({ canonicals: data || [] });
}
