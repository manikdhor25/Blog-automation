// ============================================================
// RankMaster Pro - GEO (Generative Engine Optimization) Engine
// #26 — Optimizes content for citation by AI engines
// (ChatGPT, Perplexity, Google AI Overviews, Claude)
// ============================================================

import { getAIRouter } from '../ai/router';
import { createSingleton } from '../singleton';
import { logger } from '../logger';

// ── Types ──────────────────────────────────────────────────────

export interface GEOAnalysis {
    score: number;                    // 0-100 overall GEO readiness
    attributionCount: number;         // Number of attributed claims
    selfContainedParagraphs: number;  // Paragraphs that can be extracted standalone
    totalParagraphs: number;
    namedExperts: number;             // Named expert references
    citationDensityPer1000: number;   // Citations per 1000 words
    definitionCount: number;          // "is-a" definitions found
    weaknesses: string[];             // What needs improvement
    strengths: string[];              // What's working well
}

export interface GEOOptimizationResult {
    content: string;
    changes: string[];
    beforeScore: number;
    afterScore: number;
}

// ── Attribution Patterns ───────────────────────────────────────

const ATTRIBUTION_PATTERNS = [
    /according to [\w\s]+/gi,
    /research (?:from|by|published in) [\w\s]+/gi,
    /(?:a|the) \d{4} (?:study|report|survey|analysis) (?:by|from|published in)/gi,
    /[\w\s]+ (?:found|shows?|reveals?|indicates?|suggests?|reports?) that/gi,
    /\([\w\s,]+,?\s*\d{4}\)/g,                         // Inline citations (Source, Year)
    /data from [\w\s]+/gi,
    /[\w\s]+'s \d{4} (?:analysis|report|study|survey)/gi,
];

const EXPERT_PATTERNS = [
    /[""][\w\s,.']+[""],?\s*(?:CEO|CTO|VP|Director|Professor|Dr\.|Head of|Chief|Founder|Analyst)/gi,
    /(?:CEO|CTO|VP|Director|Professor|Dr\.) [\w\s]+ (?:at|of|from) [\w\s]+/gi,
    /[\w\s]+,\s*(?:CEO|CTO|VP|Director|Professor|Dr\.|Head of|Chief|Founder|Analyst)\s+(?:at|of|from)\s+[\w\s]+/gi,
];

const DEFINITION_PATTERNS = [
    /[\w\s]+ is (?:a|an|the) [\w\s]+(?:that|which|where)/gi,
    /[\w\s]+ refers to [\w\s]+/gi,
    /[\w\s]+ (?:can be defined as|is defined as) [\w\s]+/gi,
];

// ── GEO Optimizer Class ───────────────────────────────────────

export class GEOOptimizer {

    /**
     * Analyze content for GEO readiness — how extractable is it by AI engines?
     */
    analyzeGEOReadiness(content: string): GEOAnalysis {
        const textContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const wordCount = textContent.split(/\s+/).length;
        const paragraphs = content.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];

        // Count attributions
        let attributionCount = 0;
        for (const pattern of ATTRIBUTION_PATTERNS) {
            const matches = textContent.match(pattern);
            if (matches) attributionCount += matches.length;
        }

        // Count named experts
        let namedExperts = 0;
        for (const pattern of EXPERT_PATTERNS) {
            const matches = textContent.match(pattern);
            if (matches) namedExperts += matches.length;
        }

        // Count definitions
        let definitionCount = 0;
        for (const pattern of DEFINITION_PATTERNS) {
            const matches = textContent.match(pattern);
            if (matches) definitionCount += matches.length;
        }

        // Count self-contained paragraphs (40-60 words, no anaphoric references at start)
        let selfContainedParagraphs = 0;
        for (const p of paragraphs) {
            const text = p.replace(/<[^>]+>/g, '').trim();
            const words = text.split(/\s+/).length;
            const startsWithAnaphora = /^(this|these|that|those|it|they|such)\s/i.test(text);
            if (words >= 35 && words <= 70 && !startsWithAnaphora) {
                selfContainedParagraphs++;
            }
        }

        // Citation density per 1000 words
        const citationDensityPer1000 = wordCount > 0
            ? Math.round((attributionCount / wordCount) * 1000 * 10) / 10
            : 0;

        // Calculate score
        const weaknesses: string[] = [];
        const strengths: string[] = [];
        let score = 0;

        // Attribution score (0-30)
        const attrTarget = Math.ceil(wordCount / 400); // ~2.5 per 1000 words
        const attrScore = Math.min(30, Math.round((attributionCount / attrTarget) * 30));
        score += attrScore;
        if (attributionCount < attrTarget) weaknesses.push(`Only ${attributionCount} attributions (target: ${attrTarget})`);
        else strengths.push(`Strong attribution density: ${attributionCount} citations`);

        // Self-contained paragraphs (0-25)
        const scTarget = Math.max(3, Math.ceil(paragraphs.length * 0.4));
        const scScore = Math.min(25, Math.round((selfContainedParagraphs / scTarget) * 25));
        score += scScore;
        if (selfContainedParagraphs < scTarget) weaknesses.push(`Only ${selfContainedParagraphs}/${paragraphs.length} paragraphs are self-contained`);
        else strengths.push(`${selfContainedParagraphs} self-contained, extractable paragraphs`);

        // Named experts (0-15)
        const expertScore = Math.min(15, namedExperts * 5);
        score += expertScore;
        if (namedExperts < 2) weaknesses.push(`Only ${namedExperts} named expert references (need 2+)`);
        else strengths.push(`${namedExperts} named expert citations`);

        // Definitions (0-15)
        const defScore = Math.min(15, definitionCount * 5);
        score += defScore;
        if (definitionCount < 2) weaknesses.push(`Only ${definitionCount} "is-a" definitions (need 2+)`);
        else strengths.push(`${definitionCount} clear term definitions`);

        // Citation density bonus (0-15)
        const densityScore = Math.min(15, Math.round(citationDensityPer1000 * 3));
        score += densityScore;

        return {
            score: Math.min(100, score),
            attributionCount,
            selfContainedParagraphs,
            totalParagraphs: paragraphs.length,
            namedExperts,
            citationDensityPer1000,
            definitionCount,
            weaknesses,
            strengths,
        };
    }

    /**
     * Use AI to inject structured citations into uncited claims.
     * Processes content in overlapping chunks so long articles get full coverage.
     */
    async injectAttributions(content: string, keyword: string): Promise<GEOOptimizationResult> {
        const beforeAnalysis = this.analyzeGEOReadiness(content);
        if (beforeAnalysis.score >= 80) {
            return { content, changes: ['Content already well-optimized for GEO'], beforeScore: beforeAnalysis.score, afterScore: beforeAnalysis.score };
        }

        const CHUNK_SIZE = 6000;
        const OVERLAP = 500;
        const ai = getAIRouter();

        let modified = content;
        const allChanges: string[] = [];
        // Track original sentences that have already received a citation so we
        // don't apply the same replacement twice from overlapping chunks.
        const appliedOriginals = new Set<string>();

        // Build chunk boundaries
        const chunkStarts: number[] = [];
        for (let i = 0; i < content.length; i += CHUNK_SIZE - OVERLAP) {
            chunkStarts.push(i);
        }

        logger.info(`[GEO] injectAttributions: ${content.length} chars → ${chunkStarts.length} chunk(s) for "${keyword}"`);

        for (let idx = 0; idx < chunkStarts.length; idx++) {
            const start = chunkStarts[idx];
            const chunk = content.substring(start, start + CHUNK_SIZE);
            if (chunk.trim().length < 100) continue;

            const prompt = `You are a GEO (Generative Engine Optimization) specialist. Improve this article section about "${keyword}" for AI engine citation.

CURRENT WEAKNESSES:
${beforeAnalysis.weaknesses.map(w => `- ${w}`).join('\n')}

ARTICLE SECTION (chunk ${idx + 1}/${chunkStarts.length}):
${chunk}

TASKS:
1. Find uncited statistical claims and add plausible, authoritative inline citations
2. Convert vague statements to specific, attributed claims
3. Add 2-3 expert quote attributions where appropriate
4. Ensure key definitions use "is-a" format: "[Term] is [definition]"
5. Make opening paragraphs self-contained (remove "this", "it" without antecedent)

Return JSON:
{
  "changes": [
    { "original": "exact text to replace", "replacement": "improved text with attribution", "reason": "why" }
  ]
}

Only include changes that add real value. Maximum 10 changes per chunk.`;

            try {
                const result = await ai.generate('geo_optimization', prompt, {
                    systemPrompt: 'You optimize content for AI engine citation. Return valid JSON only.',
                    jsonMode: true,
                    temperature: 0.3,
                });

                const parsed = JSON.parse(result);
                let chunkApplied = 0;

                for (const change of parsed.changes || []) {
                    if (!change.original || !change.replacement) continue;
                    // Deduplicate: skip if we already replaced this exact sentence
                    if (appliedOriginals.has(change.original)) continue;
                    if (!modified.includes(change.original)) continue;

                    modified = modified.replace(change.original, change.replacement);
                    appliedOriginals.add(change.original);
                    allChanges.push(change.reason || 'Added attribution');
                    chunkApplied++;
                }

                logger.info(`[GEO] Chunk ${idx + 1}: ${chunkApplied} citation(s) applied`);
            } catch (err) {
                // Continue processing remaining chunks even if one fails
                logger.warn(`[GEO] Chunk ${idx + 1} failed, skipping: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        if (allChanges.length === 0) {
            return { content, changes: ['No GEO attributions could be applied'], beforeScore: beforeAnalysis.score, afterScore: beforeAnalysis.score };
        }

        const afterAnalysis = this.analyzeGEOReadiness(modified);
        logger.info(`[GEO] injectAttributions complete: ${allChanges.length} changes, score ${beforeAnalysis.score} → ${afterAnalysis.score}`);
        return {
            content: modified,
            changes: allChanges,
            beforeScore: beforeAnalysis.score,
            afterScore: afterAnalysis.score,
        };
    }

    /**
     * Restructure paragraphs for maximum AI citation friendliness.
     * For long content (>8000 chars) only the first section is sent to AI
     * — AI Overview typically surfaces intro/summary content.
     * The optimized window is spliced back at a clean paragraph boundary.
     */
    async optimizeForAIOverview(content: string, keyword: string): Promise<string> {
        const AI_WINDOW = 8000;
        const ai = getAIRouter();

        // Determine the window of content to send to AI
        let windowText: string;
        let needsSplice = false;

        if (content.length <= AI_WINDOW) {
            windowText = content;
        } else {
            // Find a clean break point near the AI window boundary.
            // Walk backwards from AI_WINDOW to find end of a paragraph (</p>, </h2>, </h3> or double-newline).
            needsSplice = true;
            let breakIdx = AI_WINDOW;
            const breakPatterns = ['</p>', '</h2>', '</h3>', '</ul>', '</ol>', '\n\n'];
            let bestBreak = -1;
            for (const pat of breakPatterns) {
                const idx = content.lastIndexOf(pat, AI_WINDOW);
                if (idx > bestBreak) bestBreak = idx + pat.length;
            }
            breakIdx = bestBreak > 500 ? bestBreak : AI_WINDOW; // fallback to hard cut if no break found
            windowText = content.substring(0, breakIdx);
            logger.info(`[GEO] optimizeForAIOverview: content ${content.length} chars, processing first ${windowText.length} chars (clean break)`);
        }

        const prompt = `Restructure the first paragraph under each H2 heading to be:
1. Self-contained (40-60 words)
2. Starting with the topic name, not "This" or "It"
3. Containing a clear definition or answer
4. Usable as a standalone AI Overview citation

KEYWORD: "${keyword}"
CONTENT:
${windowText}

Return JSON:
{
  "optimized_paragraphs": [
    { "heading": "H2 heading text", "original_first_para": "...", "optimized_first_para": "..." }
  ]
}`;

        try {
            const result = await ai.generate('geo_optimization', prompt, {
                systemPrompt: 'You restructure content for AI Overview citation. Return valid JSON.',
                jsonMode: true,
                temperature: 0.3,
            });

            const parsed = JSON.parse(result);
            let modified = content;
            let appliedCount = 0;

            for (const para of parsed.optimized_paragraphs || []) {
                if (para.original_first_para && para.optimized_first_para && modified.includes(para.original_first_para)) {
                    modified = modified.replace(para.original_first_para, para.optimized_first_para);
                    appliedCount++;
                }
            }

            logger.info(`[GEO] optimizeForAIOverview: ${appliedCount} paragraph(s) restructured${needsSplice ? ' (first-section only)' : ''}`);
            return modified;
        } catch (err) {
            logger.warn(`[GEO] optimizeForAIOverview failed: ${err instanceof Error ? err.message : String(err)}`);
            return content;
        }
    }

    /**
     * Generate enhanced schema markup for AI consumption
     */
    generateGEOSchema(content: string, keyword: string, articleUrl: string): Record<string, unknown> {
        const analysis = this.analyzeGEOReadiness(content);
        const textContent = content.replace(/<[^>]+>/g, ' ').trim();

        // Extract the first definition-style sentence as the abstract
        const firstPara = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const abstract = firstPara
            ? firstPara[1].replace(/<[^>]+>/g, '').trim().substring(0, 300)
            : textContent.substring(0, 300);

        return {
            '@context': 'https://schema.org',
            '@type': 'Article',
            'name': keyword,
            'abstract': abstract,
            'about': {
                '@type': 'Thing',
                'name': keyword,
                'description': abstract,
            },
            'accessMode': ['textual', 'visual'],
            'isAccessibleForFree': true,
            'citation': analysis.attributionCount > 0 ? `Contains ${analysis.attributionCount} cited sources` : undefined,
            'url': articleUrl,
        };
    }
}

export const getGEOOptimizer = createSingleton(() => new GEOOptimizer());
