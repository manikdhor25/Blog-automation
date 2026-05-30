// ============================================================
// RankMaster Pro - Redirect Manager API
// Create/manage 301/302 redirects, push to WordPress
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['create', 'update', 'delete', 'list', 'bulk_create', 'push_to_wp', 'import_csv']),
    id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    from_path: z.string().max(2048).optional(),
    to_url: z.string().max(2048).optional(),
    redirect_type: z.enum(['301', '302', '307', '410']).default('301').optional(),
    notes: z.string().max(500).optional(),
    is_active: z.boolean().optional(),
    redirects: z.array(z.object({ from_path: z.string(), to_url: z.string(), redirect_type: z.string().optional() })).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'create') {
        const { site_id, from_path, to_url, redirect_type, notes } = parsed.data;
        if (!from_path || !to_url) return NextResponse.json({ error: 'from_path and to_url required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('redirects').insert({
            user_id: auth.user.id,
            site_id: site_id || null,
            from_path: from_path.startsWith('/') ? from_path : `/${from_path}`,
            to_url,
            redirect_type: redirect_type || '301',
            notes: notes || '',
            is_active: true,
            hit_count: 0,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ redirect: data });
    }

    if (action === 'bulk_create') {
        const { redirects, site_id } = parsed.data;
        if (!redirects?.length) return NextResponse.json({ error: 'redirects required' }, { status: 400 });

        const rows = redirects.map(r => ({
            user_id: auth.user.id,
            site_id: site_id || null,
            from_path: r.from_path.startsWith('/') ? r.from_path : `/${r.from_path}`,
            to_url: r.to_url,
            redirect_type: r.redirect_type || '301',
            is_active: true,
            hit_count: 0,
        }));

        const { data, error } = await auth.supabase.from('redirects').insert(rows).select();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ created: data?.length || 0 });
    }

    if (action === 'update') {
        const { id, from_path, to_url, redirect_type, notes, is_active } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        await auth.supabase.from('redirects').update({
            from_path: from_path ? (from_path.startsWith('/') ? from_path : `/${from_path}`) : undefined,
            to_url, redirect_type, notes, is_active, updated_at: new Date().toISOString(),
        }).eq('id', id).eq('user_id', auth.user.id);

        return NextResponse.json({ success: true });
    }

    if (action === 'push_to_wp') {
        const { site_id } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const { data: site } = await auth.supabase.from('sites').select('url, username, app_password_encrypted').eq('id', site_id).eq('user_id', auth.user.id).single();
        if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

        const { data: redirects } = await auth.supabase.from('redirects').select('*').eq('site_id', site_id).eq('user_id', auth.user.id).eq('is_active', true);

        // Generate .htaccess or Nginx config
        const htaccess = (redirects || []).map((r: { redirect_type: string; from_path: string; to_url: string }) => {
            const code = r.redirect_type === '302' ? 'R=302' : r.redirect_type === '410' ? 'G' : 'R=301';
            return `Redirect ${code},L ${r.from_path} ${r.to_url}`;
        }).join('\n');

        const nginxConfig = (redirects || []).map((r: { redirect_type: string; from_path: string; to_url: string }) => {
            const code = r.redirect_type === '410' ? '410' : r.redirect_type;
            return `location = ${r.from_path} {\n    return ${code} ${r.to_url};\n}`;
        }).join('\n');

        return NextResponse.json({
            message: `Generated config for ${(redirects || []).length} redirects`,
            htaccess,
            nginx_config: nginxConfig,
            count: (redirects || []).length,
        });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('redirects').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const search = searchParams.get('q');

    let query = auth.supabase.from('redirects').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (siteId) query = query.eq('site_id', siteId);
    if (search) query = query.or(`from_path.ilike.%${search}%,to_url.ilike.%${search}%`);

    const { data, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ redirects: data || [] });
}
