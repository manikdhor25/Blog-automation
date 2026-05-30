import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const CreateSchema = z.object({
    action: z.literal('create'),
    type: z.enum(['rank_change', 'decay_alert', 'commission', 'broken_link', 'milestone', 'system', 'competitor', 'keyword_alert']),
    title: z.string().min(1),
    message: z.string().min(1),
    link: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    metadata: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get('unread') === '1';

    let query = supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (unreadOnly) query = query.eq('is_read', false);

    const { data } = await query;
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);

    return NextResponse.json({ notifications: data || [], unread_count: count || 0 });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create') {
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data, error } = await supabase.from('notifications').insert({
            user_id: user.id, type: d.type, title: d.title, message: d.message,
            link: d.link || null, priority: d.priority, is_read: false, metadata: d.metadata || {},
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ notification: data });
    }

    if (body.action === 'mark_read') {
        if (body.notification_id) {
            await supabase.from('notifications').update({ is_read: true }).eq('id', body.notification_id).eq('user_id', user.id);
        } else if (body.all) {
            await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
        }
        return NextResponse.json({ updated: true });
    }

    if (body.action === 'delete') {
        if (body.notification_id) {
            await supabase.from('notifications').delete().eq('id', body.notification_id).eq('user_id', user.id);
        } else if (body.delete_read) {
            await supabase.from('notifications').delete().eq('user_id', user.id).eq('is_read', true);
        }
        return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
