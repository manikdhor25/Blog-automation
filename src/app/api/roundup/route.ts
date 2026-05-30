// ============================================================
// RankMaster Pro - Expert Roundup Manager API
// "We asked 15 experts about X" — highest link-earning format
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['create', 'generate_outreach', 'add_expert', 'submit_quote', 'generate_post', 'list', 'delete']),
    id: z.string().uuid().optional(),
    topic: z.string().max(300).optional(),
    question: z.string().max(500).optional(),
    niche: z.string().max(200).optional(),
    target_experts: z.number().int().min(5).max(30).default(15).optional(),
    expert_id: z.string().uuid().optional(),
    expert_name: z.string().max(200).optional(),
    expert_title: z.string().max(200).optional(),
    expert_website: z.string().max(500).optional(),
    expert_email: z.string().email().optional(),
    expert_twitter: z.string().max(100).optional(),
    quote: z.string().max(2000).optional(),
    your_name: z.string().max(200).optional(),
    your_website: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'create') {
        const { topic, question, niche, target_experts } = parsed.data;
        if (!topic || !question) return NextResponse.json({ error: 'topic and question required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('roundups').insert({
            user_id: auth.user.id,
            topic, question, niche: niche || '',
            target_experts: target_experts || 15,
            experts_contacted: 0,
            quotes_received: 0,
            status: 'collecting',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ roundup: data });
    }

    if (action === 'generate_outreach') {
        const { id, your_name, your_website } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data: roundup } = await auth.supabase.from('roundups').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!roundup) return NextResponse.json({ error: 'Roundup not found' }, { status: 404 });

        const prompt = `Write an expert outreach email for a roundup post.

Topic: "${roundup.topic}"
Question for experts: "${roundup.question}"
Your name: ${your_name || 'Your Name'}
Your website: ${your_website || 'yoursite.com'}

Roundup outreach rules:
1. Email should be under 100 words
2. Make it easy to say yes (low friction, just 2-3 sentences needed)
3. Offer to link to their site
4. Give deadline (7-10 days)
5. Subject line must be specific

Return ONLY valid JSON:
{
  "subject_line": "compelling subject",
  "email_body": "full email (under 100 words)",
  "follow_up_subject": "follow-up subject for 5 days later",
  "follow_up_body": "brief follow-up (30-40 words)",
  "expert_sourcing_tips": ["where to find experts", "LinkedIn search tip", "Twitter approach"]
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'Expert outreach specialist. High response rates. Return only JSON.', maxTokens: 600, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            return NextResponse.json({ outreach: JSON.parse(m?.[0] || result.content), provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'add_expert') {
        const { id, expert_name, expert_title, expert_website, expert_email, expert_twitter } = parsed.data;
        if (!id || !expert_name) return NextResponse.json({ error: 'id and expert_name required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('roundup_experts').insert({
            roundup_id: id,
            user_id: auth.user.id,
            name: expert_name,
            title: expert_title || '',
            website: expert_website || '',
            email: expert_email || '',
            twitter: expert_twitter || '',
            status: 'contacted',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Increment contacted count
        const { data: roundup } = await auth.supabase.from('roundups').select('experts_contacted').eq('id', id).single();
        if (roundup) await auth.supabase.from('roundups').update({ experts_contacted: roundup.experts_contacted + 1 }).eq('id', id);

        return NextResponse.json({ expert: data });
    }

    if (action === 'submit_quote') {
        const { expert_id, quote } = parsed.data;
        if (!expert_id || !quote) return NextResponse.json({ error: 'expert_id and quote required' }, { status: 400 });

        await auth.supabase.from('roundup_experts').update({ quote, status: 'responded' }).eq('id', expert_id).eq('user_id', auth.user.id);

        const { data: expert } = await auth.supabase.from('roundup_experts').select('roundup_id').eq('id', expert_id).single();
        if (expert?.roundup_id) {
            const { data: roundup } = await auth.supabase.from('roundups').select('quotes_received').eq('id', expert.roundup_id).single();
            if (roundup) await auth.supabase.from('roundups').update({ quotes_received: roundup.quotes_received + 1 }).eq('id', expert.roundup_id);
        }

        return NextResponse.json({ success: true });
    }

    if (action === 'generate_post') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const [roundupRes, expertsRes] = await Promise.all([
            auth.supabase.from('roundups').select('*').eq('id', id).single(),
            auth.supabase.from('roundup_experts').select('*').eq('roundup_id', id).eq('status', 'responded'),
        ]);

        const roundup = roundupRes.data;
        const experts = expertsRes.data || [];

        if (experts.length === 0) return NextResponse.json({ error: 'No expert quotes yet' }, { status: 400 });

        const quotesList = experts.map((e: { name: string; title: string; website: string; quote: string }) =>
            `**${e.name}**, ${e.title} (${e.website}):\n"${e.quote}"`
        ).join('\n\n');

        const prompt = `Write a complete roundup blog post.

Topic: "${roundup.topic}"
Question asked: "${roundup.question}"
Expert quotes:
${quotesList}

Write a complete SEO-optimized post. Include:
- Engaging intro (why this topic matters, how many experts)
- Each expert quote with proper attribution and link to their site
- Brief commentary after each quote connecting it to the next
- Conclusion summarizing key themes
- CTA for experts to share

Return ONLY valid JSON:
{
  "title": "We Asked [N] Experts: [Question] — Here's What They Said",
  "meta_title": "SEO title",
  "meta_description": "meta description",
  "intro": "compelling introduction (200-300 words)",
  "content_sections": [
    {
      "expert_name": "name",
      "expert_link": "website",
      "quote": "their quote",
      "commentary": "your 1-2 sentence commentary"
    }
  ],
  "conclusion": "conclusion (200 words)",
  "share_cta": "message to send to experts asking them to share"
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'Roundup post writer. Authority-building format. Return only JSON.', maxTokens: 3000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            const post = JSON.parse(m?.[0] || result.content);
            await auth.supabase.from('roundups').update({ status: 'complete', generated_post: post }).eq('id', id);
            return NextResponse.json({ post, experts_quoted: experts.length, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('roundups').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
        const [roundupRes, expertsRes] = await Promise.all([
            auth.supabase.from('roundups').select('*').eq('id', id).eq('user_id', auth.user.id).single(),
            auth.supabase.from('roundup_experts').select('*').eq('roundup_id', id),
        ]);
        return NextResponse.json({ roundup: roundupRes.data, experts: expertsRes.data || [] });
    }

    const { data, error } = await auth.supabase.from('roundups').select('id, topic, question, target_experts, experts_contacted, quotes_received, status, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ roundups: data || [] });
}
