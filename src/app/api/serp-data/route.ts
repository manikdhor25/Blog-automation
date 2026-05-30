// ============================================================
// RankMaster Pro - Real SERP Data Integration API
// ValueSERP / DataForSEO for unlimited rank tracking
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['check_rank', 'bulk_check', 'get_serp', 'get_history', 'configure', 'share_of_voice']),
    keyword: z.string().max(200).optional(),
    keywords: z.array(z.string()).max(50).optional(),
    domain: z.string().max(253).optional(),
    site_id: z.string().uuid().optional(),
    location: z.string().max(100).default('United States').optional(),
    language: z.string().max(10).default('en').optional(),
    provider: z.enum(['valueserp', 'dataforseo', 'serpapi']).default('valueserp').optional(),
});

async function fetchValueSERP(
    keyword: string,
    apiKey: string,
    location = 'United States',
    language = 'en'
): Promise<{ results: Array<{ position: number; url: string; title: string; domain: string; snippet: string }>; total_results: number }> {
    const params = new URLSearchParams({
        api_key: apiKey,
        q: keyword,
        location,
        gl: 'us',
        hl: language,
        num: '100',
        output: 'json',
    });

    const res = await fetch(`https://api.valueserp.com/search?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`ValueSERP API error: ${res.status}`);
    const data = await res.json();

    return {
        results: (data.organic_results || []).map((r: { position: number; link: string; title: string; domain: string; snippet: string }) => ({
            position: r.position,
            url: r.link,
            title: r.title,
            domain: r.domain,
            snippet: r.snippet || '',
        })),
        total_results: data.search_information?.total_results || 0,
    };
}

async function fetchDataForSEO(
    keyword: string,
    apiKey: string,
    location = 'United States'
): Promise<{ results: Array<{ position: number; url: string; title: string; domain: string; snippet: string }> }> {
    const base64 = Buffer.from(apiKey).toString('base64');
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
        method: 'POST',
        headers: { Authorization: `Basic ${base64}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ keyword, location_name: location, language_code: 'en', depth: 100 }]),
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`DataForSEO API error: ${res.status}`);
    const data = await res.json();
    const items = data.tasks?.[0]?.result?.[0]?.items || [];
    return {
        results: items.filter((i: { type: string }) => i.type === 'organic').map((i: { rank_absolute: number; url: string; title: string; domain: string; description: string }) => ({
            position: i.rank_absolute,
            url: i.url,
            title: i.title,
            domain: i.domain,
            snippet: i.description || '',
        })),
    };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    // Get API credentials
    const { data: settings } = await auth.supabase.from('settings').select('key, value').in('key', ['valueserp_api_key', 'dataforseo_api_key', 'serpapi_api_key']);
    const s = Object.fromEntries((settings || []).map((r: { key: string; value: string }) => [r.key, r.value]));

    const apiKey = s.valueserp_api_key || s.dataforseo_api_key || s.serpapi_api_key;
    const provider = s.valueserp_api_key ? 'valueserp' : s.dataforseo_api_key ? 'dataforseo' : 'none';

    if (action === 'configure') {
        return NextResponse.json({
            configured: !!apiKey,
            provider,
            setup_instructions: {
                valueserp: 'Sign up at valueserp.com, get API key, add as valueserp_api_key in Settings. $50/mo for 50K requests.',
                dataforseo: 'Sign up at dataforseo.com, get API credentials (login:password base64), add as dataforseo_api_key. Pay per request.',
                serpapi: 'Sign up at serpapi.com, get API key, add as serpapi_api_key. 100 free/month.',
            },
        });
    }

    if (!apiKey) {
        return NextResponse.json({ error: 'SERP API not configured. Add valueserp_api_key, dataforseo_api_key, or serpapi_api_key in Settings.' }, { status: 400 });
    }

    if (action === 'check_rank') {
        const { keyword, domain } = parsed.data;
        if (!keyword || !domain) return NextResponse.json({ error: 'keyword and domain required' }, { status: 400 });

        let serpData;
        try {
            serpData = provider === 'dataforseo'
                ? await fetchDataForSEO(keyword, apiKey, parsed.data.location)
                : await fetchValueSERP(keyword, apiKey, parsed.data.location, parsed.data.language);
        } catch (err) {
            return NextResponse.json({ error: err instanceof Error ? err.message : 'SERP fetch failed' }, { status: 500 });
        }

        const domainResult = serpData.results.find(r => r.domain.includes(domain.replace(/^www\./, '')));
        const position = domainResult?.position || null;

        // Save rank history
        await auth.supabase.from('serp_rank_history').insert({
            user_id: auth.user.id,
            keyword,
            domain,
            position,
            url: domainResult?.url || null,
            provider,
            checked_at: new Date().toISOString(),
        });

        return NextResponse.json({ keyword, domain, position, url: domainResult?.url, top_10: serpData.results.slice(0, 10) });
    }

    if (action === 'bulk_check') {
        const { keywords, domain, site_id } = parsed.data;
        if (!keywords?.length) return NextResponse.json({ error: 'keywords required' }, { status: 400 });

        // Get site domain if site_id provided
        let domainToCheck = domain;
        if (site_id && !domainToCheck) {
            const { data: site } = await auth.supabase.from('sites').select('url').eq('id', site_id).single();
            if (site) domainToCheck = new URL(site.url.startsWith('http') ? site.url : `https://${site.url}`).hostname;
        }

        if (!domainToCheck) return NextResponse.json({ error: 'domain or site_id required' }, { status: 400 });

        const results = [];
        for (const kw of keywords.slice(0, 20)) {
            try {
                const serpData = provider === 'dataforseo'
                    ? await fetchDataForSEO(kw, apiKey)
                    : await fetchValueSERP(kw, apiKey);

                const match = serpData.results.find(r => r.domain.includes((domainToCheck as string).replace(/^www\./, '')));
                results.push({ keyword: kw, position: match?.position || null, url: match?.url || null });

                await auth.supabase.from('serp_rank_history').insert({
                    user_id: auth.user.id, keyword: kw, domain: domainToCheck,
                    position: match?.position || null, url: match?.url || null,
                    provider, checked_at: new Date().toISOString(),
                });
            } catch { results.push({ keyword: kw, position: null, url: null, error: 'Fetch failed' }); }
        }

        return NextResponse.json({ domain: domainToCheck, results, checked: results.length });
    }

    if (action === 'share_of_voice') {
        const { site_id } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const { data: history } = await auth.supabase.from('serp_rank_history').select('keyword, position, checked_at').eq('user_id', auth.user.id).order('checked_at', { ascending: false }).limit(200);

        // Calculate share of voice (% of keywords in top 10)
        const latestPerKeyword = new Map<string, number | null>();
        for (const h of history || []) {
            if (!latestPerKeyword.has(h.keyword)) latestPerKeyword.set(h.keyword, h.position);
        }

        const total = latestPerKeyword.size;
        const top3 = [...latestPerKeyword.values()].filter(p => p !== null && (p as number) <= 3).length;
        const top10 = [...latestPerKeyword.values()].filter(p => p !== null && (p as number) <= 10).length;
        const top20 = [...latestPerKeyword.values()].filter(p => p !== null && (p as number) <= 20).length;

        return NextResponse.json({
            share_of_voice: {
                total_tracked: total,
                top_3: top3,
                top_10: top10,
                top_20: top20,
                not_ranking: total - top20,
                top_3_pct: total ? Math.round((top3 / total) * 100) : 0,
                top_10_pct: total ? Math.round((top10 / total) * 100) : 0,
            },
        });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');
    const domain = searchParams.get('domain');

    let query = auth.supabase.from('serp_rank_history').select('*').eq('user_id', auth.user.id).order('checked_at', { ascending: false });
    if (keyword) query = query.eq('keyword', keyword);
    if (domain) query = query.eq('domain', domain);

    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ history: data || [] });
}
