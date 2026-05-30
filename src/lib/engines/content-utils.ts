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
    /** Flesch-Kincaid grade ceiling — standard content (≈Flesch Reading Ease 55-70) */
    maxReadabilityGrade: 9,
    /** Flesch-Kincaid grade ceiling — beginner guides (≈Flesch Reading Ease 65-75) */
    maxReadabilityGradeBeginner: 8,
    /** Acceptable keyword density band (fraction of total words) */
    keywordDensityRange: [0.008, 0.015] as [number, number],
    /** Minimum share of H2s that must be question-format (AEO/AI Overview) */
    minQuestionH2Ratio: 0.3,
    /** Minimum share of H2 sections whose first paragraph is a self-contained 40-60 word passage */
    minSelfContainedPassageRatio: 0.6,
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
    /** Content type for type-specific writing rules in the prompt */
    contentType?: 'article' | 'review' | 'how_to' | 'listicle' | 'comparison' | 'alternatives' | 'beginner_guide' | 'problem_solution' | 'case_study' | 'news';
    /** Content tier for pillar/cluster/micro differentiation */
    contentLayer?: 'pillar' | 'supporting' | 'micro';
    /** LSI/semantic keywords to integrate naturally */
    lsiKeywords?: string[];
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
    /** Standard articles — increased from 1500 for better depth */
    normal: 1800,
    /** Cluster/pillar articles — increased from 3000 */
    cluster: 3500,
    /** Pillar content — comprehensive authority pieces */
    pillar: 4000,
    /** Supporting articles in a cluster */
    supporting: 1800,
    /** Micro content — focused single-question articles */
    micro: 800,
} as const;

// ── Search Intent Detection ────────────────────────────────────
// Unified intent classifier — single source of truth.
// Priority: navigational → commercial → transactional → informational
// Commercial before transactional because mixed signals ("best deals")
// more often indicate comparison intent.

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export function detectSearchIntent(keyword: string): SearchIntent {
    const kw = keyword.toLowerCase().trim();
    if (/\b(login|log in|sign in|signup|sign up|official|website|homepage|portal|dashboard)\b/i.test(kw)) return 'navigational';
    if (/\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives|recommended|rated)\b/i.test(kw)) return 'commercial';
    if (/\b(buy|purchase|order|price|pricing|discount|coupon|deal|cheap|affordable|sale|subscribe|shop)\b/i.test(kw)) return 'transactional';
    return 'informational';
}

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

// ── Content Config Validation ──────────────────────────────────
// Detects incompatible content-type × tier combinations that would
// produce contradictory word-count or structural instructions.

export interface ContentConfigWarning {
    type: 'incompatible' | 'conflict' | 'adjustment';
    message: string;
    autoFix?: { field: string; from: string; to: string };
}

/**
 * Validates that the chosen content type and content layer (tier) are
 * compatible. Returns an array of warnings; an empty array means the
 * config is clean.
 *
 * Consumers can inspect `autoFix` to silently correct the config or
 * surface the message to the user for manual resolution.
 */
export function validateContentConfig(params: {
    contentType: string;
    contentLayer?: string;
}): ContentConfigWarning[] {
    const warnings: ContentConfigWarning[] = [];
    const type = params.contentType;
    const tier = params.contentLayer || 'normal';

    // ── Incompatible: high-word-count types + micro tier ────────
    // These types require 2000+ words but micro targets 600-800.
    const highWordCountTypes = ['listicle', 'beginner_guide', 'comparison', 'alternatives'];
    if (tier === 'micro' && highWordCountTypes.includes(type)) {
        warnings.push({
            type: 'incompatible',
            message: `${type} content type requires 2000+ words but Micro tier targets 600-800 words. Content will be heavily truncated.`,
            autoFix: { field: 'contentLayer', from: 'micro', to: 'normal' },
        });
    }

    // ── Incompatible: case_study + micro ────────────────────────
    // The Challenge→Solution→Result framework cannot fit in 600-800 words.
    if (tier === 'micro' && type === 'case_study') {
        warnings.push({
            type: 'incompatible',
            message: 'Case Study requires Challenge→Solution→Result framework which cannot fit in Micro (600-800 words).',
            autoFix: { field: 'contentLayer', from: 'micro', to: 'normal' },
        });
    }

    // ── Conflict: news/trends + pillar ─────────────────────────
    // Pillar targets comprehensive evergreen content; news is ephemeral.
    if (tier === 'pillar' && type === 'news') {
        warnings.push({
            type: 'conflict',
            message: 'Pillar tier targets comprehensive evergreen content, but News/Trends content is ephemeral. Content will be generated as a Trend Analysis Report.',
        });
    }

    // ── Adjustment advisory: beginner_guide readability ────────
    // Beginner guides always override topic-based Flesch detection.
    if (type === 'beginner_guide') {
        warnings.push({
            type: 'adjustment',
            message: 'Beginner Guide always uses simple readability targets (Flesch 65+) regardless of topic complexity.',
        });
    }

    return warnings;
}
