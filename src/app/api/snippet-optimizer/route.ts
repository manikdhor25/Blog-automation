// ============================================================
// RankMaster Pro - Featured Snippet Optimizer API
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { optimizeForSnippet } from '@/lib/engines/snippet-optimizer';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['optimize', 'bulk_optimize', 'list', 'delete']),
    keyword: z.string().max(200).optional(),
    keywords: z.array(z.string()).max(20).optional(),
    post_id: z.string().uuid().optional(),
    current_content: z.string().max(10000).optional(),
    snippet_type: z.enum(['paragraph', 'numbered_list', 'bulleted_list', 'table', 'definition', 'how_to', 'none']).optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'optimize') {
        const { keyword, post_id, current_content, snippet_type } = parsed.data;
        if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 });

        let content = current_content || '';
        if (post_id && !content) {
            const { data: post } = await auth.supabase.from('posts').select('content_markdown, content_html').eq('id', post_id).single();
            content = post?.content_markdown || post?.content_html?.replace(/<[^>]+>/g, ' ') || '';
        }

        const result = await optimizeForSnippet(keyword, content, snippet_type);
        if (!result) return NextResponse.json({ error: 'Optimization failed' }, { status: 500 });

        // Save to DB
        const { data: saved } = await auth.supabase.from('snippet_optimizations').insert({
            user_id: auth.user.id,
            post_id: post_id || null,
            keyword,
            snippet_type: result.detected_type,
            confidence: result.confidence,
            optimized_content: result.optimized_content,
            html: result.html,
            word_count: result.word_count,
            reasoning: result.reasoning,
        }).select('id').single();

        return NextResponse.json({ optimization: result, id: saved?.id });
    }

    if (action === 'bulk_optimize') {
        const { keywords, post_id } = parsed.data;
        if (!keywords?.length) return NextResponse.json({ error: 'keywords required' }, { status: 400 });

        let content = '';
        if (post_id) {
            const { data: post } = await auth.supabase.from('posts').select('content_markdown, content_html').eq('id', post_id).single();
            content = post?.content_markdown || post?.content_html?.replace(/<[^>]+>/g, ' ') || '';
        }

        const results = [];
        for (const kw of keywords.slice(0, 10)) {
            const r = await optimizeForSnippet(kw, content);
            if (r) results.push(r);
        }

        return NextResponse.json({ optimizations: results, count: results.length });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('snippet_optimizations').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const postId = new URL(request.url).searchParams.get('post_id');
    let query = auth.supabase.from('snippet_optimizations').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (postId) query = query.eq('post_id', postId);
    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ optimizations: data || [] });
}
