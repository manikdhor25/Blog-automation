// ============================================================
// RankMaster Pro - Backlink Intelligence Engine
// Primary: Moz Links API | Fallback: AI suggestions
// ============================================================

import { createServiceRoleClient } from '@/lib/supabase';
import { getAIRouter } from '@/lib/ai/router';

interface BacklinkData {
    sourceUrl: string;
    sourceDomain: string;
    targetUrl: string;
    anchorText: string;
    linkType: 'dofollow' | 'nofollow';
    domainAuthority: number;
    pageAuthority: number;
    spamScore: number;
    firstSeen: string;
}

interface DomainMetrics {
    domain: string;
    domainAuthority: number;
    pageAuthority: number;
    linkingDomains: number;
    totalBacklinks: number;
    spamScore: number;
}

export class BacklinkEngine {
    private mozAccessId: string = '';
    private mozSecretKey: string = '';

    async init(): Promise<void> {
        const supabase = createServiceRoleClient();
        const { data: settings } = await supabase
            .from('settings')
            .select('key, value')
            .in('key', ['moz_access_id', 'moz_secret_key']);

        for (const s of settings || []) {
            if (s.key === 'moz_access_id') this.mozAccessId = s.value;
            if (s.key === 'moz_secret_key') this.mozSecretKey = s.value;
        }

        // Fallback to env vars
        if (!this.mozAccessId) this.mozAccessId = process.env.MOZ_ACCESS_ID || '';
        if (!this.mozSecretKey) this.mozSecretKey = process.env.MOZ_SECRET_KEY || '';
    }

    isConfigured(): boolean {
        return !!(this.mozAccessId && this.mozSecretKey);
    }

    // ==========================================
    // Get backlinks for a target URL/domain
    // ==========================================
    async getBacklinks(targetUrl: string, limit: number = 50): Promise<{
        backlinks: BacklinkData[];
        source: string;
    }> {
        if (!this.isConfigured()) {
            return { backlinks: [], source: 'none' };
        }

        try {
            const response = await fetch('https://lsapi.seomoz.com/v2/links', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`${this.mozAccessId}:${this.mozSecretKey}`).toString('base64')}`,
                },
                body: JSON.stringify({
                    target: targetUrl,
                    target_scope: 'page',
                    filter: 'external+equity',
                    limit,
                    source_cols: ['title', 'canonical_url', 'page_authority', 'domain_authority', 'spam_score'],
                    target_cols: ['canonical_url'],
                }),
            });

            if (!response.ok) {
                console.error('Moz API error:', response.status, await response.text());
                return { backlinks: [], source: 'moz_error' };
            }

            const data = await response.json();
            const backlinks: BacklinkData[] = (data.results || []).map((r: Record<string, unknown>) => ({
                sourceUrl: String(r.source_url || r.canonical_url || ''),
                sourceDomain: this.extractDomain(String(r.source_url || r.canonical_url || '')),
                targetUrl: targetUrl,
                anchorText: String(r.anchor_text || ''),
                linkType: r.nofollow ? 'nofollow' : 'dofollow',
                domainAuthority: Number(r.source_domain_authority || r.domain_authority || 0),
                pageAuthority: Number(r.source_page_authority || r.page_authority || 0),
                spamScore: Number(r.source_spam_score || r.spam_score || 0),
                firstSeen: String(r.first_seen || new Date().toISOString()),
            }));

            return { backlinks, source: 'moz' };
        } catch (error) {
            console.error('Moz backlink fetch failed:', error);
            return { backlinks: [], source: 'moz_error' };
        }
    }

    // ==========================================
    // Get domain authority metrics
    // ==========================================
    async getDomainMetrics(domain: string): Promise<{
        metrics: DomainMetrics | null;
        source: string;
    }> {
        if (!this.isConfigured()) {
            return { metrics: null, source: 'none' };
        }

        try {
            const response = await fetch('https://lsapi.seomoz.com/v2/url_metrics', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`${this.mozAccessId}:${this.mozSecretKey}`).toString('base64')}`,
                },
                body: JSON.stringify({
                    targets: [domain],
                    columns: ['domain_authority', 'page_authority', 'linking_root_domains', 'external_links', 'spam_score'],
                }),
            });

            if (!response.ok) {
                return { metrics: null, source: 'moz_error' };
            }

            const data = await response.json();
            const result = data.results?.[0];
            if (!result) return { metrics: null, source: 'moz' };

            return {
                metrics: {
                    domain,
                    domainAuthority: Math.round(result.domain_authority || 0),
                    pageAuthority: Math.round(result.page_authority || 0),
                    linkingDomains: result.linking_root_domains || 0,
                    totalBacklinks: result.external_links || 0,
                    spamScore: Math.round(result.spam_score || 0),
                },
                source: 'moz',
            };
        } catch {
            return { metrics: null, source: 'moz_error' };
        }
    }

    // ==========================================
    // Competitor backlink gap analysis
    // ==========================================
    async getBacklinkGap(
        yourDomain: string,
        competitorDomain: string
    ): Promise<{
        yourMetrics: DomainMetrics | null;
        competitorMetrics: DomainMetrics | null;
        competitorBacklinks: BacklinkData[];
        opportunities: BacklinkData[];
        source: string;
    }> {
        const [yourResult, competitorResult, competitorLinks] = await Promise.all([
            this.getDomainMetrics(yourDomain),
            this.getDomainMetrics(competitorDomain),
            this.getBacklinks(competitorDomain, 30),
        ]);

        // Opportunities = competitor backlinks that don't link to you
        const opportunities = competitorLinks.backlinks.filter(
            (bl) => !bl.sourceDomain.includes(yourDomain.replace('www.', ''))
        );

        return {
            yourMetrics: yourResult.metrics,
            competitorMetrics: competitorResult.metrics,
            competitorBacklinks: competitorLinks.backlinks,
            opportunities,
            source: this.isConfigured() ? 'moz' : 'none',
        };
    }

    // ==========================================
    // AI-powered backlink opportunity discovery (fallback)
    // ==========================================
    async discoverOpportunities(
        siteUrl: string,
        niche: string
    ): Promise<{
        opportunities: {
            source_url: string;
            source_domain: string;
            anchor_text: string;
            link_type: string;
            domain_authority: number;
            strategy: string;
        }[];
        source: string;
    }> {
        const ai = getAIRouter();
        const prompt = `Analyze common backlink opportunities for a ${niche} website at ${siteUrl}.

Suggest 15 potential backlink sources. For each provide:
- source_url: a realistic URL that could link to this site
- source_domain: the domain name
- anchor_text: suggested anchor text
- link_type: "dofollow" or "nofollow"
- domain_authority: estimated DA (1-100)
- strategy: how to acquire this backlink (guest post, resource page, broken link, etc.)

Respond with JSON: { "opportunities": [...] }`;

        const result = await ai.generate('competitor_analysis', prompt, {
            systemPrompt: 'You are a link building expert. Suggest realistic, actionable backlink opportunities. Always respond with valid JSON.',
            jsonMode: true,
        });

        try {
            const parsed = JSON.parse(result);
            return { opportunities: parsed.opportunities || [], source: 'ai_suggested' };
        } catch {
            return { opportunities: [], source: 'ai_suggested' };
        }
    }

    private extractDomain(url: string): string {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return url;
        }
    }
}

import { createAsyncSingleton } from '../singleton';

export const getBacklinkEngine = createAsyncSingleton(async () => {
    const engine = new BacklinkEngine();
    await engine.init();
    return engine;
});
