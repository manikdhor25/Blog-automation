// ============================================================
// RankMaster Pro - Keyword Data Engine
// Real keyword metrics via DataForSEO API
// Fallback: AI-generated estimates when no API key configured
// ============================================================

import { createServiceRoleClient } from '../supabase';
import { getAIRouter } from '../ai/router';

interface KeywordMetrics {
    keyword: string;
    search_volume: number;
    difficulty: number;
    cpc: number;
    competition: number;
    intent_type: 'informational' | 'commercial' | 'transactional' | 'navigational';
    trend: number[];       // 12-month trend (relative)
    serp_features: string[];
    source: 'dataforseo' | 'ai_estimated';
}

interface KeywordSuggestion extends KeywordMetrics {
    relevance_score: number;
}

interface DataForSEOCredentials {
    login: string;
    password: string;
}

export class KeywordDataEngine {
    private credentials: DataForSEOCredentials | null = null;
    private credentialsLoaded = false;

    // Load DataForSEO credentials from settings
    async loadCredentials(): Promise<void> {
        try {
            const supabase = createServiceRoleClient();
            const { data } = await supabase
                .from('settings')
                .select('key, value')
                .in('key', ['dataforseo_login', 'dataforseo_password']);

            const login = data?.find(s => s.key === 'dataforseo_login')?.value;
            const password = data?.find(s => s.key === 'dataforseo_password')?.value;

            if (login && password) {
                this.credentials = { login, password };
            }
        } catch {
            // No credentials available
        }
        this.credentialsLoaded = true;
    }

    isConfigured(): boolean {
        return this.credentials !== null;
    }

    // Get real keyword metrics for a list of keywords
    async getKeywordMetrics(keywords: string[], location?: string): Promise<KeywordMetrics[]> {
        if (!this.credentialsLoaded) await this.loadCredentials();

        if (this.credentials) {
            try {
                return await this.fetchFromDataForSEO(keywords, location);
            } catch (error) {
                console.warn('[KeywordData] DataForSEO failed, falling back to AI:', error);
            }
        }

        return this.estimateWithAI(keywords);
    }

    // Get keyword suggestions for a seed keyword / niche
    async getSuggestedKeywords(seed: string, limit: number = 20): Promise<KeywordSuggestion[]> {
        if (!this.credentialsLoaded) await this.loadCredentials();

        if (this.credentials) {
            try {
                return await this.fetchSuggestionsFromDataForSEO(seed, limit);
            } catch (error) {
                console.warn('[KeywordData] DataForSEO suggestions failed, falling back to AI:', error);
            }
        }

        return this.suggestWithAI(seed, limit);
    }

    // Enrich existing keywords with real data
    async enrichKeywords(keywords: { id: string; keyword: string }[]): Promise<(KeywordMetrics & { id: string })[]> {
        const kws = keywords.map(k => k.keyword);
        const metrics = await this.getKeywordMetrics(kws);

        return metrics.map((m, i) => ({
            ...m,
            id: keywords[i]?.id || '',
        }));
    }

    // ==========================================
    // DataForSEO API calls
    // ==========================================

    private getAuthHeader(): string {
        if (!this.credentials) throw new Error('DataForSEO not configured');
        return 'Basic ' + Buffer.from(`${this.credentials.login}:${this.credentials.password}`).toString('base64');
    }

    // Fetch real metrics from DataForSEO Keywords Data API
    private async fetchFromDataForSEO(keywords: string[], location?: string): Promise<KeywordMetrics[]> {
        const response = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.getAuthHeader(),
            },
            body: JSON.stringify([{
                keywords,
                location_code: location ? parseInt(location) : 2840, // US by default
                language_code: 'en',
                date_from: this.getDateMonthsAgo(12),
            }]),
        });

        if (!response.ok) {
            throw new Error(`DataForSEO API error: ${response.status}`);
        }

        const data = await response.json();
        const results: KeywordMetrics[] = [];

        for (const task of data.tasks || []) {
            for (const item of task.result || []) {
                results.push({
                    keyword: item.keyword,
                    search_volume: item.search_volume || 0,
                    difficulty: Math.round((item.competition || 0) * 100),
                    cpc: item.cpc || 0,
                    competition: item.competition || 0,
                    intent_type: this.classifyIntent(item.keyword),
                    trend: (item.monthly_searches || []).map((m: { search_volume: number }) => m.search_volume),
                    serp_features: [],
                    source: 'dataforseo',
                });
            }
        }

        // If we have results, also fetch keyword difficulty
        if (results.length > 0) {
            try {
                const difficultyData = await this.fetchKeywordDifficulty(keywords);
                for (const result of results) {
                    const diff = difficultyData.find(d => d.keyword === result.keyword);
                    if (diff) {
                        result.difficulty = diff.difficulty;
                        result.serp_features = diff.serp_features;
                    }
                }
            } catch {
                // Difficulty data is optional
            }
        }

        return results;
    }

    // Fetch keyword difficulty scores
    private async fetchKeywordDifficulty(keywords: string[]): Promise<{ keyword: string; difficulty: number; serp_features: string[] }[]> {
        const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_difficulty/live', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.getAuthHeader(),
            },
            body: JSON.stringify([{
                keywords,
                location_code: 2840,
                language_code: 'en',
            }]),
        });

        if (!response.ok) return [];

        const data = await response.json();
        const results: { keyword: string; difficulty: number; serp_features: string[] }[] = [];

        for (const task of data.tasks || []) {
            for (const item of task.result || []) {
                results.push({
                    keyword: item.keyword,
                    difficulty: item.keyword_difficulty || 0,
                    serp_features: (item.serp_info?.serp_item_types || []) as string[],
                });
            }
        }

        return results;
    }

    // Fetch keyword suggestions from DataForSEO
    private async fetchSuggestionsFromDataForSEO(seed: string, limit: number): Promise<KeywordSuggestion[]> {
        const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.getAuthHeader(),
            },
            body: JSON.stringify([{
                keyword: seed,
                location_code: 2840,
                language_code: 'en',
                limit,
            }]),
        });

        if (!response.ok) {
            throw new Error(`DataForSEO suggestions error: ${response.status}`);
        }

        const data = await response.json();
        const results: KeywordSuggestion[] = [];

        for (const task of data.tasks || []) {
            for (const item of task.result?.[0]?.items || []) {
                const kd = item.keyword_data;
                if (!kd) continue;
                results.push({
                    keyword: kd.keyword,
                    search_volume: kd.keyword_info?.search_volume || 0,
                    difficulty: kd.keyword_info?.competition ? Math.round(kd.keyword_info.competition * 100) : 50,
                    cpc: kd.keyword_info?.cpc || 0,
                    competition: kd.keyword_info?.competition || 0,
                    intent_type: this.classifyIntent(kd.keyword),
                    trend: (kd.keyword_info?.monthly_searches || []).map((m: { search_volume: number }) => m.search_volume),
                    serp_features: (kd.serp_info?.serp_item_types || []) as string[],
                    source: 'dataforseo',
                    relevance_score: item.related_keywords_data?.se_results_count ? 80 : 60,
                });
            }
        }

        return results.slice(0, limit);
    }

    // ==========================================
    // AI Fallback
    // ==========================================

    private async estimateWithAI(keywords: string[]): Promise<KeywordMetrics[]> {
        const ai = getAIRouter();
        const prompt = `Estimate realistic SEO metrics for these keywords (US market):
${keywords.map(k => `- "${k}"`).join('\n')}

For each keyword provide:
- keyword: the exact keyword
- search_volume: estimated monthly search volume (use realistic numbers, not round thousands)
- difficulty: 1-100 SEO difficulty score based on competition
- cpc: estimated CPC in USD
- intent_type: "informational", "commercial", "transactional", or "navigational"

Respond with JSON: { "keywords": [...] }`;

        const result = await ai.generate('keyword_suggestion', prompt, {
            systemPrompt: 'You are a keyword research expert. Provide realistic keyword metrics based on your knowledge. Always respond with valid JSON.',
            jsonMode: true,
        });

        try {
            const parsed = JSON.parse(result);
            return (parsed.keywords || []).map((k: Record<string, unknown>) => ({
                keyword: k.keyword as string,
                search_volume: (k.search_volume as number) || 0,
                difficulty: (k.difficulty as number) || 50,
                cpc: (k.cpc as number) || 0,
                competition: ((k.difficulty as number) || 50) / 100,
                intent_type: (k.intent_type as string) || 'informational',
                trend: [],
                serp_features: [],
                source: 'ai_estimated' as const,
            }));
        } catch {
            return keywords.map(k => ({
                keyword: k, search_volume: 0, difficulty: 50, cpc: 0,
                competition: 0.5, intent_type: 'informational' as const,
                trend: [], serp_features: [], source: 'ai_estimated' as const,
            }));
        }
    }

    private async suggestWithAI(seed: string, limit: number): Promise<KeywordSuggestion[]> {
        const ai = getAIRouter();
        const prompt = `Suggest ${limit} high-potential keywords for the niche/topic: "${seed}" targeting US audience.

For each keyword provide:
- keyword: the exact search query
- search_volume: estimated monthly search volume (realistic numbers)
- difficulty: 1-100 difficulty score
- cpc: estimated CPC in USD
- intent_type: "informational", "commercial", "transactional", or "navigational"
- serp_features: array of likely SERP features like "featured_snippet", "paa", "video"

Focus on:
1. Low-difficulty, high-volume keywords
2. Long-tail with buying intent
3. Question-based keywords (for AEO)
4. Keywords that trigger featured snippets

Respond with JSON: { "keywords": [...] }`;

        const result = await ai.generate('keyword_suggestion', prompt, {
            systemPrompt: 'You are a keyword research expert. Suggest realistic keywords with accurate difficulty scores. Always respond with valid JSON.',
            jsonMode: true,
        });

        try {
            const parsed = JSON.parse(result);
            return (parsed.keywords || []).map((k: Record<string, unknown>) => ({
                keyword: k.keyword as string,
                search_volume: (k.search_volume as number) || 0,
                difficulty: (k.difficulty as number) || 50,
                cpc: (k.cpc as number) || 0,
                competition: ((k.difficulty as number) || 50) / 100,
                intent_type: (k.intent_type as string) || 'informational',
                trend: [],
                serp_features: (k.serp_features as string[]) || [],
                source: 'ai_estimated' as const,
                relevance_score: 70,
            }));
        } catch {
            return [];
        }
    }

    // ==========================================
    // Helpers
    // ==========================================

    private classifyIntent(keyword: string): 'informational' | 'commercial' | 'transactional' | 'navigational' {
        const kw = keyword.toLowerCase();
        if (/\b(buy|price|discount|coupon|deal|order|purchase|cheap|affordable)\b/.test(kw)) return 'transactional';
        if (/\b(best|top|review|vs|compare|alternative|recommend)\b/.test(kw)) return 'commercial';
        if (/\b(login|sign in|website|official|contact)\b/.test(kw)) return 'navigational';
        return 'informational';
    }

    private getDateMonthsAgo(months: number): string {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        return d.toISOString().split('T')[0];
    }
}

import { createSingleton } from '../singleton';

export const getKeywordDataEngine = createSingleton(() => new KeywordDataEngine());
