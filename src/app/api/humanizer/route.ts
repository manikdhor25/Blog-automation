// ============================================================
// RankMaster Pro - Content Humanizer API
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { humanizeContent } from '@/lib/engines/humanizer';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['humanize', 'humanize_post', 'apply', 'list']),
    text: z.string().min(100).max(20000).optional(),
    post_id: z.string().uuid().optional(),
    section: z.enum(['full', 'intro', 'conclusion', 'custom']).default('full').optional(),
    apply_to_post: z.boolean().default(false).optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'humanize') {
        const { text, post_id, apply_to_post } = parsed.data;
        if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

        const result = await humanizeContent(text);
        if (!result) return NextResponse.json({ error: 'Humanization failed' }, { status: 500 });

        // Save result
        const { data: saved } = await auth.supabase.from('humanizer_results').insert({
            user_id: auth.user.id,
            post_id: post_id || null,
            original_word_count: text.split(/\s+/).length,
            humanized_word_count: result.humanized_text.split(/\s+/).length,
            ai_score_before: result.ai_score_before,
            ai_score_after: result.ai_score_after,
            changes_count: result.changes_made.length,
            techniques_applied: result.techniques_applied,
        }).select('id').single();

        // Auto-apply if requested
        if (apply_to_post && post_id) {
            const { data: post } = await auth.supabase.from('posts').select('content_html, content_markdown').eq('id', post_id).single();
            if (post) {
                await auth.supabase.from('posts').update({
                    content_markdown: result.humanized_text,
                    content_html: post.content_html?.replace(text.substring(0, 200), result.humanized_text.substring(0, 200)) || result.humanized_text,
                    updated_at: new Date().toISOString(),
                }).eq('id', post_id);
            }
        }

        return NextResponse.json({ result, id: saved?.id });
    }

    if (action === 'humanize_post') {
        const { post_id, section = 'full' } = parsed.data;
        if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

        const { data: post } = await auth.supabase.from('posts').select('title, content_markdown, content_html').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        let text = post.content_markdown || post.content_html?.replace(/<[^>]+>/g, ' ') || '';

        if (section === 'intro') text = text.split('\n\n').slice(0, 3).join('\n\n');
        else if (section === 'conclusion') text = text.split('\n\n').slice(-3).join('\n\n');

        const result = await humanizeContent(text);
        if (!result) return NextResponse.json({ error: 'Humanization failed' }, { status: 500 });

        return NextResponse.json({ result, post_title: post.title });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('humanizer_results').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: data || [] });
}
