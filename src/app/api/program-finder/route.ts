// ============================================================
// RankMaster Pro - Affiliate Program Finder API
// Discover high-commission programs for your niche
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['find', 'save', 'dismiss', 'list', 'compare']),
    niche: z.string().max(200).optional(),
    keywords: z.array(z.string()).max(10).optional(),
    min_commission: z.number().min(0).default(0).optional(),
    networks: z.array(z.string()).max(10).optional(),
    id: z.string().uuid().optional(),
});

// Known high-performing programs by niche (curated database)
const PROGRAM_DATABASE: Record<string, Array<{
    name: string; network: string; commission: string; cookie: number;
    epc: string; category: string; apply_url: string; notes: string;
}>> = {
    finance: [
        { name: 'Robinhood', network: 'Direct', commission: '$20/signup', cookie: 30, epc: '$8.20', category: 'investing', apply_url: 'https://robinhood.com/affiliates', notes: 'High EPC, popular brand' },
        { name: 'Personal Capital', network: 'CJ', commission: '$100/signup', cookie: 45, epc: '$35', category: 'wealth management', apply_url: 'https://www.cj.com', notes: 'Very high payout' },
        { name: 'Credible', network: 'Impact', commission: '$50-200/lead', cookie: 30, epc: '$25', category: 'loans/refi', apply_url: 'https://impact.com', notes: 'Refinance leads pay well' },
    ],
    fitness: [
        { name: 'MyProtein', network: 'Awin', commission: '8%', cookie: 30, epc: '$3.50', category: 'supplements', apply_url: 'https://www.awin.com', notes: 'High volume, loyal buyers' },
        { name: 'Bodybuilding.com', network: 'Impact', commission: '5-8%', cookie: 10, epc: '$4', category: 'supplements', apply_url: 'https://impact.com', notes: 'Large catalog' },
        { name: 'Peloton', network: 'Direct', commission: '$24/sale', cookie: 30, epc: '$6', category: 'equipment', apply_url: 'https://onelink.to/peloton', notes: 'Premium brand' },
    ],
    tech: [
        { name: 'Semrush', network: 'Impact', commission: '40% recurring', cookie: 120, epc: '$180', category: 'SEO tools', apply_url: 'https://impact.com', notes: 'Recurring = compounding income' },
        { name: 'Kinsta', network: 'Direct', commission: '$50-500 + 10% recurring', cookie: 60, epc: '$150', category: 'hosting', apply_url: 'https://kinsta.com/affiliates/', notes: 'Best hosting affiliate' },
        { name: 'NordVPN', network: 'Impact', commission: '40%', cookie: 30, epc: '$35', category: 'VPN', apply_url: 'https://impact.com', notes: 'High volume, converts well' },
    ],
    homeoffice: [
        { name: 'FlexiSpot', network: 'ShareASale', commission: '5%', cookie: 30, epc: '$12', category: 'standing desks', apply_url: 'https://www.shareasale.com', notes: 'High AOV ($400+)' },
        { name: 'Autonomous', network: 'Direct', commission: '5%', cookie: 30, epc: '$15', category: 'ergonomic furniture', apply_url: 'https://www.autonomous.ai/affiliates', notes: 'Premium desks' },
    ],
};

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'find') {
        const { niche, keywords, min_commission = 0, networks } = parsed.data;
        if (!niche && !keywords?.length) return NextResponse.json({ error: 'niche or keywords required' }, { status: 400 });

        // Get existing programs to exclude
        const { data: existing } = await auth.supabase.from('affiliate_programs').select('name').eq('user_id', auth.user.id);
        const existingNames = new Set((existing || []).map((e: { name: string }) => e.name.toLowerCase()));

        // AI-powered program discovery
        const prompt = `You are an affiliate marketing expert. Find the top 20 affiliate programs for the "${niche || keywords?.join(', ')}" niche.

Already have: ${[...existingNames].join(', ') || 'none'}

Requirements:
- Minimum commission: ${min_commission}%
${networks?.length ? `- Preferred networks: ${networks.join(', ')}` : ''}

Return ONLY valid JSON array:
[
  {
    "name": "Program Name",
    "network": "ShareASale|CJ|Impact|Rakuten|Awin|Direct",
    "commission_value": "5%",
    "commission_type": "percentage|flat|recurring|tiered",
    "cookie_days": 30,
    "estimated_epc": "$3.50",
    "category": "specific product category",
    "apply_url": "https://direct-apply-url.com",
    "min_payout": 50,
    "payment_frequency": "monthly|bi-weekly|weekly",
    "notes": "why this program is worth joining",
    "revenue_potential": "high|medium|low",
    "competition_level": "high|medium|low",
    "best_content_types": ["review", "comparison", "how-to"]
  }
]

Focus on: high commissions, long cookies, recurring income, programs actually available to join.`;

        const result = await routeAI({ task: 'keyword_suggestion', prompt, systemPrompt: 'Affiliate marketing expert. Only recommend real, joinable programs. Return only JSON array.', maxTokens: 3000, jsonMode: true });

        let programs = [];
        if (result.success && result.content) {
            try {
                const m = result.content.match(/\[[\s\S]*\]/);
                programs = JSON.parse(m?.[0] || '[]');
                // Filter already existing
                programs = programs.filter((p: { name: string }) => !existingNames.has(p.name?.toLowerCase()));
            } catch { /* skip */ }
        }

        // Also include curated database matches
        const nicheKey = niche?.toLowerCase() || '';
        const curatedMatches = Object.entries(PROGRAM_DATABASE)
            .filter(([key]) => nicheKey.includes(key) || key.includes(nicheKey.split(' ')[0]))
            .flatMap(([, progs]) => progs)
            .filter(p => !existingNames.has(p.name.toLowerCase()));

        const allPrograms = [...curatedMatches.map(p => ({ ...p, source: 'curated' })), ...programs.map((p: Record<string, unknown>) => ({ ...p, source: 'ai' }))];

        // Save discovered programs
        if (allPrograms.length > 0) {
            await auth.supabase.from('discovered_programs').insert(
                allPrograms.slice(0, 30).map(p => ({
                    user_id: auth.user.id,
                    name: (p as { name: string }).name || '',
                    network: (p as { network: string }).network || '',
                    commission_value: String((p as { commission_value?: string; commission?: string }).commission_value || (p as { commission?: string }).commission || ''),
                    cookie_days: (p as { cookie?: number; cookie_days?: number }).cookie || (p as { cookie_days?: number }).cookie_days || 30,
                    niche: niche || '',
                    apply_url: (p as { apply_url: string }).apply_url || '',
                    notes: (p as { notes: string }).notes || '',
                    revenue_potential: (p as { revenue_potential?: string }).revenue_potential || 'medium',
                    status: 'new',
                }))
            );
        }

        return NextResponse.json({ programs: allPrograms, count: allPrograms.length, provider: result.provider });
    }

    if (action === 'save') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('discovered_programs').update({ status: 'saved' }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'dismiss') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('discovered_programs').update({ status: 'dismissed' }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const status = new URL(request.url).searchParams.get('status') || 'new';
    let query = auth.supabase.from('discovered_programs').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ programs: data || [] });
}
