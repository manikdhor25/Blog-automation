import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const BulkMetaSchema = z.object({
    action: z.literal('bulk_meta'),
    site_id: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
});

const BulkPublishSchema = z.object({
    action: z.literal('bulk_publish'),
    post_ids: z.array(z.string().uuid()).min(1).max(20),
    status: z.enum(['draft', 'publish', 'pending']).default('draft'),
});

const BulkTagSchema = z.object({
    action: z.literal('bulk_tag'),
    post_ids: z.array(z.string().uuid()).min(1),
    tags: z.array(z.string()).min(1),
    operation: z.enum(['add', 'remove', 'replace']).default('add'),
});

const BulkStatusSchema = z.object({
    action: z.literal('bulk_status'),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('bulk_op_logs')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ logs: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'bulk_meta') {
        const parsed = BulkMetaSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { data: posts } = await supabase.from('posts')
            .select('id, title, content, primary_keyword').eq('site_id', parsed.data.site_id)
            .or('meta_description.is.null,meta_description.eq.""').limit(parsed.data.limit);

        if (!posts?.length) return NextResponse.json({ message: 'All posts have meta descriptions', updated: 0 });

        let updated = 0;
        const results = [];
        for (const post of posts.slice(0, 10)) {
            const prompt = `Write a compelling SEO meta description for this post. Max 155 chars. Include the focus keyword naturally. Start with an action verb.
Title: ${post.title}
Keyword: ${post.primary_keyword || 'unknown'}
Return ONLY the meta description text, no quotes.`;
            const { text } = await routeAI({ task: 'content_optimization', prompt });
            const meta = text.trim().substring(0, 155);
            await supabase.from('posts').update({ meta_description: meta }).eq('id', post.id);
            results.push({ id: post.id, title: post.title, meta_description: meta });
            updated++;
        }

        await supabase.from('bulk_op_logs').insert({
            user_id: user.id, operation: 'bulk_meta', items_processed: updated,
            items_succeeded: updated, details: { results },
        });

        return NextResponse.json({ updated, results });
    }

    if (body.action === 'bulk_publish') {
        const parsed = BulkPublishSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { count, error } = await supabase.from('posts')
            .update({ status: parsed.data.status, published_at: parsed.data.status === 'publish' ? new Date().toISOString() : null })
            .in('id', parsed.data.post_ids).eq('user_id', user.id);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await supabase.from('bulk_op_logs').insert({
            user_id: user.id, operation: 'bulk_publish', items_processed: parsed.data.post_ids.length,
            items_succeeded: count || 0, details: { status: parsed.data.status },
        });

        return NextResponse.json({ updated: count || 0, status: parsed.data.status });
    }

    if (body.action === 'bulk_tag') {
        const parsed = BulkTagSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        let updated = 0;
        for (const postId of d.post_ids) {
            const { data: post } = await supabase.from('posts').select('tags').eq('id', postId).eq('user_id', user.id).single();
            if (!post) continue;

            let newTags: string[] = post.tags || [];
            if (d.operation === 'add') newTags = [...new Set([...newTags, ...d.tags])];
            else if (d.operation === 'remove') newTags = newTags.filter((t: string) => !d.tags.includes(t));
            else newTags = d.tags;

            await supabase.from('posts').update({ tags: newTags }).eq('id', postId);
            updated++;
        }

        return NextResponse.json({ updated });
    }

    if (body.action === 'bulk_delete') {
        const { post_ids } = body;
        if (!Array.isArray(post_ids) || !post_ids.length) return NextResponse.json({ error: 'post_ids required' }, { status: 400 });
        const { count } = await supabase.from('posts').delete().in('id', post_ids).eq('user_id', user.id);
        return NextResponse.json({ deleted: count || 0 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
