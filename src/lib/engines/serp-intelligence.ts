// ============================================================
// RankMaster Pro - SERP Intelligence Engine
// Google Custom Search API integration for US search data
// Deep extraction + competitor blueprint for content quality
// ============================================================

import { SERPResult, SERPFeature } from '../types';
import { getAIRouter } from '../ai/router';
import { createServiceRoleClient } from '../supabase';

interface GoogleSearchItem {
    title: string;
    link: string;
    snippet: string;
    displayLink: string;
    pagemap?: {
        metatags?: Array<Record<string, string>>;
        cse_thumbnail?: Array<{ src: string }>;
    };
}

interface GoogleSearchResponse {
    searchInformation: {
        totalResults: string;
        searchTime: number;
    };
    items?: GoogleSearchItem[];
    queries?: {
        request: Array<{ totalResults: string }>;
    };
}

// ── Deep Extraction Types ──────────────────────────────────────

export interface HeadingNode {
    level: number;
    text: string;
    wordCountBelow: number; // words in content under this heading
}

export interface DeepPageContent {
    url: string;
    title: string;
    headings: HeadingNode[];
    sections: { heading: string; content: string; wordCount: number }[];
    totalWordCount: number;
    faqQuestions: string[];
    hasTables: boolean;
    tableCount: number;
    statistics: string[];      // extracted data points & numbers
    internalLinkCount: number;
    externalLinkCount: number;
    listCount: number;
    imageCount: number;
}

export interface CompetitorBlueprint {
    consensusHeadings: { heading: string; frequency: number; avgPosition: number }[];
    uniqueAngles: string[];
    keyStatistics: { stat: string; source: string; frequency: number }[];
    contentGaps: string[];
    avgWordCount: number;
    avgSectionCount: number;
    faqPatterns: string[];
    tableTopics: string[];
    snippetFormats: { type: string; keyword: string }[];
    topCompetitorSections: { heading: string; excerpt: string; source: string }[];
}

// ── SERP Intelligence Class ────────────────────────────────────

export class SERPIntelligence {
    private apiKey: string;
    private searchEngineId: string;
    private baseUrl = 'https://www.googleapis.com/customsearch/v1';

    // In-memory SERP cache — 24h TTL to avoid duplicate API calls
    private static cache = new Map<string, {
        data: {
            results: Omit<SERPResult, 'id' | 'keyword_id' | 'fetched_at'>[];
            totalResults: number;
            searchTime: number;
        };
        timestamp: number;
    }>();
    private static CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

    constructor() {
        this.apiKey = process.env.GOOGLE_SEARCH_API_KEY || '';
        this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || '';
    }

    // Search Google US for a keyword
    async searchGoogle(
        keyword: string,
        options?: { start?: number; num?: number; gl?: string }
    ): Promise<{
        results: Omit<SERPResult, 'id' | 'keyword_id' | 'fetched_at'>[];
        totalResults: number;
        searchTime: number;
    }> {
        const { start = 1, num = 10, gl = 'us' } = options || {};

        // Check in-memory cache first
        const cacheKey = `${keyword}|${gl}|${start}|${num}`;
        const cached = SERPIntelligence.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SERPIntelligence.CACHE_TTL_MS) {
            console.log(`[SERP] Memory cache hit for "${keyword}" (gl=${gl})`);
            return cached.data;
        }

        // Check Supabase persistent cache on memory miss
        try {
            const supabase = createServiceRoleClient();
            const { data: dbCached } = await supabase
                .from('serp_cache')
                .select('results, total_results, search_time')
                .eq('cache_key', cacheKey)
                .gt('expires_at', new Date().toISOString())
                .single();
            if (dbCached) {
                console.log(`[SERP] DB cache hit for "${keyword}" (gl=${gl})`);
                const dbResult: { results: SERPResult[]; totalResults: number; searchTime: number } = {
                    results: dbCached.results as SERPResult[],
                    totalResults: dbCached.total_results as number,
                    searchTime: dbCached.search_time as number,
                };
                // Warm memory cache
                SERPIntelligence.cache.set(cacheKey, { data: dbResult, timestamp: Date.now() });
                return dbResult;
            }
        } catch {
            // DB cache miss or error — proceed to Google API
        }

        const params = new URLSearchParams({
            key: this.apiKey,
            cx: this.searchEngineId,
            q: keyword,
            gl,
            num: String(num),
            start: String(start),
        });

        const response = await fetch(`${this.baseUrl}?${params}`);
        if (!response.ok) {
            throw new Error(`Google Search API error: ${response.status} ${response.statusText}`);
        }

        const data: GoogleSearchResponse = await response.json();

        const results = (data.items || []).map((item, index) => ({
            position: start + index,
            url: item.link,
            title: item.title,
            snippet: item.snippet || '',
            domain: item.displayLink,
            has_featured_snippet: index === 0 && this.looksLikeFeaturedSnippet(item),
            has_paa: false,
        }));

        const result = {
            results,
            totalResults: parseInt(data.searchInformation?.totalResults || '0'),
            searchTime: data.searchInformation?.searchTime || 0,
        };

        // Store in memory cache
        SERPIntelligence.cache.set(cacheKey, { data: result, timestamp: Date.now() });

        // Persist to Supabase (fire-and-forget)
        try {
            const supabase = createServiceRoleClient();
            await supabase.from('serp_cache').upsert({
                cache_key: cacheKey,
                keyword,
                gl,
                results: result.results,
                total_results: result.totalResults,
                search_time: result.searchTime,
                expires_at: new Date(Date.now() + SERPIntelligence.CACHE_TTL_MS).toISOString(),
            }, { onConflict: 'cache_key' });
        } catch {
            // Silent fail — cache persistence should never break search
        }

        // Prune expired in-memory entries periodically (every 50 entries)
        if (SERPIntelligence.cache.size > 50) {
            const now = Date.now();
            for (const [key, entry] of SERPIntelligence.cache) {
                if (now - entry.timestamp >= SERPIntelligence.CACHE_TTL_MS) {
                    SERPIntelligence.cache.delete(key);
                }
            }
        }

        return result;
    }

    // Detect potential SERP features from search results
    analyzeSERPFeatures(keyword: string, results: Omit<SERPResult, 'id' | 'keyword_id' | 'fetched_at'>[]): SERPFeature[] {
        const features: SERPFeature[] = [];

        if (results.length > 0 && results[0].has_featured_snippet) {
            features.push('featured_snippet');
        }

        const questionWords = ['what', 'how', 'why', 'when', 'where', 'which', 'who', 'is', 'can', 'does'];
        if (questionWords.some(q => keyword.toLowerCase().startsWith(q))) {
            features.push('paa');
        }

        return features;
    }

    // Extract "People Also Ask" style questions from search results
    extractPAAQuestions(results: Omit<SERPResult, 'id' | 'keyword_id' | 'fetched_at'>[]): string[] {
        const questions: string[] = [];

        for (const result of results) {
            const snippetQuestions = result.snippet.match(/[^.!?]*\?/g) || [];
            questions.push(...snippetQuestions.map(q => q.trim()));
        }

        return [...new Set(questions)].slice(0, 10);
    }

    // ── Deep Page Content Extraction ───────────────────────────

    async deepExtractContent(url: string, title: string): Promise<DeepPageContent | null> {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(15000),
            });

            if (!response.ok) return null;

            const html = await response.text();

            // Strip scripts, styles, nav, footer, sidebar
            const cleanHtml = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<nav[\s\S]*?<\/nav>/gi, '')
                .replace(/<footer[\s\S]*?<\/footer>/gi, '')
                .replace(/<aside[\s\S]*?<\/aside>/gi, '')
                .replace(/<header[\s\S]*?<\/header>/gi, '');

            // Extract headings with their positions
            const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
            const rawHeadings: { level: number; text: string; index: number }[] = [];
            let match;
            while ((match = headingRegex.exec(cleanHtml)) !== null) {
                const text = match[2].replace(/<[^>]+>/g, '').trim();
                if (text.length > 0) {
                    rawHeadings.push({ level: parseInt(match[1]), text, index: match.index });
                }
            }

            // Extract sections: content between each heading
            const sections: { heading: string; content: string; wordCount: number }[] = [];
            for (let i = 0; i < rawHeadings.length; i++) {
                const start = rawHeadings[i].index;
                const end = i + 1 < rawHeadings.length ? rawHeadings[i + 1].index : cleanHtml.length;
                const sectionHtml = cleanHtml.substring(start, end);
                const sectionText = sectionHtml
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const wordCount = sectionText.split(/\s+/).filter(w => w.length > 0).length;

                sections.push({
                    heading: rawHeadings[i].text,
                    content: sectionText.substring(0, 1500), // Keep first 1500 chars per section
                    wordCount,
                });
            }

            // Build heading nodes with word counts
            const headings: HeadingNode[] = rawHeadings.map((h, i) => {
                const section = sections[i];
                return {
                    level: h.level,
                    text: h.text,
                    wordCountBelow: section?.wordCount || 0,
                };
            });

            // Full text for word count
            const fullText = cleanHtml
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            // Extract FAQ questions (headings or content with ? patterns)
            const faqQuestions: string[] = [];
            for (const h of rawHeadings) {
                if (h.text.includes('?') || /^(what|how|why|when|where|which|who|is|can|does|do)\s/i.test(h.text)) {
                    faqQuestions.push(h.text);
                }
            }
            // Also find questions in content
            const contentQuestions = fullText.match(/[A-Z][^.!?]*\?/g) || [];
            faqQuestions.push(...contentQuestions.slice(0, 10));

            // Count tables
            const tableMatches = cleanHtml.match(/<table[\s\S]*?<\/table>/gi) || [];

            // Extract statistics (numbers with context)
            const statPatterns = fullText.match(/\d[\d,.]*%|\$[\d,.]+(?:\s*(?:million|billion|trillion))?|\d[\d,.]+\s*(?:million|billion|trillion|users|customers|companies|percent)/gi) || [];
            const statistics = [...new Set(statPatterns)].slice(0, 20);

            // Count links
            const internalLinks = (cleanHtml.match(/<a[^>]+href=["'][^"']*["']/gi) || [])
                .filter(a => {
                    try {
                        const href = a.match(/href=["']([^"']+)["']/)?.[1] || '';
                        return href.startsWith('/') || href.includes(new URL(url).hostname);
                    } catch { return false; }
                }).length;
            const allLinks = (cleanHtml.match(/<a[^>]+href=["']/gi) || []).length;

            // Count lists and images
            const listCount = (cleanHtml.match(/<(?:ul|ol)[\s\S]*?<\/(?:ul|ol)>/gi) || []).length;
            const imageCount = (cleanHtml.match(/<img\s/gi) || []).length;

            return {
                url,
                title,
                headings,
                sections,
                totalWordCount: fullText.split(/\s+/).filter(w => w.length > 0).length,
                faqQuestions: [...new Set(faqQuestions)].slice(0, 15),
                hasTables: tableMatches.length > 0,
                tableCount: tableMatches.length,
                statistics,
                internalLinkCount: internalLinks,
                externalLinkCount: Math.max(0, allLinks - internalLinks),
                listCount,
                imageCount,
            };
        } catch {
            return null;
        }
    }

    // ── Build Competitor Blueprint ─────────────────────────────

    async buildCompetitorBlueprint(
        competitors: DeepPageContent[],
        keyword: string
    ): Promise<CompetitorBlueprint> {
        if (competitors.length === 0) {
            return {
                consensusHeadings: [],
                uniqueAngles: [],
                keyStatistics: [],
                contentGaps: [],
                avgWordCount: 2000,
                avgSectionCount: 8,
                faqPatterns: [],
                tableTopics: [],
                snippetFormats: [],
                topCompetitorSections: [],
            };
        }

        // 1. Build consensus headings — headings that appear across multiple competitors
        const headingMap = new Map<string, { count: number; positions: number[] }>();
        for (const comp of competitors) {
            const h2s = comp.headings.filter(h => h.level === 2);
            h2s.forEach((h, idx) => {
                // Normalize heading text for comparison
                const normalized = h.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
                const key = normalized.split(/\s+/).slice(0, 5).join(' '); // First 5 words
                const existing = headingMap.get(key);
                if (existing) {
                    existing.count++;
                    existing.positions.push(idx);
                } else {
                    headingMap.set(key, { count: 1, positions: [idx] });
                }
            });
        }

        const consensusHeadings = Array.from(headingMap.entries())
            .map(([heading, data]) => ({
                heading,
                frequency: data.count,
                avgPosition: data.positions.reduce((a, b) => a + b, 0) / data.positions.length,
            }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 20);

        // 2. Collect all statistics with sources
        const statMap = new Map<string, { sources: string[]; count: number }>();
        for (const comp of competitors) {
            for (const stat of comp.statistics) {
                const key = stat.toLowerCase();
                const existing = statMap.get(key);
                if (existing) {
                    existing.count++;
                    if (!existing.sources.includes(comp.title)) {
                        existing.sources.push(comp.title);
                    }
                } else {
                    statMap.set(key, { sources: [comp.title], count: 1 });
                }
            }
        }

        const keyStatistics = Array.from(statMap.entries())
            .map(([stat, data]) => ({
                stat,
                source: data.sources[0],
                frequency: data.count,
            }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 15);

        // 3. Collect FAQ patterns
        const allFaqs: string[] = [];
        for (const comp of competitors) {
            allFaqs.push(...comp.faqQuestions);
        }
        const faqPatterns = [...new Set(allFaqs)].slice(0, 15);

        // 4. Averages
        const avgWordCount = Math.round(
            competitors.reduce((sum, c) => sum + c.totalWordCount, 0) / competitors.length
        );
        const avgSectionCount = Math.round(
            competitors.reduce((sum, c) => sum + c.headings.filter(h => h.level === 2).length, 0) / competitors.length
        );

        // 5. Extract top sections from top-3 rankers for excerpt use
        const topCompetitorSections: { heading: string; excerpt: string; source: string }[] = [];
        for (const comp of competitors.slice(0, 3)) {
            for (const section of comp.sections.filter(s => s.wordCount > 50).slice(0, 5)) {
                topCompetitorSections.push({
                    heading: section.heading,
                    excerpt: section.content.substring(0, 500),
                    source: comp.title,
                });
            }
        }

        // 6. Use AI to find content gaps and unique angles
        const ai = getAIRouter();
        let uniqueAngles: string[] = [];
        let contentGaps: string[] = [];
        let tableTopics: string[] = [];
        let snippetFormats: { type: string; keyword: string }[] = [];

        try {
            const competitorSummary = competitors.slice(0, 5).map((c, i) => {
                const h2s = c.headings.filter(h => h.level === 2).map(h => h.text);
                return `#${i + 1} "${c.title}" (${c.totalWordCount} words, ${h2s.length} sections)\nH2s: ${h2s.join(' | ')}\nHas tables: ${c.hasTables}, FAQs: ${c.faqQuestions.length}, Stats: ${c.statistics.slice(0, 5).join(', ')}`;
            }).join('\n\n');

            const analysisPrompt = `Analyze these top-ranking competitors for "${keyword}" and identify opportunities:

${competitorSummary}

Return JSON:
{
  "uniqueAngles": ["3-5 unique angles/perspectives NOT covered by most competitors that would differentiate our article"],
  "contentGaps": ["4-6 specific subtopics or questions that competitors miss or cover poorly"],
  "tableTopics": ["2-3 specific comparison topics that would benefit from a detailed table"],
  "snippetFormats": [{"type": "paragraph|list|table", "keyword": "the specific query this snippet would answer"}]
}`;

            const result = await ai.generate('blueprint_analysis', analysisPrompt, {
                systemPrompt: 'You are an SEO content strategist. Find gaps and opportunities. Respond in valid JSON only.',
                jsonMode: true,
                temperature: 0.4,
            });

            const parsed = JSON.parse(result);
            uniqueAngles = parsed.uniqueAngles || [];
            contentGaps = parsed.contentGaps || [];
            tableTopics = parsed.tableTopics || [];
            snippetFormats = parsed.snippetFormats || [];
        } catch {
            // Fallback: basic gap detection
            contentGaps = ['Detailed comparison', 'Real-world examples', 'Expert opinions', 'Cost analysis'];
            uniqueAngles = ['First-hand testing perspective', 'Data-driven recommendations'];
        }

        return {
            consensusHeadings,
            uniqueAngles,
            keyStatistics,
            contentGaps,
            avgWordCount,
            avgSectionCount,
            faqPatterns,
            tableTopics,
            snippetFormats,
            topCompetitorSections,
        };
    }

    // ── Legacy method (kept for backward compat) ───────────────

    async fetchPageContent(url: string): Promise<{
        html: string;
        text: string;
        headings: { level: number; text: string }[];
        wordCount: number;
    } | null> {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; RankMasterBot/1.0)',
                },
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) return null;

            const html = await response.text();

            const text = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
            const headings: { level: number; text: string }[] = [];
            let match;
            while ((match = headingRegex.exec(html)) !== null) {
                headings.push({
                    level: parseInt(match[1]),
                    text: match[2].replace(/<[^>]+>/g, '').trim(),
                });
            }

            return {
                html,
                text,
                headings,
                wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
            };
        } catch {
            return null;
        }
    }

    private looksLikeFeaturedSnippet(item: GoogleSearchItem): boolean {
        return (item.snippet?.length || 0) > 200;
    }

    isConfigured(): boolean {
        const isPlaceholder = (v: string) => !v || v.startsWith('your_') || v === 'placeholder';
        return !isPlaceholder(this.apiKey) && !isPlaceholder(this.searchEngineId);
    }
}

import { createSingleton } from '../singleton';

export const getSERPIntelligence = createSingleton(() => new SERPIntelligence());
