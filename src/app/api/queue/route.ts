// ============================================================
// RankMaster Pro - Content Queue API Route
// CRUD operations for content queue (replaces localStorage)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/queue - List queue items for current user
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const siteId = searchParams.get('site_id');

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        let query = auth.supabase.from('content_queue').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });

        if (status && status !== 'all') query = query.eq('status', status);
        if (siteId) query = query.eq('site_id', siteId);

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ items: data || [] });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch queue' },
            { status: 500 }
        );
    }
}

// POST /api/queue - Add item to queue
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { data, error } = await auth.supabase
            .from('content_queue')
            .insert({
                user_id: auth.user.id,
                site_id: body.site_id || null,
                title: body.title,
                keyword: body.keyword || null,
                content: body.content || null,
                meta_title: body.meta_title || null,
                meta_description: body.meta_description || null,
                schema_markup: body.schema_markup || null,
                status: body.status || 'draft',
                score: body.score || 0,
                site_name: body.site_name || null,
                scheduled_at: body.scheduled_at || null,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to add to queue' },
            { status: 500 }
        );
    }
}

// PATCH /api/queue - Update queue item
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) return NextResponse.json({ error: 'Item ID required' }, { status: 400 });

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { data, error } = await auth.supabase
            .from('content_queue')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', auth.user.id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update queue item' },
            { status: 500 }
        );
    }
}

// DELETE /api/queue - Delete queue item(s) owned by current user
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const ids = searchParams.get('ids'); // comma-separated for bulk

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        if (ids) {
            const idList = ids.split(',');
            const { error } = await auth.supabase.from('content_queue').delete().in('id', idList).eq('user_id', auth.user.id);
            if (error) throw error;
            return NextResponse.json({ success: true, deleted: idList.length });
        }

        if (!id) return NextResponse.json({ error: 'Item ID required' }, { status: 400 });

        const { error } = await auth.supabase.from('content_queue').delete().eq('id', id).eq('user_id', auth.user.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete queue item' },
            { status: 500 }
        );
    }
}
