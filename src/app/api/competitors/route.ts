// ============================================================
// RankMaster Pro - Competitors API Route
// Real competitor analysis using SERP Intelligence
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSERPIntelligence } from '@/lib/engines/serp-intelligence';
import { getAIRouter } from '@/lib/ai/router';
import { getBacklinkEngine } from '@/lib/engines/backlink-engine';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';

// POST /api/competitors - Analyze competitors (authenticated)
export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const rateLimited = checkRateLimit(auth.user.id, '/api/competitors', { maxRequests: 10, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        const body = await request.json();
        const { niche, site_id, keywords: targetKeywords } = body;

        if (!niche) return NextResponse.json({ error: 'Niche is required' }, { status: 400 });

        const serp = getSERPIntelligence();

        // Get site URL for comparison (verify ownership)
        let siteUrl = '';
        if (site_id) {
            const { data: site } = await auth.supabase.from('sites').select('url').eq('id', site_id).eq('user_id', auth.user.id).single();
            siteUrl = site?.url || '';
        }

        // Use sample keywords from the niche to discover competitors
        const sampleKeywords = targetKeywords?.length ? targetKeywords.slice(0, 5) : [niche];

        const competitorDomains: Record<string, { domain: string; positions: number[]; urls: string[]; contentCount: number }> = {};
        const contentGaps: { keyword: string; competitorUrl: string; competitorDomain: string; position: number; title: string }[] = [];

        // Search each keyword and analyze competitors
        for (const keyword of sampleKeywords) {
            try {
                const serpData = await serp.searchGoogle(keyword, { num: 10 });
                const results = serpData.results || [];

                for (const result of results) {
                    const domain = new URL(result.url).hostname.replace('www.', '');

                    // Skip own domain
                    if (siteUrl && result.url.includes(new URL(siteUrl).hostname.replace('www.', ''))) continue;

                    if (!competitorDomains[domain]) {
                        competitorDomains[domain] = { domain, positions: [], urls: [], contentCount: 0 };
                    }

                    competitorDomains[domain].positions.push(result.position);
                    if (!competitorDomains[domain].urls.includes(result.url)) {
                        competitorDomains[domain].urls.push(result.url);
                        competitorDomains[domain].contentCount++;
                    }

                    // Track as content gap
                    contentGaps.push({
                        keyword,
                        competitorUrl: result.url,
                        competitorDomain: domain,
                        position: result.position,
                        title: result.title || '',
                    });
                }
            } catch {
                // Skip failed searches
            }
        }

        // Process competitors
        const competitors = Object.values(competitorDomains)
            .map(c => ({
                domain: c.domain,
                overlappingKeywords: c.positions.length,
                avgPosition: Math.round(c.positions.reduce((a, b) => a + b, 0) / c.positions.length),
                contentCount: c.contentCount,
                threat: c.positions.some(p => p <= 3) ? 'high' as const :
                    c.positions.some(p => p <= 10) ? 'medium' as const : 'low' as const,
                urls: c.urls.slice(0, 5),
            }))
            .sort((a, b) => a.avgPosition - b.avgPosition)
            .slice(0, 10);

        // Enrich competitors with Domain Authority from Moz
        const backlinkEngine = await getBacklinkEngine();
        for (const comp of competitors) {
            try {
                const daResult = await backlinkEngine.getDomainMetrics(comp.domain);
                (comp as Record<string, unknown>).domainAuthority = daResult?.metrics?.domainAuthority || null;
                (comp as Record<string, unknown>).spamScore = daResult?.metrics?.spamScore || null;
            } catch {
                (comp as Record<string, unknown>).domainAuthority = null;
            }
        }

        // If no SERP data, fall back to AI analysis
        if (competitors.length === 0) {
            const ai = getAIRouter();
            const prompt = `Analyze the competitive landscape for "${niche}". Identify the top 8 competing domains and content gaps.

For each competitor provide:
- domain: website domain
- overlappingKeywords: estimated overlapping keywords (number)
- avgPosition: estimated average search position (number)
- contentCount: estimated number of relevant pages (number)
- threat: "high", "medium", or "low"

Also provide 10 content gap keywords competitors rank for.

Respond with JSON: { "competitors": [...], "gaps": [{ "keyword": "...", "competitorDomain": "...", "position": X, "volume": X, "difficulty": X }] }`;

            const result = await ai.generate('competitor_analysis', prompt, {
                systemPrompt: 'You are a competitive analysis expert. Provide realistic analysis. Always respond with valid JSON.',
                jsonMode: true,
            });

            try {
                const parsed = JSON.parse(result);
                return NextResponse.json({
                    competitors: parsed.competitors || [],
                    gaps: parsed.gaps || [],
                    source: 'ai',
                });
            } catch {
                return NextResponse.json({ competitors: [], gaps: [], source: 'ai' });
            }
        }

        return NextResponse.json({
            competitors,
            gaps: contentGaps.slice(0, 20),
            source: 'serp',
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Competitor analysis failed' },
            { status: 500 }
        );
    }
}
