import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const AddProspectSchema = z.object({
    action: z.literal('add_prospect'),
    domain: z.string().min(1),
    url: z.string().url().optional(),
    contact_name: z.string().optional(),
    contact_email: z.string().email().optional(),
    da_estimate: z.number().int().min(0).max(100).optional(),
    link_type: z.enum(['guest_post', 'resource_page', 'broken_link', 'skyscraper', 'mention', 'niche_edit', 'other']).default('guest_post'),
    campaign_id: z.string().uuid().optional(),
    notes: z.string().optional(),
    site_id: z.string().uuid().optional(),
});

const CreateCampaignSchema = z.object({
    action: z.literal('create_campaign'),
    name: z.string().min(1),
    target_links: z.number().int().min(1).default(20),
    link_type: z.string().default('mixed'),
    niche: z.string().optional(),
    site_id: z.string().uuid().optional(),
});

const UpdateStatusSchema = z.object({
    action: z.literal('update_status'),
    prospect_id: z.string().uuid(),
    status: z.enum(['identified', 'researching', 'outreach_sent', 'followed_up', 'link_live', 'rejected', 'no_response']),
    notes: z.string().optional(),
    link_url: z.string().optional(),
});

const GenerateEmailSchema = z.object({
    action: z.literal('generate_email'),
    domain: z.string().min(1),
    link_type: z.string(),
    your_site: z.string().optional(),
    your_name: z.string().optional(),
    niche: z.string().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaign_id');
    const status = url.searchParams.get('status');

    const { data: campaigns } = await supabase.from('link_campaigns').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

    let prospectsQ = supabase.from('link_prospects').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (campaignId) prospectsQ = prospectsQ.eq('campaign_id', campaignId);
    if (status) prospectsQ = prospectsQ.eq('status', status);
    const { data: prospects } = await prospectsQ;

    const stats = {
        total: prospects?.length || 0,
        live: prospects?.filter(p => p.status === 'link_live').length || 0,
        outreach_sent: prospects?.filter(p => p.status === 'outreach_sent' || p.status === 'followed_up').length || 0,
        conversion_rate: prospects?.length ? ((prospects.filter(p => p.status === 'link_live').length / prospects.length) * 100).toFixed(1) : '0',
    };

    return NextResponse.json({ campaigns: campaigns || [], prospects: prospects || [], stats });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create_campaign') {
        const parsed = CreateCampaignSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;
        const { data } = await supabase.from('link_campaigns').insert({
            user_id: user.id, site_id: d.site_id || null, name: d.name,
            target_links: d.target_links, link_type: d.link_type, niche: d.niche || null,
            links_acquired: 0, status: 'active',
        }).select().single();
        return NextResponse.json({ campaign: data });
    }

    if (body.action === 'add_prospect') {
        const parsed = AddProspectSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;
        const { data } = await supabase.from('link_prospects').insert({
            user_id: user.id, site_id: d.site_id || null, campaign_id: d.campaign_id || null,
            domain: d.domain, url: d.url || null, contact_name: d.contact_name || null,
            contact_email: d.contact_email || null, da_estimate: d.da_estimate || null,
            link_type: d.link_type, notes: d.notes || '', status: 'identified',
        }).select().single();
        return NextResponse.json({ prospect: data });
    }

    if (body.action === 'update_status') {
        const parsed = UpdateStatusSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;
        await supabase.from('link_prospects').update({
            status: d.status, notes: d.notes || undefined,
            link_url: d.link_url || undefined,
            link_acquired_at: d.status === 'link_live' ? new Date().toISOString() : undefined,
        }).eq('id', d.prospect_id).eq('user_id', user.id);

        if (d.status === 'link_live' && body.campaign_id) {
            const { data: camp } = await supabase.from('link_campaigns').select('links_acquired').eq('id', body.campaign_id).single();
            if (camp) await supabase.from('link_campaigns').update({ links_acquired: (camp.links_acquired || 0) + 1 }).eq('id', body.campaign_id);
        }
        return NextResponse.json({ updated: true });
    }

    if (body.action === 'generate_email') {
        const parsed = GenerateEmailSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Write a personalized link building outreach email.

Target domain: ${d.domain}
Link type: ${d.link_type}
Your site: ${d.your_site || 'my blog'}
Your name: ${d.your_name || 'Your Name'}
Niche: ${d.niche || 'general'}

Requirements:
- Short (under 150 words)
- Personalized, not template-sounding
- Clear value proposition
- One specific ask
- Natural, human tone

Return JSON: { "subject": string, "body": string, "follow_up_1": string (1 week later), "follow_up_2": string (2 weeks later) }`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); }
        catch { result = { subject: 'Quick question', body: text }; }
        return NextResponse.json({ email: result, provider });
    }

    if (body.action === 'find_prospects') {
        const { niche, link_type, count = 10 } = body;
        const prompt = `Find ${count} link building prospect domains for a ${niche || 'general'} blog seeking ${link_type || 'guest post'} links.

Return JSON array: [{ "domain": string, "da_estimate": number, "reason": string, "contact_tip": string, "link_type": string }]`;
        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let prospects;
        try { prospects = JSON.parse(text.match(/\[[\s\S]+\]/)?.[0] || '[]'); }
        catch { prospects = []; }
        return NextResponse.json({ prospects, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
