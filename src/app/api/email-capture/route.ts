// ============================================================
// RankMaster Pro - Email Capture & Lead Magnet API
// Opt-in forms, lead magnet generation, list integrations
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const EmailSchema = z.object({
    action: z.enum(['generate_magnet', 'create_form', 'list_forms', 'list_subscribers', 'delete_form', 'export_subscribers', 'sync_provider']),
    keyword: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    post_title: z.string().max(500).optional(),
    post_content_excerpt: z.string().max(2000).optional(),
    magnet_type: z.enum(['checklist', 'cheatsheet', 'guide', 'template', 'swipe_file', 'resource_list']).optional(),
    form_config: z.object({
        title: z.string().max(200),
        description: z.string().max(500).optional(),
        button_text: z.string().max(100).optional(),
        fields: z.array(z.string()).optional(),
        style: z.enum(['inline', 'popup', 'sticky_bar', 'slide_in']).optional(),
        magnet_title: z.string().max(200).optional(),
    }).optional(),
    form_id: z.string().uuid().optional(),
    provider: z.enum(['convertkit', 'mailchimp', 'beehiiv', 'aweber', 'activecampaign']).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = EmailSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate_magnet') {
        const { keyword, niche, post_title, post_content_excerpt, magnet_type = 'checklist' } = parsed.data;
        if (!keyword && !post_title) return NextResponse.json({ error: 'keyword or post_title required' }, { status: 400 });

        const magnetTypes: Record<string, string> = {
            checklist: 'actionable step-by-step checklist',
            cheatsheet: 'quick-reference cheat sheet with key facts',
            guide: 'comprehensive beginner guide',
            template: 'fill-in-the-blank template',
            swipe_file: 'collection of proven examples and scripts',
            resource_list: 'curated list of tools and resources',
        };

        const prompt = `Create a lead magnet (${magnetTypes[magnet_type]}) for "${keyword || post_title}" in the ${niche || 'general'} niche.

Post context: ${(post_content_excerpt || '').substring(0, 500)}

Return ONLY valid JSON:
{
  "title": "compelling lead magnet title (max 60 chars)",
  "subtitle": "benefit-driven subtitle (max 120 chars)",
  "description": "1-2 sentences describing what they get",
  "opt_in_headline": "email opt-in form headline (max 80 chars)",
  "opt_in_subtext": "why they should sign up (max 150 chars)",
  "button_text": "CTA button text (max 30 chars)",
  "content_sections": [
    {
      "title": "section title",
      "items": ["item 1", "item 2", "item 3"]
    }
  ],
  "html_preview": "<div class='lead-magnet'>...</div>",
  "pain_points_addressed": ["pain 1", "pain 2"],
  "target_audience": "who this is for",
  "format": "${magnet_type}"
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'Email marketing expert. Return only JSON.', maxTokens: 2000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            const magnet = JSON.parse(jsonMatch?.[0] || result.content);
            return NextResponse.json({ magnet, provider: result.provider });
        } catch {
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }
    }

    if (action === 'create_form') {
        if (!parsed.data.form_config) return NextResponse.json({ error: 'form_config required' }, { status: 400 });
        const config = parsed.data.form_config;

        const embedCode = generateEmbedCode(config);

        const { data, error } = await auth.supabase
            .from('email_forms')
            .insert({
                user_id: auth.user.id,
                title: config.title,
                description: config.description || '',
                button_text: config.button_text || 'Get Free Access',
                fields: config.fields || ['email'],
                style: config.style || 'inline',
                magnet_title: config.magnet_title || '',
                embed_code: embedCode,
                subscribers: 0,
                is_active: true,
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ form: data });
    }

    if (action === 'delete_form') {
        if (!parsed.data.form_id) return NextResponse.json({ error: 'form_id required' }, { status: 400 });
        await auth.supabase.from('email_forms').delete().eq('id', parsed.data.form_id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'sync_provider') {
        const { provider } = parsed.data;
        if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });

        const { data: settings } = await auth.supabase
            .from('settings')
            .select('key, value')
            .like('key', `${provider}_%`);

        const s = Object.fromEntries((settings || []).map((row: { key: string; value: string }) => [row.key, row.value]));

        // Stub: provider-specific sync
        return NextResponse.json({
            message: `${provider} sync configured. API key: ${s[`${provider}_api_key`] ? 'present' : 'missing'}`,
            provider,
            configured: !!s[`${provider}_api_key`],
        });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'forms';

    if (view === 'forms') {
        const { data, error } = await auth.supabase
            .from('email_forms')
            .select('*')
            .eq('user_id', auth.user.id)
            .order('created_at', { ascending: false });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ forms: data || [] });
    }

    if (view === 'subscribers') {
        const formId = searchParams.get('form_id');
        let query = auth.supabase.from('email_subscribers').select('*').eq('user_id', auth.user.id);
        if (formId) query = query.eq('form_id', formId);
        const { data, error } = await query.order('subscribed_at', { ascending: false }).limit(500);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ subscribers: data || [] });
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
}

function generateEmbedCode(config: { title: string; description?: string; button_text?: string; style?: string }): string {
    return `<div class="rm-optin-form rm-optin-${config.style || 'inline'}" data-rm-form>
  <h3 class="rm-optin-title">${config.title}</h3>
  ${config.description ? `<p class="rm-optin-desc">${config.description}</p>` : ''}
  <form class="rm-optin-fields" onsubmit="rmOptinSubmit(event, this)">
    <input type="email" name="email" placeholder="Your email address" required class="rm-optin-input" />
    <button type="submit" class="rm-optin-btn">${config.button_text || 'Get Free Access'}</button>
  </form>
  <p class="rm-optin-privacy">No spam. Unsubscribe anytime.</p>
</div>
<script>
function rmOptinSubmit(e, form) {
  e.preventDefault();
  const email = form.email.value;
  fetch('/api/email-capture/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, form_id: form.closest('[data-rm-form]').dataset.formId })
  }).then(() => { form.innerHTML = '<p class="rm-optin-success">You\\'re in! Check your email.</p>'; });
}
</script>`;
}
