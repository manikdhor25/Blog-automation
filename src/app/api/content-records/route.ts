// ============================================================
// RankMaster Pro - Content Records API
// GET: List with filters/pagination, DELETE: Remove records
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
        const siteId = url.searchParams.get('site_id');
        const status = url.searchParams.get('status');
        const keyword = url.searchParams.get('keyword');
        const contentType = url.searchParams.get('content_type');
        const sortBy = url.searchParams.get('sort') || 'created_at';
        const sortDir = url.searchParams.get('dir') === 'asc' ? true : false;
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');

        const offset = (page - 1) * limit;

        // Build query
        let query = auth.supabase
            .from('content_records')
            .select('*', { count: 'exact' })
            .eq('user_id', auth.user.id)
            .order(sortBy, { ascending: sortDir })
            .range(offset, offset + limit - 1);

        if (siteId) query = query.eq('site_id', siteId);
        if (status) query = query.eq('publish_status', status);
        if (contentType) query = query.eq('content_type', contentType);
        if (keyword) query = query.ilike('keyword', `%${keyword}%`);
        if (from) query = query.gte('created_at', from);
        if (to) query = query.lte('created_at', to);

        const { data, count, error } = await query;
        if (error) throw error;

        // Aggregate stats
        const { data: statsData } = await auth.supabase
            .from('content_records')
            .select('overall_score, word_count_actual, generation_duration_ms')
            .eq('user_id', auth.user.id);

        const stats = {
            total: count || 0,
            avgScore: 0,
            totalWords: 0,
            avgDuration: 0,
        };

        if (statsData && statsData.length > 0) {
            stats.avgScore = Math.round(statsData.reduce((s, r) => s + (r.overall_score || 0), 0) / statsData.length);
            stats.totalWords = statsData.reduce((s, r) => s + (r.word_count_actual || 0), 0);
            stats.avgDuration = Math.round(statsData.reduce((s, r) => s + (r.generation_duration_ms || 0), 0) / statsData.length);
        }

        return NextResponse.json({
            records: data || [],
            stats,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit),
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch content records' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const url = new URL(request.url);
        const ids = url.searchParams.get('ids');

        if (!ids) {
            return NextResponse.json({ error: 'ids parameter is required' }, { status: 400 });
        }

        const idList = ids.split(',').filter(Boolean);

        const { error } = await auth.supabase
            .from('content_records')
            .delete()
            .in('id', idList)
            .eq('user_id', auth.user.id);

        if (error) throw error;

        return NextResponse.json({ success: true, deleted: idList.length });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete records' },
            { status: 500 }
        );
    }
}
