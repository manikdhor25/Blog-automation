// ============================================================
// RankMaster Pro - Content Team Manager API
// Assign posts, track deadlines, measure output
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['create_task', 'update_task', 'list_tasks', 'delete_task', 'get_writer_stats', 'create_writer', 'list_writers']),
    id: z.string().uuid().optional(),
    writer_id: z.string().uuid().optional(),
    post_id: z.string().uuid().optional(),
    site_id: z.string().uuid().optional(),
    task_type: z.enum(['write', 'edit', 'optimize', 'research', 'publish']).optional(),
    title: z.string().max(300).optional(),
    keyword: z.string().max(200).optional(),
    deadline: z.string().optional(),
    word_count_target: z.number().int().min(0).optional(),
    status: z.enum(['assigned', 'in_progress', 'review', 'approved', 'published', 'rejected']).optional(),
    feedback: z.string().max(2000).optional(),
    priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
    name: z.string().max(200).optional(),
    email: z.string().email().optional(),
    rate_per_word: z.number().min(0).optional(),
    rate_per_post: z.number().min(0).optional(),
    specialties: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'create_writer') {
        const { name, email, rate_per_word, rate_per_post, specialties } = parsed.data;
        if (!name || !email) return NextResponse.json({ error: 'name and email required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('writers').insert({
            owner_id: auth.user.id,
            name, email,
            rate_per_word: rate_per_word || 0,
            rate_per_post: rate_per_post || 0,
            specialties: specialties || [],
            posts_completed: 0,
            avg_score: 0,
            is_active: true,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ writer: data });
    }

    if (action === 'list_writers') {
        const { data } = await auth.supabase.from('writers').select('*').eq('owner_id', auth.user.id).order('posts_completed', { ascending: false });
        return NextResponse.json({ writers: data || [] });
    }

    if (action === 'create_task') {
        const { writer_id, post_id, site_id, task_type, title, keyword, deadline, word_count_target, priority } = parsed.data;
        if (!task_type || !title) return NextResponse.json({ error: 'task_type and title required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('team_tasks').insert({
            owner_id: auth.user.id,
            writer_id: writer_id || null,
            post_id: post_id || null,
            site_id: site_id || null,
            task_type, title,
            keyword: keyword || '',
            deadline: deadline || null,
            word_count_target: word_count_target || 0,
            priority: priority || 'normal',
            status: 'assigned',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ task: data });
    }

    if (action === 'update_task') {
        const { id, status, feedback, word_count_target } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) updates.status = status;
        if (feedback) updates.feedback = feedback;
        if (word_count_target) updates.word_count_actual = word_count_target;
        if (status === 'published') {
            updates.completed_at = new Date().toISOString();
            // Update writer stats
            const { data: task } = await auth.supabase.from('team_tasks').select('writer_id').eq('id', id).single();
            if (task?.writer_id) {
                const { data: writer } = await auth.supabase.from('writers').select('posts_completed').eq('id', task.writer_id).single();
                if (writer) await auth.supabase.from('writers').update({ posts_completed: (writer.posts_completed || 0) + 1 }).eq('id', task.writer_id);
            }
        }

        await auth.supabase.from('team_tasks').update(updates).eq('id', id).eq('owner_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'get_writer_stats') {
        const { writer_id } = parsed.data;
        if (!writer_id) return NextResponse.json({ error: 'writer_id required' }, { status: 400 });

        const { data: tasks } = await auth.supabase.from('team_tasks').select('*').eq('writer_id', writer_id).eq('owner_id', auth.user.id);
        const completed = (tasks || []).filter(t => t.status === 'published');
        const avgDays = completed.filter(t => t.deadline && t.completed_at).reduce((s, t) => {
            const deadline = new Date(t.deadline);
            const completed = new Date(t.completed_at);
            return s + (completed.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / Math.max(completed.length, 1);

        return NextResponse.json({
            stats: {
                total_assigned: (tasks || []).length,
                completed: completed.length,
                in_progress: (tasks || []).filter(t => t.status === 'in_progress').length,
                overdue: (tasks || []).filter(t => t.deadline && new Date(t.deadline) < new Date() && !['published', 'approved'].includes(t.status)).length,
                avg_days_from_deadline: parseFloat(avgDays.toFixed(1)),
            }
        });
    }

    if (action === 'delete_task') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('team_tasks').delete().eq('id', parsed.data.id).eq('owner_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const writerId = searchParams.get('writer_id');

    let query = auth.supabase.from('team_tasks').select('*, writers(name, email)').eq('owner_id', auth.user.id).order('deadline', { ascending: true, nullsFirst: false });
    if (status && status !== 'all') query = query.eq('status', status);
    if (writerId) query = query.eq('writer_id', writerId);

    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const tasks = data || [];
    const overdue = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && !['published', 'approved'].includes(t.status)).length;

    return NextResponse.json({
        tasks,
        summary: {
            total: tasks.length,
            assigned: tasks.filter(t => t.status === 'assigned').length,
            in_progress: tasks.filter(t => t.status === 'in_progress').length,
            review: tasks.filter(t => t.status === 'review').length,
            published: tasks.filter(t => t.status === 'published').length,
            overdue,
        },
    });
}
