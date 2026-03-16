// ============================================================
// Content Writer — Quality Gate
// Scores content and rewrites weak sections to meet thresholds
// Extracted from ContentWriter class for modularity
// ============================================================

import { getAIRouter } from '../ai/router';
import { HUMAN_STYLE_SYSTEM_PROMPT, HUMAN_STYLE_CONTENT_RULES, cleanAIPatterns, rewriteRoboticSentences } from './human-writing-rules';
import { scoreNaturalness, NaturalnessReport } from './naturalness-scorer';
import { checkFactuality, FactualityReport } from './factuality-checker';
import { QUALITY_GATE, ContentQualityMetrics } from './content-utils';

// ── QUALITY GATE ──────────────────────────────────────────────
// Scores content after generation. If naturalness or factuality
// is below threshold, finds the weakest H2 section and rewrites it.
// Runs up to QUALITY_GATE.maxRedoAttempts times.
// Returns content + quality metrics for monitoring.
export async function runQualityGate(
    content: string,
    keyword: string,
    language: string
): Promise<{ content: string; metrics: ContentQualityMetrics }> {
    let gatePasses = 0;
    let lastNaturalness: NaturalnessReport | null = null;
    let lastFactuality: FactualityReport | null = null;

    for (let attempt = 0; attempt < QUALITY_GATE.maxRedoAttempts; attempt++) {
        // 1. Score naturalness
        const naturalness: NaturalnessReport = scoreNaturalness(content);
        lastNaturalness = naturalness;

        // 2. Score factuality (pattern-only for speed; no AI deep check in the loop)
        let factuality: FactualityReport;
        try {
            factuality = await checkFactuality(content, keyword, { deepCheck: false });
        } catch (factErr) {
            // If factuality checker fails, assign cautious score instead of silently passing
            console.warn('[QualityGate] Factuality checker failed — assigning cautious score:', factErr);
            factuality = { score: 50, issues: [{ type: 'vague_claim' as const, severity: 'medium' as const, text: 'Factuality check unavailable', suggestion: 'Manually review factual claims before publishing' }], disclaimers: ['⚠️ Factuality check could not complete — manual review recommended.'], summary: 'Factuality check failed; content not verified.' };
        }
        lastFactuality = factuality;

        const passesNaturalness = naturalness.score >= QUALITY_GATE.minNaturalnessScore;
        const passesFactuality = factuality.score >= QUALITY_GATE.minFactualityScore;

        if (passesNaturalness && passesFactuality) {
            if (attempt > 0) {
                console.log(`[QualityGate] Passed after ${attempt} redo(s) — naturalness: ${naturalness.score}, factuality: ${factuality.score}`);
            }
            gatePasses = attempt;
            break;
        }

        console.warn(
            `[QualityGate] Attempt ${attempt + 1}/${QUALITY_GATE.maxRedoAttempts} — ` +
            `naturalness: ${naturalness.score}/${QUALITY_GATE.minNaturalnessScore}, ` +
            `factuality: ${factuality.score}/${QUALITY_GATE.minFactualityScore}`
        );

        // 3. Find the weakest H2 section to rewrite
        const weakestSection = findWeakestSection(content, naturalness);
        if (!weakestSection) break; // Can't identify a section to fix

        // 4. Rewrite just that section
        const langNote = language !== 'en' ? ` Write in ${language}.` : '';
        const issues = [
            ...naturalness.issues.slice(0, 3),
            ...factuality.issues.slice(0, 3).map(i => `Factual issue: "${i.text}" — ${i.suggestion}`),
        ];

        const redoPrompt = `Rewrite this section of an article about "${keyword}". Fix the quality issues listed below.

SECTION TO REWRITE:
${weakestSection.html}

QUALITY ISSUES TO FIX:
${issues.map(i => `- ${i}`).join('\n')}

RULES:
- Keep the same H2 heading and H3 subheadings
- Fix ALL listed quality issues
- Use short sentences (under 18 words mostly), contractions, and simple vocabulary
- Do NOT use: "Moreover", "Furthermore", "Additionally", "In conclusion", "delve into", "leverage", "seamless"
- Every statistic must have a source attribution
- Return HTML ONLY (h2, h3, p, ul, ol, li, strong, a, table)${langNote}
${HUMAN_STYLE_CONTENT_RULES}`;

        try {
            const ai = getAIRouter();
            let rewritten = await ai.generate('section_writing', redoPrompt, {
                systemPrompt: `${HUMAN_STYLE_SYSTEM_PROMPT} You are rewriting a single section to fix quality issues. Keep the same structure but improve naturalness and factual accuracy. Return valid HTML only.`,
                temperature: 0.4, // Lower temp for controlled rewriting
                maxTokens: 2048,
            });
            rewritten = cleanAIPatterns(rewritten);

            // Replace the weak section in the full content
            if (rewritten && rewritten.trim().length > 50) {
                const previousContent = content;
                content = content.replace(weakestSection.html, rewritten.trim());

                // C2 FIX: Verify the replace actually changed the content.
                // If cleanAIPatterns mutated the section between scoring and replacing,
                // the original string won't match and replace() silently does nothing.
                if (content === previousContent) {
                    console.warn(
                        `[QualityGate] Section replace failed — weakest section HTML no longer matches content. ` +
                        `Heading: "${weakestSection.heading}". Stopping retries.`
                    );
                    break;
                }
            }
        } catch (error) {
            console.error(`[QualityGate] Section rewrite failed:`, error);
            break; // Don't retry on error
        }

        gatePasses = attempt + 1;
    }

    // Final naturalness cleanup pass
    content = cleanAIPatterns(content);

    // Sentence-level rewriting: catch individual robotic sentences
    let sentenceRewrites = 0;
    try {
        const ai = getAIRouter();
        const { identifyRoboticSentences } = await import('./human-writing-rules');
        sentenceRewrites = identifyRoboticSentences(content).length;

        content = await rewriteRoboticSentences(content, (prompt) =>
            ai.generate('section_writing', prompt, {
                systemPrompt: 'You are rewriting individual sentences to sound natural and conversational. Return only the rewritten sentences, numbered to match.',
                temperature: 0.35,
                maxTokens: 1024,
            })
        );
    } catch {
        // Sentence rewriting is best-effort; don't block on failure
    }

    // Re-score AFTER all rewrites for accurate final metrics
    const finalNaturalness = scoreNaturalness(content);

    // DIAGNOSTIC: Check for content depth signals (frameworks, examples, research)
    const hasFrameworks = /\b(framework|model|method|system|process|approach|strategy|step by step)\b/i.test(content);
    const hasExamples = /\b(example|for instance|for example|such as|like|including)\b/i.test(content);
    const hasResearch = /\b(study|research|survey|statistics|data|percent|%|according to|found that)\b/i.test(content);
    const hasActionable = /\b(how to|try this|start with|begin|implement|follow these|recommend|should|must)\b/i.test(content);

    console.log(`[ContentDepth] Blueprint validation - frameworks: ${hasFrameworks}, examples: ${hasExamples}, research: ${hasResearch}, actionable: ${hasActionable}`);
    if (!hasFrameworks || !hasExamples || !hasResearch) {
        console.warn(`[ContentDepth] ⚠️ MISSING CONTENT DEPTH SIGNALS - Article may not meet Step 6/7 requirements`);
    }

    const metrics: ContentQualityMetrics = {
        naturalnessScore: finalNaturalness.score,
        factualityScore: lastFactuality?.score ?? 100,
        readabilityGrade: finalNaturalness.readabilityGrade,
        aiPhraseCount: finalNaturalness.aiPhraseCount,
        qualityGatePasses: gatePasses,
        sentenceRewrites,
        timestamp: new Date().toISOString(),
    };

    console.log(
        `[QualityMetrics] naturalness=${metrics.naturalnessScore} ` +
        `factuality=${metrics.factualityScore} readability=${metrics.readabilityGrade} ` +
        `aiPhrases=${metrics.aiPhraseCount} gatePasses=${metrics.qualityGatePasses} ` +
        `sentenceRewrites=${metrics.sentenceRewrites}`
    );

    return { content, metrics };
}

// Find the H2 section with the worst naturalness characteristics
export function findWeakestSection(
    content: string,
    naturalness: NaturalnessReport
): { html: string; heading: string } | null {
    // Split content into H2 sections
    const sectionRegex = /(<h2[^>]*>[\s\S]*?)(?=<h2[^>]*>|$)/gi;
    const sections: { html: string; heading: string }[] = [];
    let match;

    while ((match = sectionRegex.exec(content)) !== null) {
        const headingMatch = match[1].match(/<h2[^>]*>(.*?)<\/h2>/i);
        if (headingMatch) {
            sections.push({
                html: match[1].trim(),
                heading: headingMatch[1].replace(/<[^>]+>/g, '').trim(),
            });
        }
    }

    if (sections.length === 0) return null;

    // Skip structural sections (TOC, Key Takeaways, FAQ, Sources)
    const skipPatterns = /table of contents|key takeaway|faq|frequently asked|sources|references/i;
    const scorableSections = sections.filter(s => !skipPatterns.test(s.heading));
    if (scorableSections.length === 0) return null;

    // Score each section individually and return the worst
    let worstScore = Infinity;
    let worstSection: { html: string; heading: string } | null = null;

    for (const section of scorableSections) {
        const sectionNaturalness = scoreNaturalness(section.html);
        if (sectionNaturalness.score < worstScore) {
            worstScore = sectionNaturalness.score;
            worstSection = section;
        }
    }

    return worstSection;
}
