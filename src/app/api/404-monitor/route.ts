import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const LogSchema = z.object({
    action: z.literal('log'),
    url: z.string().min(1),
    referrer: z.string().optional(),
    user_agent: z.string().optional(),
    site_id: z.string().uuid().optional(),
});

const CreateRedirectSchema = z.object({
    action: z.literal('create_redirect'),
    from_url: z.string().min(1),
    to_url: z.string().min(1),
    site_id: z.string().uuid().optional(),
    redirect_type: z.enum(['301', '302']).default('301'),
});

const ScanSchema = z.object({
    action: z.literal('scan'),
    site_id: z.string().uuid(),
    post_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    const status = url.searchParams.get('status') || 'unresolved';

    let q = supabase.from('broken_pages_404').select('*').eq('user_id', user.id).order('hit_count', { ascending: false });
    if (siteId) q = q.eq('site_id', siteId);
    if (status !== 'all') q = q.eq('status', status);
    const { data: pages } = await q.limit(100);

    const { count: unresolvedCount } = await supabase.from('broken_pages_404').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'unresolved');

    const { data: redirects } = await supabase.from('redirect_rules').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);

    return NextResponse.json({ pages: pages || [], redirects: redirects || [], unresolved_count: unresolvedCount || 0 });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (body.action === 'log') {
        const parsed = LogSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Check if already tracked
        const { data: existing } = await supabase.from('broken_pages_404')
            .select('id, hit_count').eq('user_id', user.id).eq('url', d.url).single();

        if (existing) {
            await supabase.from('broken_pages_404').update({ hit_count: (existing.hit_count || 0) + 1, last_seen: new Date().toISOString() }).eq('id', existing.id);
        } else {
            await supabase.from('broken_pages_404').insert({
                user_id: user.id, site_id: d.site_id || null, url: d.url,
                referrer: d.referrer || null, hit_count: 1, status: 'unresolved',
                first_seen: new Date().toISOString(), last_seen: new Date().toISOString(),
            });
        }
        return NextResponse.json({ logged: true });
    }

    if (body.action === 'create_redirect') {
        const parsed = CreateRedirectSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        await supabase.from('redirect_rules').insert({
            user_id: user.id, site_id: d.site_id || null,
            from_url: d.from_url, to_url: d.to_url, redirect_type: d.redirect_type,
            is_active: true, hit_count: 0,
        });

        // Mark 404 as resolved
        await supabase.from('broken_pages_404').update({ status: 'redirected' }).eq('user_id', user.id).eq('url', d.from_url);

        return NextResponse.json({ created: true });
    }

    if (body.action === 'mark_resolved') {
        await supabase.from('broken_pages_404').update({ status: 'resolved' }).eq('id', body.page_id).eq('user_id', user.id);
        return NextResponse.json({ resolved: true });
    }

    if (body.action === 'scan') {
        const parsed = ScanSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        // Get posts for site, check if slugs exist
        const { data: posts } = await supabase.from('posts')
            .select('id, slug, title').eq('site_id', parsed.data.site_id).limit(100);

        // Check for posts that might have changed slugs (look for orphaned entries in DB)
        const { data: oldLinks } = await supabase.from('internal_link_opportunities')
            .select('to_post_id').eq('site_id', parsed.data.site_id).eq('status', 'injected');

        const postIds = new Set((posts || []).map(p => p.id));
        const orphaned = (oldLinks || []).filter(l => !postIds.has(l.to_post_id));

        return NextResponse.json({ scanned: posts?.length || 0, potential_orphans: orphaned.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
