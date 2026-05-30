import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const GenerateSchema = z.object({
    action: z.literal('generate'),
    headline: z.string().min(5),
    company_name: z.string().min(1),
    website: z.string().optional(),
    news_angle: z.string().min(10),
    niche: z.string().optional(),
    contact_name: z.string().optional(),
    contact_email: z.string().optional(),
    distribution_targets: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('press_releases')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return NextResponse.json({ releases: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'generate') {
        const parsed = GenerateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Write a professional press release for link building purposes.

Company: ${d.company_name}
Website: ${d.website || 'not specified'}
Headline: ${d.headline}
News Angle: ${d.news_angle}
Niche: ${d.niche || 'general'}
Contact: ${d.contact_name || 'PR Team'} (${d.contact_email || 'contact@company.com'})

Requirements:
- AP style press release format
- Compelling headline with keyword naturally included
- Dateline, lead paragraph (who/what/when/where/why)
- 3-4 body paragraphs with quotes
- Boilerplate "About" section
- Contact information
- ### END ###
- Optimized for journalist pickup and link building

Return JSON:
{
  "headline": "final optimized headline",
  "subheadline": "supporting subheadline",
  "body": "full press release text",
  "word_count": number,
  "distribution_sites": ["site1", "site2", "site3"],
  "target_journalists": ["journalist type 1", "journalist type 2"],
  "link_building_potential": "high"|"medium"|"low",
  "estimated_pickups": number,
  "outreach_email_template": "email template to pitch journalists"
}`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt, json: true });
        let result;
        try { result = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || text); }
        catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }

        await supabase.from('press_releases').insert({
            user_id: user.id, headline: result.headline || d.headline,
            company_name: d.company_name, news_angle: d.news_angle,
            word_count: result.word_count || 0, status: 'draft', result_data: result,
        });

        return NextResponse.json({ result, provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
