import { NextRequest, NextResponse } from 'next/server';
import { decryptSecret } from '@/lib/crypto';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const FetchSchema = z.object({
    action: z.literal('fetch'),
    site_id: z.string().uuid(),
    status: z.enum(['hold', 'approve', 'spam', 'trash', 'all']).default('hold'),
    per_page: z.number().int().min(1).max(100).default(20),
});

const ModerateSchema = z.object({
    action: z.literal('moderate'),
    site_id: z.string().uuid(),
    comment_id: z.number().int(),
    new_status: z.enum(['approve', 'hold', 'spam', 'trash']),
});

const ReplySchema = z.object({
    action: z.literal('reply'),
    site_id: z.string().uuid(),
    comment_id: z.number().int(),
    post_id: z.number().int(),
    reply_content: z.string().min(1),
});

const GenerateReplySchema = z.object({
    action: z.literal('generate_reply'),
    comment_text: z.string().min(1),
    post_title: z.string().optional(),
    tone: z.enum(['friendly', 'professional', 'helpful']).default('friendly'),
});

async function wpRequest(site: { url: string; username: string; app_password_encrypted: string }, path: string, method = 'GET', body?: unknown) {
    const auth = Buffer.from(`${site.username}:${decryptSecret(site.app_password_encrypted)}`).toString('base64');
    const res = await fetch(`${site.url}/wp-json/wp/v2${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`WP API error: ${res.status}`);
    return res.json();
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'fetch') {
        const parsed = FetchSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: site } = await supabase.from('sites').select('url, username, app_password_encrypted').eq('id', d.site_id).eq('user_id', user.id).single();
        if (!site?.url) return NextResponse.json({ error: 'Site not connected to WordPress' }, { status: 400 });

        const statusParam = d.status === 'all' ? '' : `&status=${d.status}`;
        const comments = await wpRequest(site, `/comments?per_page=${d.per_page}${statusParam}&_embed`);

        return NextResponse.json({ comments, count: comments.length });
    }

    if (body.action === 'moderate') {
        const parsed = ModerateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: site } = await supabase.from('sites').select('url, username, app_password_encrypted').eq('id', d.site_id).eq('user_id', user.id).single();
        if (!site?.url) return NextResponse.json({ error: 'Site not connected' }, { status: 400 });

        await wpRequest(site, `/comments/${d.comment_id}`, 'POST', { status: d.new_status });
        return NextResponse.json({ moderated: true, new_status: d.new_status });
    }

    if (body.action === 'reply') {
        const parsed = ReplySchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: site } = await supabase.from('sites').select('url, username, app_password_encrypted').eq('id', d.site_id).eq('user_id', user.id).single();
        if (!site?.url) return NextResponse.json({ error: 'Site not connected' }, { status: 400 });

        const newComment = await wpRequest(site, '/comments', 'POST', { post: d.post_id, parent: d.comment_id, content: d.reply_content, status: 'approve' });
        return NextResponse.json({ replied: true, comment: newComment });
    }

    if (body.action === 'generate_reply') {
        const parsed = GenerateReplySchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Write a ${d.tone} blog comment reply.

Post title: ${d.post_title || 'blog post'}
Reader comment: "${d.comment_text}"

Write a genuine, helpful reply that:
- Addresses the comment specifically
- Adds value or answers any question
- Encourages engagement
- Is 2-4 sentences max
- Doesn't sound like AI

Return only the reply text, nothing else.`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt });
        return NextResponse.json({ reply: text.trim(), provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
