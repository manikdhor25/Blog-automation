// ============================================================
// RankMaster Pro - AI Overview (AIO) Monitor Engine
// Tracks content citations in Google AI Overviews
// ============================================================

import { createServiceRoleClient } from '@/lib/supabase';

interface AIOResult {
    keyword: string;
    aiOverviewPresent: boolean;
    cited: boolean;
    citedUrl?: string;
    citedSnippet?: string;
    aiOverviewSources: number;
    position?: number;
}

export class AIOMonitor {
    private dataforseoLogin: string = '';
    private dataforseoPassword: string = '';

    async init(): Promise<void> {
        const supabase = createServiceRoleClient();
        const { data: settings } = await supabase
            .from('settings')
            .select('key, value')
            .in('key', ['dataforseo_login', 'dataforseo_password']);

        for (const s of settings || []) {
            if (s.key === 'dataforseo_login') this.dataforseoLogin = s.value;
            if (s.key === 'dataforseo_password') this.dataforseoPassword = s.value;
        }

        if (!this.dataforseoLogin) this.dataforseoLogin = process.env.DATAFORSEO_LOGIN || '';
        if (!this.dataforseoPassword) this.dataforseoPassword = process.env.DATAFORSEO_PASSWORD || '';
    }

    isConfigured(): boolean {
        return !!(this.dataforseoLogin && this.dataforseoPassword);
    }

    // Check if target domain is cited in AI Overview for given keywords
    async checkAIOPresence(
        targetDomain: string,
        keywords: string[],
        location?: string
    ): Promise<AIOResult[]> {
        const results: AIOResult[] = [];

        if (!this.isConfigured()) {
            // Return empty results when not configured
            return keywords.map(kw => ({
                keyword: kw,
                aiOverviewPresent: false,
                cited: false,
                aiOverviewSources: 0,
            }));
        }

        // Use DataForSEO SERP API to check AI Overviews
        const tasks = keywords.map(keyword => ({
            keyword,
            location_name: location || 'United States',
            language_name: 'English',
            device: 'desktop',
            os: 'windows',
        }));

        try {
            const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`${this.dataforseoLogin}:${this.dataforseoPassword}`).toString('base64')}`,
                },
                body: JSON.stringify(tasks),
            });

            if (!response.ok) {
                console.error('DataForSEO AIO check failed:', response.status);
                return keywords.map(kw => ({ keyword: kw, aiOverviewPresent: false, cited: false, aiOverviewSources: 0 }));
            }

            const data = await response.json();

            for (const task of data.tasks || []) {
                const keyword = task.data?.keyword || '';
                const items = task.result?.[0]?.items || [];

                // Check for AI Overview in items
                const aiOverview = items.find((item: Record<string, unknown>) =>
                    item.type === 'ai_overview' || item.type === 'featured_snippet'
                );

                let cited = false;
                let citedUrl: string | undefined;
                let citedSnippet: string | undefined;
                let aiOverviewSources = 0;

                if (aiOverview) {
                    const sources = (aiOverview.items || aiOverview.references || []) as Array<Record<string, unknown>>;
                    aiOverviewSources = sources.length;

                    // Check if our domain is cited
                    for (const source of sources) {
                        const sourceUrl = String(source.url || source.source_url || '');
                        if (sourceUrl.includes(targetDomain.replace('www.', ''))) {
                            cited = true;
                            citedUrl = sourceUrl;
                            citedSnippet = String(source.snippet || source.text || '').substring(0, 200);
                            break;
                        }
                    }
                }

                // Also check regular organic for position
                const organicResult = items.find((item: Record<string, unknown>) =>
                    item.type === 'organic' && String(item.url || '').includes(targetDomain.replace('www.', ''))
                );

                results.push({
                    keyword,
                    aiOverviewPresent: !!aiOverview,
                    cited,
                    citedUrl,
                    citedSnippet,
                    aiOverviewSources,
                    position: organicResult ? Number((organicResult as Record<string, unknown>).rank_absolute) : undefined,
                });
            }
        } catch (error) {
            console.error('AIO check error:', error);
            return keywords.map(kw => ({ keyword: kw, aiOverviewPresent: false, cited: false, aiOverviewSources: 0 }));
        }

        return results;
    }

    // Get AIO optimization suggestions for a keyword
    getOptimizationTips(keyword: string, currentScore: number): string[] {
        const tips: string[] = [];

        if (currentScore < 70) {
            tips.push('Add a concise, factual answer in the first 200 words');
            tips.push('Structure with clear H2/H3 headings for each subtopic');
            tips.push(`Include "What is ${keyword}?" pattern for direct answer extraction`);
        }

        tips.push('Use bullet/numbered lists for step-by-step processes');
        tips.push('Add statistics with cited sources for credibility');
        tips.push('Include comparison tables for "vs" or "best" queries');
        tips.push('Ensure FAQ section covers common follow-up questions');
        tips.push('Add structured data (HowTo, FAQ, Article) for rich results');

        return tips.slice(0, 5);
    }
}

import { createAsyncSingleton } from '../singleton';

export const getAIOMonitor = createAsyncSingleton(async () => {
    const monitor = new AIOMonitor();
    await monitor.init();
    return monitor;
});
