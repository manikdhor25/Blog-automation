// ============================================================
// RankMaster Pro - Factuality Guardrails Engine
// Scans AI-generated content for unverifiable claims, synthetic
// statistics, and missing citations. Returns warnings + fixes.
// ============================================================

import { getAIRouter } from '@/lib/ai/router';
import { logger } from '@/lib/logger';

export interface FactualityIssue {
    type: 'unverified_stat' | 'vague_claim' | 'missing_citation' | 'synthetic_data' | 'absolute_claim';
    severity: 'high' | 'medium' | 'low';
    text: string;           // The problematic text excerpt
    suggestion: string;     // Recommended fix
    lineHint?: string;      // Nearby heading or context
}

export interface FactualityReport {
    score: number;           // 0-100 (100 = fully factual)
    issues: FactualityIssue[];
    disclaimers: string[];   // Suggested disclaimers to add
    summary: string;
}

// ── Pattern-based detectors (fast, no AI needed) ──────────────

const STAT_PATTERNS = [
    /\b(\d{1,3})%\s+of\s+\w+/gi,                         // "73% of marketers"
    /\b(studies|research|data)\s+show(s)?\s+that\b/gi,    // "studies show that"
    /\baccording to\s+(recent\s+)?(studies|research|data|reports|experts)\b/gi,
    /\b(in|by)\s+\d{4},?\s+\w+/gi,                       // "In 2023, Google..."
    /\b(over|more than|nearly|approximately|about)\s+\d[\d,.]+\s+(million|billion|thousand|percent)/gi,
    /\b\d[\d,.]+\s+(million|billion|trillion)\s+(users|people|searches|results)/gi,
];

const VAGUE_AUTHORITY = [
    /\bexperts\s+(say|agree|recommend|suggest|believe)\b/gi,
    /\b(many|most|some)\s+(experts|professionals|studies|researchers)\b/gi,
    /\bit('s| is)\s+(well[- ])?known\s+that\b/gi,
    /\beveryone\s+knows\s+that\b/gi,
    /\bscientifically\s+proven\b/gi,
];

const ABSOLUTE_CLAIMS = [
    /\balways\s+(results?|leads?|causes?|works?)\b/gi,
    /\bnever\s+(fails?|causes?|results?)\b/gi,
    /\bguaranteed?\s+to\b/gi,
    /\bthe\s+(best|only|fastest|cheapest|most\s+effective)\s+(way|method|tool|solution)\b/gi,
];

function extractContext(content: string, matchIndex: number): string {
    // Find nearest heading before the match
    const before = content.substring(0, matchIndex);
    const headingMatch = before.match(/<h[2-4][^>]*>(.*?)<\/h[2-4]>/gi);
    if (headingMatch) {
        const lastHeading = headingMatch[headingMatch.length - 1]
            .replace(/<[^>]+>/g, '').trim();
        return `Under "${lastHeading}"`;
    }
    return '';
}

function patternScan(content: string): FactualityIssue[] {
    const plainText = content.replace(/<[^>]+>/g, ' ');
    const issues: FactualityIssue[] = [];

    // Check for unverified statistics
    for (const pattern of STAT_PATTERNS) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(plainText)) !== null) {
            // Check if there's a citation nearby (link within 200 chars)
            const nearby = content.substring(
                Math.max(0, match.index - 50),
                Math.min(content.length, match.index + match[0].length + 200)
            );
            const hasCitation = /<a\s+href/i.test(nearby) || /\[source\]/i.test(nearby);

            if (!hasCitation) {
                issues.push({
                    type: 'unverified_stat',
                    severity: 'high',
                    text: match[0].trim(),
                    suggestion: `Add a source link: "${match[0].trim()} [Source](URL)" or rephrase without specific numbers`,
                    lineHint: extractContext(content, match.index),
                });
            }
        }
    }

    // Check vague authority claims
    for (const pattern of VAGUE_AUTHORITY) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(plainText)) !== null) {
            issues.push({
                type: 'vague_claim',
                severity: 'medium',
                text: match[0].trim(),
                suggestion: 'Name specific experts or cite specific studies instead of vague appeals to authority',
                lineHint: extractContext(content, match.index),
            });
        }
    }

    // Check absolute claims
    for (const pattern of ABSOLUTE_CLAIMS) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(plainText)) !== null) {
            issues.push({
                type: 'absolute_claim',
                severity: 'low',
                text: match[0].trim(),
                suggestion: 'Soften absolute language — use "often", "typically", or "in most cases" instead',
                lineHint: extractContext(content, match.index),
            });
        }
    }

    return issues;
}

// ── AI-powered deep analysis (optional, more thorough) ───────

async function aiFactCheck(content: string, keyword: string): Promise<FactualityIssue[]> {
    try {
        const ai = getAIRouter();
        const plainText = content.replace(/<[^>]+>/g, ' ').substring(0, 6000);

        const prompt = `Analyze this content about "${keyword}" for factual accuracy issues.

Content:
${plainText}

Find:
1. Statistics without sources (specific numbers, percentages)
2. Claims presented as fact that may be fabricated by AI
3. Outdated information (check year references)
4. Unverifiable superlatives ("best", "most popular", "leading")

Return JSON array:
[{
  "type": "unverified_stat" | "synthetic_data" | "vague_claim" | "missing_citation",
  "severity": "high" | "medium" | "low",
  "text": "exact problematic text",
  "suggestion": "how to fix it"
}]

Return ONLY factual issues, not style issues. If content looks factual, return [].`;

        const result = await ai.generate('content_scoring', prompt, {
            systemPrompt: 'You are a fact-checker. Identify unverifiable claims in AI-generated content. Be strict but fair. Return valid JSON array only.',
            jsonMode: true,
            temperature: 0.1,
        });

        const parsed = JSON.parse(result);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        logger.warn('AI fact-check failed, falling back to pattern-only', {}, error);
        return [];
    }
}

// ── Main API ─────────────────────────────────────────────────

/**
 * Run factuality guardrails on content. Combines fast regex patterns
 * with optional AI deep-check for comprehensive coverage.
 */
export async function checkFactuality(
    content: string,
    keyword: string,
    options?: { deepCheck?: boolean }
): Promise<FactualityReport> {
    const log = logger.child({ engine: 'factuality', keyword });

    // Fast pattern scan (always runs)
    const patternIssues = patternScan(content);

    // Optional AI deep check
    let aiIssues: FactualityIssue[] = [];
    if (options?.deepCheck) {
        aiIssues = await aiFactCheck(content, keyword);
    }

    // Deduplicate by text similarity
    const allIssues = [...patternIssues];
    for (const ai of aiIssues) {
        const isDuplicate = patternIssues.some(p =>
            p.text.toLowerCase().includes(ai.text.toLowerCase().substring(0, 20)) ||
            ai.text.toLowerCase().includes(p.text.toLowerCase().substring(0, 20))
        );
        if (!isDuplicate) allIssues.push(ai);
    }

    // Calculate score
    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const medCount = allIssues.filter(i => i.severity === 'medium').length;
    const lowCount = allIssues.filter(i => i.severity === 'low').length;
    const penalty = highCount * 12 + medCount * 5 + lowCount * 2;
    const score = Math.max(0, Math.min(100, 100 - penalty));

    // Generate disclaimers
    const disclaimers: string[] = [];
    if (highCount > 0) {
        disclaimers.push('⚠️ This article contains AI-generated statistics that may require verification.');
    }
    if (allIssues.some(i => i.type === 'synthetic_data')) {
        disclaimers.push('📊 Some data points in this article are AI-estimated and may not reflect real-world figures.');
    }
    if (medCount > 2) {
        disclaimers.push('ℹ️ Claims in this article should be independently verified before citation.');
    }

    const summary = score >= 90
        ? 'Content appears factually sound with minimal issues.'
        : score >= 70
            ? `Content has ${allIssues.length} factuality concerns that should be reviewed.`
            : `Content has ${highCount} high-severity factual issues requiring attention before publishing.`;

    log.info('Factuality check complete', { score, issues: allIssues.length, highCount });

    return { score, issues: allIssues, disclaimers, summary };
}
