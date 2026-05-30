import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const KNOWN_UPDATES = [
    { name: 'March 2025 Core Update', date: '2025-03-13', type: 'core', impact: 'high', summary: 'Broad core update. Sites with thin content and poor E-E-A-T impacted. Helpful content emphasis.' },
    { name: 'November 2024 Core Update', date: '2024-11-11', type: 'core', impact: 'high', summary: 'Continued helpful content improvements. Niche sites with strong topical authority rewarded.' },
    { name: 'August 2024 Core Update', date: '2024-08-15', type: 'core', impact: 'very_high', summary: 'Major reversal for sites hit by HCU. Small publishers with genuine expertise recovered.' },
    { name: 'March 2024 Core Update', date: '2024-03-05', type: 'core', impact: 'very_high', summary: 'Largest update in years. Targeted scaled content, site reputation abuse, expired domain abuse.' },
    { name: 'November 2023 Core + Reviews', date: '2023-11-02', type: 'core', impact: 'high', summary: 'Combined core and reviews updates. Affiliate review sites heavily affected.' },
    { name: 'October 2023 Core Update', date: '2023-10-05', type: 'core', impact: 'medium', summary: 'Moderate impact. Continued refinements to helpful content signals.' },
    { name: 'September 2023 Helpful Content', date: '2023-09-14', type: 'hcu', impact: 'high', summary: 'HCU incorporated into core ranking. Sites with AI-generated thin content impacted.' },
];

const LogImpactSchema = z.object({
    action: z.literal('log_impact'),
    update_name: z.string().min(1),
    site_id: z.string().uuid().optional(),
    traffic_change_pct: z.number(),
    affected_pages: z.number().int().min(0).default(0),
    notes: z.string().optional(),
});

const AnalyzeSchema = z.object({
    action: z.literal('analyze'),
    site_id: z.string().uuid(),
    traffic_data: z.array(z.object({ date: z.string(), sessions: z.number() })).optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data: impacts } = await supabase.from('algo_update_impacts')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return NextResponse.json({ updates: KNOWN_UPDATES, impacts: impacts || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'log_impact') {
        const parsed = LogImpactSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const update = KNOWN_UPDATES.find(u => u.name === d.update_name);
        const { data, error } = await supabase.from('algo_update_impacts').insert({
            user_id: user.id, site_id: d.site_id || null,
            update_name: d.update_name, update_date: update?.date || null,
            update_type: update?.type || 'core',
            traffic_change_pct: d.traffic_change_pct,
            affected_pages: d.affected_pages, notes: d.notes || '',
            recovery_status: d.traffic_change_pct >= 0 ? 'positive' : 'impacted',
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ impact: data });
    }

    if (body.action === 'analyze') {
        const parsed = AnalyzeSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { data: impacts } = await supabase.from('algo_update_impacts')
            .select('*').eq('user_id', user.id).eq('site_id', parsed.data.site_id);

        const prompt = `Analyze this site's Google algorithm update history and provide recovery recommendations.

Known impacts:
${(impacts || []).map(i => `- ${i.update_name}: ${i.traffic_change_pct > 0 ? '+' : ''}${i.traffic_change_pct}% traffic`).join('\n') || 'No impacts logged yet'}

${parsed.data.traffic_data ? `Traffic data: ${JSON.stringify(parsed.data.traffic_data.slice(-12))}` : ''}

Provide: pattern analysis, likely causes, specific recovery steps, timeline estimate.
Return JSON: { "pattern": string, "likely_causes": [string], "recovery_steps": [string], "timeline_estimate": string, "risk_level": "low"|"medium"|"high", "positive_signals": [string] }`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let analysis;
        try { analysis = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); } catch { analysis = {}; }
        return NextResponse.json({ analysis, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
