import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ScoutSchema = z.object({
    action: z.literal('scout'),
    niche: z.string().min(1),
    budget_min: z.number().min(0).default(0),
    budget_max: z.number().min(0).default(50000),
    min_monthly_revenue: z.number().min(0).default(0),
    monetization: z.array(z.string()).default([]),
    age_months_min: z.number().min(0).default(0),
    criteria_notes: z.string().optional(),
});

const SaveSchema = z.object({
    action: z.literal('save'),
    site: z.object({
        name: z.string(),
        url: z.string().optional(),
        niche: z.string(),
        asking_price: z.number(),
        monthly_revenue: z.number(),
        monthly_traffic: z.number(),
        da: z.number().optional(),
        age_months: z.number().optional(),
        monetization: z.array(z.string()),
        acquisition_score: z.number(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        due_diligence_checklist: z.array(z.string()),
        source: z.string().optional(),
    }),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data, error } = await supabase.from('acquisition_prospects')
        .select('*').eq('user_id', user.id).order('acquisition_score', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prospects: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'scout') {
        const parsed = ScoutSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `You are a niche site acquisition expert. Generate 8 realistic niche site acquisition opportunities for a buyer with these criteria:

Niche: ${d.niche}
Budget: $${d.budget_min.toLocaleString()} - $${d.budget_max.toLocaleString()}
Min Monthly Revenue: $${d.min_monthly_revenue}
Preferred Monetization: ${d.monetization.join(', ') || 'any'}
Min Site Age: ${d.age_months_min} months
Additional notes: ${d.criteria_notes || 'none'}

For each site, generate realistic data as if sourcing from Flippa, Motion Invest, Empire Flippers, or direct outreach. Include mix of difficulty levels.

Return JSON array of sites, each with:
{
  "name": "Site display name",
  "url": "example-domain.com",
  "niche": "specific niche",
  "asking_price": number,
  "monthly_revenue": number,
  "monthly_traffic": number,
  "da": number (domain authority),
  "age_months": number,
  "monetization": ["adsense", "affiliate", "sponsored"],
  "acquisition_score": number (1-100, higher = better buy),
  "multiple": number (price/annual revenue ratio),
  "pros": ["pro1", "pro2", "pro3"],
  "cons": ["con1", "con2"],
  "due_diligence_checklist": ["check1", "check2", "check3", "check4"],
  "source": "Flippa|Empire Flippers|Motion Invest|Direct",
  "growth_potential": "high|medium|low",
  "risk_level": "low|medium|high",
  "key_opportunity": "one sentence why this is a good buy"
}`;

        const { text, provider } = await routeAI({ task: 'data_analysis', prompt, json: true });
        let sites;
        try { sites = JSON.parse(text.match(/\[[\s\S]+\]/)?.[0] || '[]'); } catch { sites = []; }

        return NextResponse.json({ sites, provider });
    }

    if (body.action === 'save') {
        const parsed = SaveSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const s = parsed.data.site;

        const { data, error } = await supabase.from('acquisition_prospects').insert({
            user_id: user.id,
            name: s.name,
            url: s.url || null,
            niche: s.niche,
            asking_price: s.asking_price,
            monthly_revenue: s.monthly_revenue,
            monthly_traffic: s.monthly_traffic,
            da: s.da || null,
            age_months: s.age_months || null,
            monetization: s.monetization,
            acquisition_score: s.acquisition_score,
            pros: s.pros,
            cons: s.cons,
            due_diligence_checklist: s.due_diligence_checklist,
            source: s.source || null,
            status: 'watching',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ prospect: data });
    }

    if (body.action === 'update_status') {
        const { prospect_id, status, notes } = body;
        const { error } = await supabase.from('acquisition_prospects').update({ status, notes: notes || null }).eq('id', prospect_id).eq('user_id', user.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ updated: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
