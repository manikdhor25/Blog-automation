// ============================================================
// RankMaster Pro - SEO Proposal Generator API
// AI-generate client proposals from audit findings
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['generate', 'list', 'delete']),
    client_name: z.string().max(200).optional(),
    client_website: z.string().max(500).optional(),
    client_niche: z.string().max(200).optional(),
    site_id: z.string().uuid().optional(),
    monthly_budget: z.number().min(0).optional(),
    service_types: z.array(z.enum(['content', 'technical_seo', 'link_building', 'local_seo', 'ecommerce_seo', 'full_service'])).optional(),
    agency_name: z.string().max(200).optional(),
    your_name: z.string().max(200).optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const { client_name, client_website, client_niche, site_id, monthly_budget, service_types, agency_name, your_name } = parsed.data;
        if (!client_name) return NextResponse.json({ error: 'client_name required' }, { status: 400 });

        // Pull audit data if site_id provided
        let auditData = '';
        if (site_id) {
            const [postsRes, blRes, kwRes] = await Promise.all([
                auth.supabase.from('posts').select('seo_score, overall_score, decay_alert').eq('site_id', site_id),
                auth.supabase.from('backlinks').select('domain_authority').eq('site_id', site_id),
                auth.supabase.from('keywords').select('status, search_volume').eq('site_id', site_id),
            ]);

            const posts = postsRes.data || [];
            const backlinks = blRes.data || [];
            const keywords = kwRes.data || [];
            const avgSeo = posts.length ? Math.round(posts.reduce((s, p) => s + (p.seo_score || 0), 0) / posts.length) : 0;
            const rankingKws = keywords.filter(k => k.status === 'ranking').length;

            auditData = `
Current audit findings:
- Published posts: ${posts.length}, Avg SEO score: ${avgSeo}/100
- Decay alerts: ${posts.filter(p => p.decay_alert).length} posts need refreshing
- Backlinks: ${backlinks.length}, Avg DA: ${backlinks.length ? Math.round(backlinks.reduce((s, b) => s + (b.domain_authority || 0), 0) / backlinks.length) : 0}
- Keywords ranking: ${rankingKws}/${keywords.length} tracked`;
        }

        const services = service_types?.join(', ') || 'full_service';
        const budget = monthly_budget ? `$${monthly_budget}/month` : 'TBD';

        const prompt = `You are an SEO agency owner. Write a compelling client proposal.

Client: ${client_name}
Website: ${client_website || 'client website'}
Niche: ${client_niche || 'not specified'}
Services: ${services}
Budget range: ${budget}
Agency: ${agency_name || 'Our Agency'}
Prepared by: ${your_name || 'Your Name'}
${auditData}

Return ONLY valid JSON:
{
  "executive_summary": "2-3 compelling paragraphs: what we found, what we'll do, expected results",
  "audit_findings": ["specific finding 1", "finding 2", "finding 3", "finding 4", "finding 5"],
  "proposed_services": [
    {
      "service": "service name",
      "description": "what's included",
      "monthly_deliverables": ["deliverable 1", "deliverable 2"],
      "expected_impact": "specific outcome in 90 days"
    }
  ],
  "pricing_tiers": [
    {
      "tier": "Starter",
      "price_monthly": 1500,
      "includes": ["item 1", "item 2"],
      "best_for": "sites with less than 50 posts"
    },
    {
      "tier": "Growth",
      "price_monthly": 3000,
      "includes": ["item 1", "item 2", "item 3"],
      "best_for": "established sites ready to scale"
    },
    {
      "tier": "Accelerator",
      "price_monthly": 5000,
      "includes": ["item 1", "item 2", "item 3", "item 4"],
      "best_for": "competitive niches needing aggressive growth"
    }
  ],
  "90_day_roadmap": [
    {"week": "Weeks 1-4", "focus": "Technical audit & foundation", "deliverables": ["deliverable 1", "deliverable 2"]},
    {"week": "Weeks 5-8", "focus": "Content & optimization", "deliverables": ["deliverable 1", "deliverable 2"]},
    {"week": "Weeks 9-12", "focus": "Authority building", "deliverables": ["deliverable 1", "deliverable 2"]}
  ],
  "expected_results": {
    "3_months": "specific projection",
    "6_months": "specific projection",
    "12_months": "specific projection"
  },
  "case_studies_placeholder": ["[Insert relevant case study here]"],
  "next_steps": ["Step 1: Schedule kickoff call", "Step 2: Sign agreement", "Step 3: Onboarding"]
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'SEO agency proposal writer. Professional, specific, results-focused. Return only JSON.', maxTokens: 3000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            const proposal = JSON.parse(jsonMatch?.[0] || result.content);

            const { data: saved } = await auth.supabase.from('proposals').insert({
                user_id: auth.user.id,
                client_name, client_website: client_website || '', client_niche: client_niche || '',
                agency_name: agency_name || '', monthly_budget: monthly_budget || 0,
                proposal_data: proposal,
            }).select('id').single();

            return NextResponse.json({ proposal, id: saved?.id, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('proposals').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('proposals').select('id, client_name, client_website, client_niche, monthly_budget, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposals: data || [] });
}
