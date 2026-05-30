// ============================================================
// RankMaster Pro - Email Drip Sequence Builder API
// AI-generate multi-email nurture sequences with affiliate CTAs
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['generate', 'list', 'delete', 'export']),
    sequence_name: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    lead_magnet_topic: z.string().max(300).optional(),
    affiliate_product: z.string().max(300).optional(),
    affiliate_url: z.string().url().optional(),
    email_count: z.number().int().min(3).max(10).default(5).optional(),
    goal: z.enum(['affiliate_sale', 'product_launch', 'course_promo', 'service_upsell', 'nurture']).optional(),
    sender_name: z.string().max(100).optional(),
    id: z.string().uuid().optional(),
});

interface DripEmail {
    day: number;
    subject: string;
    preview_text: string;
    body: string;
    cta_text: string;
    cta_url_placeholder: string;
    type: 'value' | 'story' | 'case_study' | 'objection' | 'sale' | 'urgency';
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const { sequence_name, niche, lead_magnet_topic, affiliate_product, affiliate_url, email_count = 5, goal, sender_name } = parsed.data;
        if (!niche) return NextResponse.json({ error: 'niche required' }, { status: 400 });

        const goalDescriptions: Record<string, string> = {
            affiliate_sale: `Gradually build trust and promote "${affiliate_product}" as the solution. Final email has strongest CTA.`,
            product_launch: 'Create anticipation, share behind-the-scenes, drive to launch day purchase.',
            course_promo: 'Educate on the problem, position course as the solution, overcome objections.',
            service_upsell: 'Demonstrate expertise through value, then pitch your service naturally.',
            nurture: 'Pure value sequence to build long-term relationship. Soft CTAs only.',
        };

        const prompt = `You are an email marketing expert specializing in affiliate marketing and content creators. Write a high-converting ${email_count}-email drip sequence.

Niche: ${niche}
Lead magnet topic: ${lead_magnet_topic || niche}
Goal: ${goal || 'affiliate_sale'} — ${goalDescriptions[goal || 'affiliate_sale']}
Affiliate product: ${affiliate_product || 'product'}
Sender name: ${sender_name || 'Your Name'}

Email sequence structure (for ${email_count} emails):
- Email 1 (Day 0): Welcome + deliver lead magnet + set expectations
- Email 2 (Day 2): Pure value, no sell
- Email 3 (Day 4): Story/case study
- Email 4 (Day 6): Objection handling + soft pitch
${email_count >= 5 ? '- Email 5 (Day 8): Strong CTA + proof' : ''}
${email_count >= 6 ? '- Email 6 (Day 10): Urgency/scarcity' : ''}
${email_count >= 7 ? '- Email 7 (Day 14): Last chance' : ''}

Write emails that feel personal, not corporate. Subject lines must get opens. No spam trigger words.

Return ONLY valid JSON:
{
  "sequence_name": "${sequence_name || niche + ' sequence'}",
  "emails": [
    {
      "day": 0,
      "subject": "compelling subject line",
      "preview_text": "preview text (40-50 chars)",
      "body": "full email body (150-300 words, conversational, single idea per email, one clear CTA)",
      "cta_text": "button text",
      "cta_url_placeholder": "{{AFFILIATE_LINK}} or {{WEBSITE_LINK}}",
      "type": "value"
    }
  ],
  "sequence_stats": {
    "avg_word_count": 200,
    "total_days": 10,
    "cta_emails": 2
  }
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'Email marketing expert. High open rates, natural voice, compliance-friendly. Return only JSON.', maxTokens: 4000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            const sequence = JSON.parse(jsonMatch?.[0] || result.content);

            const { data: saved } = await auth.supabase.from('drip_sequences').insert({
                user_id: auth.user.id,
                sequence_name: sequence.sequence_name || sequence_name || niche,
                niche, lead_magnet_topic: lead_magnet_topic || '',
                affiliate_product: affiliate_product || '',
                affiliate_url: affiliate_url || '',
                goal: goal || 'affiliate_sale',
                email_count: sequence.emails?.length || email_count,
                sequence_data: sequence,
            }).select('id').single();

            return NextResponse.json({ sequence, id: saved?.id, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'export') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data } = await auth.supabase.from('drip_sequences').select('sequence_data, sequence_name').eq('id', id).eq('user_id', auth.user.id).single();
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const emails: DripEmail[] = data.sequence_data?.emails || [];
        // Generate plain-text export
        const exported = emails.map(e =>
            `=== EMAIL ${e.day === 0 ? 1 : e.day} (Day ${e.day}) — ${e.type.toUpperCase()} ===\nSubject: ${e.subject}\nPreview: ${e.preview_text}\n\n${e.body}\n\nCTA: ${e.cta_text} → ${e.cta_url_placeholder}\n`
        ).join('\n---\n\n');

        return NextResponse.json({ exported, sequence_name: data.sequence_name, email_count: emails.length });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('drip_sequences').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('drip_sequences').select('id, sequence_name, niche, email_count, goal, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sequences: data || [] });
}
