// ============================================================
// RankMaster Pro - Guest Post Outreach CRM API
// Track prospects, emails, responses, link placements
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const OutreachSchema = z.object({
    action: z.enum(['create_prospect', 'update_status', 'generate_email', 'log_response', 'list', 'delete', 'stats']),
    id: z.string().uuid().optional(),
    domain: z.string().max(253).optional(),
    contact_name: z.string().max(200).optional(),
    contact_email: z.string().email().optional(),
    domain_authority: z.number().min(0).max(100).optional(),
    niche: z.string().max(200).optional(),
    target_keyword: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    status: z.enum(['prospect', 'contacted', 'replied', 'negotiating', 'placed', 'rejected', 'ghosted']).optional(),
    pitch_angle: z.string().max(500).optional(),
    your_site_url: z.string().max(500).optional(),
    your_name: z.string().max(200).optional(),
    response_notes: z.string().max(2000).optional(),
    placed_url: z.string().max(2048).optional(),
    placed_anchor: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = OutreachSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'create_prospect') {
        if (!parsed.data.domain) return NextResponse.json({ error: 'domain required' }, { status: 400 });
        const { data, error } = await auth.supabase
            .from('outreach_prospects')
            .insert({
                user_id: auth.user.id,
                domain: parsed.data.domain,
                contact_name: parsed.data.contact_name || null,
                contact_email: parsed.data.contact_email || null,
                domain_authority: parsed.data.domain_authority || null,
                niche: parsed.data.niche || null,
                target_keyword: parsed.data.target_keyword || null,
                notes: parsed.data.notes || null,
                status: 'prospect',
                created_at: new Date().toISOString(),
            })
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ prospect: data }, { status: 201 });
    }

    if (action === 'update_status') {
        if (!parsed.data.id || !parsed.data.status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

        const updates: Record<string, unknown> = {
            status: parsed.data.status,
            updated_at: new Date().toISOString(),
        };

        if (parsed.data.status === 'placed') {
            updates.placed_url = parsed.data.placed_url || null;
            updates.placed_anchor = parsed.data.placed_anchor || null;
            updates.placed_at = new Date().toISOString();
        }

        if (parsed.data.response_notes) updates.response_notes = parsed.data.response_notes;
        if (parsed.data.contact_email) updates.contact_email = parsed.data.contact_email;
        if (parsed.data.contact_name) updates.contact_name = parsed.data.contact_name;

        await auth.supabase.from('outreach_prospects').update(updates).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'generate_email') {
        const { domain, contact_name, niche, target_keyword, pitch_angle, your_name, your_site_url } = parsed.data;
        if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400 });

        const prompt = `Write a personalized guest post outreach email for a ${niche || 'content'} blog.

Target site: ${domain}
Contact: ${contact_name || 'Site Editor'}
Keyword/topic: ${target_keyword || niche || 'not specified'}
My site: ${your_site_url || 'my website'}
My name: ${your_name || 'Your Name'}
Pitch angle: ${pitch_angle || 'relevant guest post offer'}

Return ONLY valid JSON:
{
  "subject": "compelling email subject line",
  "body": "full email body (plain text, no HTML, 150-200 words max, conversational, no fluff, genuine value proposition)",
  "follow_up_subject": "follow-up subject for 5 days later",
  "follow_up_body": "short follow-up email (50-80 words)",
  "personalization_notes": "what to customize before sending"
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'Outreach expert. Write genuine, non-spammy emails. Return only JSON.', maxTokens: 1000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            const email = JSON.parse(jsonMatch?.[0] || result.content);
            return NextResponse.json({ email, provider: result.provider });
        } catch {
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('outreach_prospects').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'stats') {
        const { data: prospects } = await auth.supabase
            .from('outreach_prospects')
            .select('status')
            .eq('user_id', auth.user.id);

        const counts: Record<string, number> = {};
        for (const p of prospects || []) {
            counts[p.status] = (counts[p.status] || 0) + 1;
        }

        const placed = counts['placed'] || 0;
        const contacted = Object.values(counts).reduce((a, b) => a + b, 0) - (counts['prospect'] || 0);
        const replyRate = contacted > 0 ? Math.round(((counts['replied'] || 0) + (counts['negotiating'] || 0) + placed) / contacted * 100) : 0;
        const placementRate = contacted > 0 ? Math.round(placed / contacted * 100) : 0;

        return NextResponse.json({ stats: { ...counts, total: (prospects || []).length, reply_rate: replyRate, placement_rate: placementRate } });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('q');

    let query = auth.supabase
        .from('outreach_prospects')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false });

    if (status && status !== 'all') query = query.eq('status', status);
    if (search) query = query.ilike('domain', `%${search}%`);

    const { data, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prospects: data || [] });
}
