// ============================================================
// RankMaster Pro - Core Web Vitals Tracker API
// LCP, INP, CLS per URL via PageSpeed Insights API
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['check_url', 'check_site', 'get_history', 'list']),
    url: z.string().url().optional(),
    site_id: z.string().uuid().optional(),
    strategy: z.enum(['mobile', 'desktop', 'both']).default('mobile').optional(),
});

const PSI_KEY_SETTING = 'pagespeed_api_key';

interface PSIMetric { id: string; title: string; displayValue: string; score: number; numericValue: number; }
interface CWVResult {
    url: string; strategy: string;
    lcp: number | null; lcp_score: number;
    fid: number | null; cls: number | null; cls_score: number;
    inp: number | null; ttfb: number | null;
    performance_score: number;
    opportunities: Array<{ id: string; title: string; displayValue: string }>;
    checked_at: string;
}

async function fetchPSI(url: string, strategy: 'mobile' | 'desktop', apiKey: string): Promise<CWVResult | null> {
    try {
        const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${apiKey}&category=performance`;
        const res = await fetch(endpoint, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) return null;
        const data = await res.json();

        const audits = data.lighthouseResult?.audits || {};
        const cat = data.lighthouseResult?.categories?.performance;

        const getMetric = (key: string): PSIMetric | null => audits[key] ? { id: key, title: audits[key].title, displayValue: audits[key].displayValue || '', score: audits[key].score || 0, numericValue: audits[key].numericValue || 0 } : null;

        const lcp = getMetric('largest-contentful-paint');
        const cls = getMetric('cumulative-layout-shift');
        const ttfb = getMetric('server-response-time');
        const inp = getMetric('interaction-to-next-paint') || getMetric('max-potential-fid');

        const opportunities = (Object.values(audits) as Array<{ score?: number; details?: { type: string }; id?: string; title?: string; displayValue?: string }>)
            .filter(a => a.score !== null && a.score !== undefined && a.score < 0.9 && a.details?.type === 'opportunity')
            .slice(0, 5)
            .map(a => ({ id: a.id || '', title: a.title || '', displayValue: a.displayValue || '' }));

        return {
            url, strategy,
            lcp: lcp?.numericValue ? Math.round(lcp.numericValue) : null,
            lcp_score: lcp?.score || 0,
            fid: null,
            cls: cls?.numericValue ? parseFloat(cls.numericValue.toFixed(3)) : null,
            cls_score: cls?.score || 0,
            inp: inp?.numericValue ? Math.round(inp.numericValue) : null,
            ttfb: ttfb?.numericValue ? Math.round(ttfb.numericValue) : null,
            performance_score: Math.round((cat?.score || 0) * 100),
            opportunities,
            checked_at: new Date().toISOString(),
        };
    } catch { return null; }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    const { data: keyRow } = await auth.supabase.from('settings').select('value').eq('key', PSI_KEY_SETTING).single();
    const apiKey = keyRow?.value || process.env.PAGESPEED_API_KEY || '';

    if (!apiKey) {
        return NextResponse.json({ error: 'PageSpeed API key not configured. Add pagespeed_api_key in Settings.' }, { status: 400 });
    }

    if (action === 'check_url') {
        const { url, strategy = 'both' } = parsed.data;
        if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

        const strategies: ('mobile' | 'desktop')[] = strategy === 'both' ? ['mobile', 'desktop'] : [strategy];
        const results = [];

        for (const s of strategies) {
            const result = await fetchPSI(url, s, apiKey);
            if (result) {
                await auth.supabase.from('cwv_results').insert({ user_id: auth.user.id, ...result });
                results.push(result);
            }
        }

        return NextResponse.json({ results });
    }

    if (action === 'check_site') {
        const { site_id, strategy = 'mobile' } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const { data: site } = await auth.supabase.from('sites').select('url').eq('id', site_id).single();
        const { data: posts } = await auth.supabase.from('posts').select('id, slug').eq('site_id', site_id).eq('status', 'published').limit(20);

        const results = [];
        const baseUrl = site?.url?.replace(/\/$/, '') || '';

        for (const post of (posts || []).slice(0, 5)) {
            const url = `${baseUrl}/${post.slug}/`;
            const s = strategy === 'both' ? 'mobile' : strategy;
            const result = await fetchPSI(url, s as 'mobile' | 'desktop', apiKey);
            if (result) {
                await auth.supabase.from('cwv_results').insert({ user_id: auth.user.id, post_id: post.id, site_id, ...result });
                results.push(result);
            }
        }

        return NextResponse.json({ results, count: results.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const url = searchParams.get('url');

    let query = auth.supabase.from('cwv_results').select('*').eq('user_id', auth.user.id).order('checked_at', { ascending: false });
    if (siteId) query = query.eq('site_id', siteId);
    if (url) query = query.eq('url', url);

    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = data || [];
    const avgPerf = results.length ? Math.round(results.reduce((s, r) => s + r.performance_score, 0) / results.length) : 0;
    const poor = results.filter(r => r.performance_score < 50).length;

    return NextResponse.json({ results, summary: { total: results.length, avg_performance: avgPerf, poor_pages: poor } });
}
