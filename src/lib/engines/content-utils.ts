// ============================================================
// Content Writer — Shared Types, Constants & Utilities
// Extracted from content-writer.ts for modularity
// ============================================================

import { VideoMeta } from './media-engine';

// ── Quality Gate Thresholds ────────────────────────────────────
// Content below these thresholds triggers a targeted redo pass.
export const QUALITY_GATE = {
    minNaturalnessScore: 70,
    minFactualityScore: 70,
    maxRedoAttempts: 2,
    /** Sections with more banned-phrase hits than this get rewritten */
    maxAIPhrasesPerSection: 2,
} as const;

// ── Temperature Configuration ──────────────────────────────────
// Per-content-type temperature tuning. Lower = more consistent,
// higher = more creative. Based on content intent:
export const TEMPERATURE_CONFIG = {
    /** Informational, factual articles (default) */
    informational: 0.4,
    /** Listicles, comparisons, creative content */
    creative: 0.55,
    /** How-to guides, tutorials, reviews */
    procedural: 0.45,
    /** Section-level generation */
    section: 0.45,
    /** Conclusion writing */
    conclusion: 0.6,
    /** FAQ generation */
    faq: 0.5,
    /** Quality gate section rewriting */
    rewrite: 0.4,
    /** Sentence-level rewriting */
    sentenceRewrite: 0.35,
} as const;

/** Pick temperature based on keyword and content signals */
export function pickTemperature(keyword: string, type: keyof typeof TEMPERATURE_CONFIG = 'informational'): number {
    if (type !== 'informational') return TEMPERATURE_CONFIG[type];

    // Auto-detect content type from keyword
    const lk = keyword.toLowerCase();
    if (/\b(best|top|\d+|vs|compare|alternative)/i.test(lk)) return TEMPERATURE_CONFIG.creative;
    if (/\b(how to|guide|step|tutorial|setup|install)/i.test(lk)) return TEMPERATURE_CONFIG.procedural;
    return TEMPERATURE_CONFIG.informational;
}

// ── Exported Interfaces ────────────────────────────────────────

export interface ContentQualityMetrics {
    naturalnessScore: number;
    factualityScore: number;
    readabilityGrade: number;
    aiPhraseCount: number;
    qualityGatePasses: number;
    sentenceRewrites: number;
    timestamp: string;
}

export interface GeneratedContent {
    title: string;
    metaTitle: string;
    metaDescription: string;
    content: string;
    faqSection: { question: string; answer: string }[];
    schemaMarkup: Record<string, unknown>;
    suggestedInternalLinks: string[];
    suggestedExternalLinks: string[];
    qualityMetrics?: ContentQualityMetrics;
    videoMetas?: VideoMeta[];
}

export interface CompetitorInsight {
    avgWordCount: number;
    commonHeadings: string[];
    commonTopics: string[];
    contentGaps: string[];
    snippetOpportunities: string[];
    keyEntities: string[];
}

export interface ContentPromptOptions {
    keyword: string;
    competitorInsight: CompetitorInsight;
    targetWordCount: number;
    niche?: string;
    tone?: 'professional' | 'casual' | 'authoritative';
    existingPosts?: string[];
    language?: string;
    paaQuestions?: string[];
    authorName?: string;
    authorBio?: string;
    isCluster?: boolean;
    minWordCount?: number;
}

// ── Template Variation Engine ──────────────────────────────────
// Randomizes structural ordering to prevent algorithmic fingerprinting

export function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function getTemplateVariation() {
    return {
        // Vary FAQ count between 5-8
        faqCount: 5 + Math.floor(Math.random() * 4),
        // Vary Key Takeaways position
        takeawaysPosition: pickRandom(['after_intro', 'before_conclusion'] as const),
        // Vary Author Box position
        authorBoxPosition: pickRandom(['top_after_h1', 'bottom_before_sources'] as const),
        // Vary Key Takeaways format
        takeawaysFormat: pickRandom(['bullets', 'numbered', 'callout_box'] as const),
        // Vary section count
        h2Count: pickRandom([5, 6, 7, 8]),
        // Vary image count
        imageCount: 3 + Math.floor(Math.random() * 3),
    };
}

// ── Word Count Minimums ────────────────────────────────────────
// Strict enforcement: articles MUST meet these thresholds

export const WORD_COUNT_MINIMUMS = {
    normal: 1500,
    cluster: 3000,
} as const;

// Utility to count words in HTML content
export function countWordsInHTML(html: string): number {
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&\w+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.split(/\s+/).filter(w => w.length > 0).length;
}
