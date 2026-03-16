// ============================================================
// RankMaster Pro - Rank Tracking Engine
// Real SERP position tracking via DataForSEO
// Fallback: Google Custom Search API
// ============================================================

import { createServiceRoleClient } from '../supabase';

interface RankResult {
    keyword: string;
    position: number | null;
    url: string | null;
    title: string | null;
    serp_features: string[];
    has_ai_overview: boolean;
    has_featured_snippet: boolean;
    device: 'desktop' | 'mobile';
    source: 'dataforseo' | 'google_cse';
}

interface DataForSEOCredentials {
    login: string;
    password: string;
}

export class RankTrackingEngine {
    private credentials: DataForSEOCredentials | null = null;
    private googleApiKey: string | null = null;
    private googleCseId: string | null = null;
    private credentialsLoaded = false;

    async loadCredentials(): Promise<void> {
        try {
            const supabase = createServiceRoleClient();
            const { data } = await supabase
                .from('settings')
                .select('key, value')
                .in('key', ['dataforseo_login', 'dataforseo_password', 'google_cse_api_key', 'google_cse_id']);

            const login = data?.find(s => s.key === 'dataforseo_login')?.value;
            const password = data?.find(s => s.key === 'dataforseo_password')?.value;
            this.googleApiKey = data?.find(s => s.key === 'google_cse_api_key')?.value || process.env.GOOGLE_SEARCH_API_KEY || null;
            this.googleCseId = data?.find(s => s.key === 'google_cse_id')?.value || process.env.GOOGLE_SEARCH_ENGINE_ID || null;

            if (login && password) {
                this.credentials = { login, password };
            }
        } catch {
            this.googleApiKey = process.env.GOOGLE_SEARCH_API_KEY || null;
            this.googleCseId = process.env.GOOGLE_SEARCH_ENGINE_ID || null;
        }
        this.credentialsLoaded = true;
    }

    isConfigured(): boolean {
        return this.credentials !== null || (this.googleApiKey !== null && this.googleCseId !== null);
    }

    // Check ranks for a batch of keywords
    async checkRanks(
        siteUrl: string,
        keywords: string[],
        options: { device?: 'desktop' | 'mobile'; location?: number } = {}
    ): Promise<RankResult[]> {
        if (!this.credentialsLoaded) await this.loadCredentials();

        const device = options.device || 'desktop';

        if (this.credentials) {
            try {
                return await this.checkWithDataForSEO(siteUrl, keywords, device, options.location);
            } catch (error) {
                console.warn('[RankTracking] DataForSEO failed, falling back to Google CSE:', error);
            }
        }

        if (this.googleApiKey && this.googleCseId) {
            return this.checkWithGoogleCSE(siteUrl, keywords, device);
        }

        throw new Error('No rank tracking API configured. Add DataForSEO or Google CSE credentials in Settings.');
    }

    // Save rank results to database
    async saveResults(
        userId: string,
        siteId: string,
        keywordId: string | null,
        result: RankResult
    ): Promise<void> {
        const supabase = createServiceRoleClient();

        // Get previous position for comparison
        const { data: prev } = await supabase
            .from('rank_tracking')
            .select('position')
            .eq('keyword', result.keyword)
            .eq('site_id', siteId)
            .order('checked_at', { ascending: false })
            .limit(1);

        const previousPosition = prev?.[0]?.position || null;

        await supabase.from('rank_tracking').insert({
            user_id: userId,
            keyword_id: keywordId,
            keyword: result.keyword,
            site_id: siteId,
            position: result.position,
            previous_position: previousPosition,
            url: result.url,
            serp_features: result.serp_features,
            has_ai_overview: result.has_ai_overview,
            has_featured_snippet: result.has_featured_snippet,
            device: result.device,
            source: result.source,
        });
    }

    // ==========================================
    // DataForSEO SERP API
    // ==========================================

    private getAuthHeader(): string {
        if (!this.credentials) throw new Error('DataForSEO not configured');
        return 'Basic ' + Buffer.from(`${this.credentials.login}:${this.credentials.password}`).toString('base64');
    }

    private async checkWithDataForSEO(
        siteUrl: string,
        keywords: string[],
        device: 'desktop' | 'mobile',
        locationCode?: number
    ): Promise<RankResult[]> {
        // DataForSEO allows batch requests — submit all keywords at once
        const tasks = keywords.map(keyword => ({
            keyword,
            location_code: locationCode || 2840, // US
            language_code: 'en',
            device,
            depth: 100, // Check top 100
        }));

        const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.getAuthHeader(),
            },
            body: JSON.stringify(tasks),
        });

        if (!response.ok) {
            throw new Error(`DataForSEO SERP error: ${response.status}`);
        }

        const data = await response.json();
        const siteDomain = new URL(siteUrl).hostname.replace('www.', '');
        const results: RankResult[] = [];

        for (let i = 0; i < (data.tasks || []).length; i++) {
            const task = data.tasks[i];
            const keyword = keywords[i] || '';
            const items = task.result?.[0]?.items || [];

            // Find our site in the SERP results
            let foundPosition: number | null = null;
            let foundUrl: string | null = null;
            let foundTitle: string | null = null;

            // Detect SERP features
            const serpFeatures: string[] = [];
            let hasAIOverview = false;
            let hasFeaturedSnippet = false;

            for (const item of items) {
                // Check for SERP features
                if (item.type === 'featured_snippet') {
                    hasFeaturedSnippet = true;
                    serpFeatures.push('featured_snippet');
                }
                if (item.type === 'ai_overview') {
                    hasAIOverview = true;
                    serpFeatures.push('ai_overview');
                }
                if (item.type === 'people_also_ask') {
                    serpFeatures.push('paa');
                }
                if (item.type === 'video') {
                    serpFeatures.push('video');
                }
                if (item.type === 'local_pack') {
                    serpFeatures.push('local_pack');
                }

                // Check if this is our site
                if (item.type === 'organic' && item.url) {
                    const itemDomain = new URL(item.url).hostname.replace('www.', '');
                    if (itemDomain === siteDomain && foundPosition === null) {
                        foundPosition = item.rank_absolute;
                        foundUrl = item.url;
                        foundTitle = item.title;
                    }
                }
            }

            results.push({
                keyword,
                position: foundPosition,
                url: foundUrl,
                title: foundTitle,
                serp_features: serpFeatures,
                has_ai_overview: hasAIOverview,
                has_featured_snippet: hasFeaturedSnippet,
                device,
                source: 'dataforseo',
            });
        }

        return results;
    }

    // ==========================================
    // Google Custom Search API Fallback
    // ==========================================

    private async checkWithGoogleCSE(
        siteUrl: string,
        keywords: string[],
        device: 'desktop' | 'mobile'
    ): Promise<RankResult[]> {
        const siteDomain = new URL(siteUrl).hostname.replace('www.', '');
        const results: RankResult[] = [];

        // Rate limit: process sequentially, max 20 keywords
        for (const keyword of keywords.slice(0, 20)) {
            try {
                const url = `https://www.googleapis.com/customsearch/v1?key=${this.googleApiKey}&cx=${this.googleCseId}&q=${encodeURIComponent(keyword)}&num=10&gl=us`;
                const response = await fetch(url);

                if (!response.ok) {
                    results.push(this.emptyResult(keyword, device, 'google_cse'));
                    continue;
                }

                const data = await response.json();
                const items = data.items || [];

                let foundPosition: number | null = null;
                let foundUrl: string | null = null;
                let foundTitle: string | null = null;

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    try {
                        const itemDomain = new URL(item.link).hostname.replace('www.', '');
                        if (itemDomain === siteDomain) {
                            foundPosition = i + 1;
                            foundUrl = item.link;
                            foundTitle = item.title;
                            break;
                        }
                    } catch { continue; }
                }

                results.push({
                    keyword,
                    position: foundPosition,
                    url: foundUrl,
                    title: foundTitle,
                    serp_features: [],
                    has_ai_overview: false,
                    has_featured_snippet: false,
                    device,
                    source: 'google_cse',
                });
            } catch {
                results.push(this.emptyResult(keyword, device, 'google_cse'));
            }
        }

        return results;
    }

    private emptyResult(keyword: string, device: 'desktop' | 'mobile', source: 'dataforseo' | 'google_cse'): RankResult {
        return {
            keyword, position: null, url: null, title: null,
            serp_features: [], has_ai_overview: false, has_featured_snippet: false,
            device, source,
        };
    }
}

import { createSingleton } from '../singleton';

export const getRankTrackingEngine = createSingleton(() => new RankTrackingEngine());
