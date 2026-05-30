// ============================================================
// RankMaster Pro - Cloaked Link Manager API
// CRUD for /go/[slug] affiliate link cloaking
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const CreateSchema = z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
    destination_url: z.string().url(),
    label: z.string().max(200).optional(),
    program_id: z.string().uuid().optional(),
    post_id: z.string().uuid().optional(),
    redirect_type: z.enum(['permanent', 'temporary']).default('permanent'),
    nofollow: z.boolean().default(true),
    sponsored: z.boolean().default(true),
    geo_rules: z.record(z.string(), z.string()).optional(),
    notes: z.string().max(1000).optional(),
});

const UpdateSchema = CreateSchema.partial().extend({ id: z.string().uuid() });

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'links';

    if (view === 'clicks') {
        const linkId = searchParams.get('link_id');
        if (!linkId) return NextResponse.json({ error: 'link_id required' }, { status: 400 });

        // Verify the link belongs to the caller before returning its clicks.
        // Defense in depth alongside the RLS policy (migration 020).
        const { data: ownLink } = await auth.supabase
            .from('cloaked_links')
            .select('id')
            .eq('id', linkId)
            .eq('user_id', auth.user.id)
            .single();
        if (!ownLink) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

        const { data, error } = await auth.supabase
            .from('cloaked_link_clicks')
            .select('country, referrer, clicked_at')
            .eq('link_id', linkId)
            .order('clicked_at', { ascending: false })
            .limit(500);
        if (error) throw error;
        return NextResponse.json({ clicks: data || [] });
    }

    const { data, error } = await auth.supabase
        .from('cloaked_links')
        .select('*, affiliate_programs(name, network)')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ links: data || [] });
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    // Check slug uniqueness
    const { data: existing } = await auth.supabase
        .from('cloaked_links')
        .select('id')
        .eq('slug', parsed.data.slug)
        .single();
    if (existing) return NextResponse.json({ error: `Slug "${parsed.data.slug}" already taken` }, { status: 409 });

    const { data, error } = await auth.supabase
        .from('cloaked_links')
        .insert({ ...parsed.data, user_id: auth.user.id, clicks: 0, is_active: true })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ link: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { id, ...updates } = parsed.data;
    const { data, error } = await auth.supabase
        .from('cloaked_links')
        .update(updates)
        .eq('id', id)
        .eq('user_id', auth.user.id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ link: data });
}

export async function DELETE(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await auth.supabase
        .from('cloaked_links')
        .delete()
        .eq('id', id)
        .eq('user_id', auth.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
