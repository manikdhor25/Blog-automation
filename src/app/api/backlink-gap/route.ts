import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const FindGapSchema = z.object({
    action: z.literal('find_gap'),
    your_domain: z.string().min(1),
    competitor_domains: z.array(z.string().min(1)).min(2).max(5),
    niche: z.string().optional(),
    link_type_preference: z.enum(['any', 'dofollow', 'editorial', 'resource']).default('any'),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('backlink_gap_results').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
    return NextResponse.json({ results: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'find_gap') {
        const parsed = FindGapSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `You are a link building expert. Find backlink gap opportunities for ${d.your_domain}.

Your domain: ${d.your_domain}
Competitors: ${d.competitor_domains.join(', ')}
Niche: ${d.niche || 'general blog'}
Preference: ${d.link_type_preference} links

Identify 20 real domains that are likely linking to 2+ of the competitor sites but NOT to ${d.your_domain}. These are your highest-priority link prospects.

For each, provide realistic data as if pulling from Ahrefs/Majestic.

Return JSON:
{
  "gap_domains": [
    {
      "domain": "linking-domain.com",
      "da_estimate": number,
      "linking_to_competitors": [string],
      "link_type": "resource_page"|"editorial"|"directory"|"guest_post_opportunity"|"citation",
      "how_they_link": "brief description of how they link to competitors",
      "outreach_angle": "specific angle to pitch them",
      "contact_approach": "how to find and contact",
      "priority_score": number (1-100),
      "why_they_would_link_to_you": string
    }
  ],
  "total_gaps": number,
  "quick_wins": [string],
  "strategy_summary": string
}`;

        const { text, provider } = await routeAI({ task: 'seo_analysis', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        const { data: saved } = await supabase.from('backlink_gap_results').insert({
            user_id: user.id, your_domain: d.your_domain,
            competitor_domains: d.competitor_domains, niche: d.niche || null,
            gap_count: result.total_gaps || result.gap_domains?.length || 0,
            result_data: result,
        }).select().single();

        return NextResponse.json({ result, saved, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
