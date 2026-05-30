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
import { logger } from '../logger';

// ── #6: Snippet Verification ──────────────────────────────────
// Checks that first paragraph under each H2 is self-contained (40-60 words)
export function verifySnippetReadiness(content: string): { score: number; issues: string[] } {
    const h2Sections = content.split(/<h2[^>]*>/gi);
    let selfContained = 0;
    let total = 0;
    const issues: string[] = [];

    for (let i = 1; i < h2Sections.length; i++) {
        const headingMatch = h2Sections[i].match(/^(.*?)<\/h2>/i);
        const firstPara = h2Sections[i].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        if (!firstPara) continue;

        total++;
        const text = firstPara[1].replace(/<[^>]+>/g, '').trim();
        const words = text.split(/\s+/).length;
        const startsWithAnaphora = /^(this|these|that|those|it|they|such|as mentioned)\b/i.test(text);

        // 40-60 words: single self-contained passage standard, aligned with the
        // FAQ/snippet instruction across all prompt paths.
        if (words >= 40 && words <= 60 && !startsWithAnaphora) {
            selfContained++;
        } else {
            const heading = headingMatch ? headingMatch[1].replace(/<[^>]+>/g, '').trim() : `Section ${i}`;
            if (startsWithAnaphora) {
                issues.push(`"${heading}": First paragraph starts with anaphoric reference`);
            } else if (words < 40) {
                issues.push(`"${heading}": First paragraph too short (${words} words, need 40-60)`);
            } else if (words > 60) {
                issues.push(`"${heading}": First paragraph too long (${words} words, need 40-60)`);
            }
        }
    }

    const score = total > 0 ? Math.round((selfContained / total) * 100) : 100;
    return { score, issues };
}

// ── #7: GEO Attribution Check ─────────────────────────────────
// Validates that content has sufficient attributed claims
export function checkGEOAttribution(content: string): { score: number; attributionCount: number; issues: string[] } {
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = plainText.split(/\s+/).length;
    const issues: string[] = [];

    // Count attribution patterns
    const patterns = [
        /according to [\w\s]+/gi,
        /research (?:from|by|published in) [\w\s]+/gi,
        /(?:a|the) \d{4} (?:study|report|survey|analysis)/gi,
        /\([\w\s,]+,?\s*\d{4}\)/g,
        /data from [\w\s]+/gi,
        /[\w\s]+'s \d{4} (?:analysis|report|study)/gi,
    ];

    let attributionCount = 0;
    for (const pattern of patterns) {
        const matches = plainText.match(pattern);
        if (matches) attributionCount += matches.length;
    }

    const densityPer1000 = wordCount > 0 ? (attributionCount / wordCount) * 1000 : 0;
    const targetAttributions = Math.ceil(wordCount / 400); // ~2.5 per 1000 words

    if (attributionCount < targetAttributions) {
        issues.push(`Only ${attributionCount} attributions (target: ${targetAttributions}). Add "Research from [Source] shows..." or inline citations.`);
    }
    if (densityPer1000 < 1.5) {
        issues.push(`Citation density ${densityPer1000.toFixed(1)}/1000 words (target: 2.5+). Add more inline citations.`);
    }

    // Check for orphaned statistics
    const stats = plainText.match(/\d+(?:\.\d+)?%/g) || [];
    const orphanedStats = stats.length - attributionCount;
    if (orphanedStats > 2) {
        issues.push(`${orphanedStats} statistics without attribution. Every stat needs a source.`);
    }

    const score = Math.min(100, Math.round(densityPer1000 * 40));
    return { score, attributionCount, issues };
}

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

    // QG-1 FIX: Add stable section ID markers before entering the quality loop.
    // This prevents string-match failures when cleanAIPatterns mutates content
    // between scoring and replacement.
    let sectionIdx = 0;
    content = content.replace(/<h2([^>]*)>/gi, (match, attrs) => {
        // Don't double-mark if already has data-section-id
        if (/data-section-id/i.test(attrs)) return match;
        return `<h2${attrs} data-section-id="qs-${sectionIdx++}">`;
    });

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
            logger.warn('Factuality checker failed — assigning cautious score', { action: 'quality_gate', attempt: attempt + 1 }, factErr);
            factuality = { score: 50, issues: [{ type: 'vague_claim' as const, severity: 'medium' as const, text: 'Factuality check unavailable', suggestion: 'Manually review factual claims before publishing' }], disclaimers: ['⚠️ Factuality check could not complete — manual review recommended.'], summary: 'Factuality check failed; content not verified.' };
        }
        lastFactuality = factuality;

        const passesNaturalness = naturalness.score >= QUALITY_GATE.minNaturalnessScore;
        const passesFactuality = factuality.score >= QUALITY_GATE.minFactualityScore;
        const passesReadability = naturalness.readabilityGrade <= QUALITY_GATE.maxReadabilityGrade;

        if (passesNaturalness && passesFactuality && passesReadability) {
            // #6: Also verify snippet readiness on pass
            const snippetCheck = verifySnippetReadiness(content);
            const snippetThreshold = QUALITY_GATE.minSelfContainedPassageRatio * 100;
            if (snippetCheck.score < snippetThreshold && attempt < QUALITY_GATE.maxRedoAttempts - 1) {
                logger.warn('Snippet readiness low — triggering passage rewrite', { action: 'quality_gate', snippetScore: snippetCheck.score, attempt: attempt + 1 });
                // Continue loop to fix snippet issues
            } else {
                if (attempt > 0) {
                    logger.info('Quality gate passed after redo(s)', { action: 'quality_gate', attempts: attempt, naturalnessScore: naturalness.score, factualityScore: factuality.score, snippetReadiness: snippetCheck.score });
                }
                gatePasses = attempt;
                break;
            }
        }

        // #27: Identify weakest dimension for targeted rewrite
        const weakestDimension = naturalness.score < factuality.score ? 'naturalness' : 'factuality';
        logger.warn('Quality gate threshold not met', {
            action: 'quality_gate',
            attempt: attempt + 1,
            maxAttempts: QUALITY_GATE.maxRedoAttempts,
            naturalnessScore: naturalness.score,
            minNaturalness: QUALITY_GATE.minNaturalnessScore,
            factualityScore: factuality.score,
            minFactuality: QUALITY_GATE.minFactualityScore,
            weakestDimension,
        });

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
                // ── Regression check (Patch 2): score the rewrite BEFORE accepting it ──
                const originalSectionScore = scoreNaturalness(weakestSection.html).score;
                const rewrittenSectionScore = scoreNaturalness(rewritten).score;
                if (rewrittenSectionScore <= originalSectionScore) {
                    logger.warn('Rewrite regression detected — keeping original section', {
                        action: 'quality_gate',
                        heading: weakestSection.heading,
                        originalScore: originalSectionScore,
                        rewrittenScore: rewrittenSectionScore,
                        attempt: attempt + 1,
                    });
                    break;
                }

                const previousContent = content;
                // QG-1 FIX: Use section ID for stable replacement when available
                const sectionIdMatch = weakestSection.html.match(/data-section-id="([^"]+)"/);
                if (sectionIdMatch) {
                    const sectionId = sectionIdMatch[1];
                    // Find the section by its stable ID and replace everything from this H2 to the next H2 (or end)
                    const sectionRegex = new RegExp(
                        `(<h2[^>]*data-section-id="${sectionId}"[^>]*>[\\s\\S]*?)(?=<h2[^>]*>|$)`,
                        'i'
                    );
                    content = content.replace(sectionRegex, rewritten.trim());
                } else {
                    // Fallback to original string replacement
                    content = content.replace(weakestSection.html, rewritten.trim());
                }

                // C2 FIX: Verify the replace actually changed the content.
                // If cleanAIPatterns mutated the section between scoring and replacing,
                // the original string won't match and replace() silently does nothing.
                if (content === previousContent) {
                    logger.warn('Section replace failed — weakest section HTML no longer matches content', {
                        action: 'quality_gate',
                        heading: weakestSection.heading,
                    });
                    break;
                }
            }
        } catch (error) {
            logger.error('Section rewrite failed', { action: 'quality_gate' }, error);
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

    // ── Keyword density enforcement ───────────────────────────────
    // Deterministic de-stuffing when over-band; bounded AI weave when under-band.
    try {
        const ai = getAIRouter();
        const densityResult = await enforceKeywordDensity(
            content,
            keyword,
            QUALITY_GATE.keywordDensityRange,
            (prompt) => ai.generate('section_writing', prompt, {
                systemPrompt: 'Rewrite the paragraph as instructed. Return only the rewritten paragraph text — no HTML, no preamble.',
                temperature: 0.3,
                maxTokens: 512,
            }),
        );
        content = densityResult.content;
        if (densityResult.action !== 'none') {
            logger.info('Keyword density enforced', {
                action: 'quality_gate',
                stage: 'keyword_density',
                enforcementAction: densityResult.action,
                beforeDensity: +(densityResult.beforeDensity * 100).toFixed(2),
                afterDensity: +(densityResult.afterDensity * 100).toFixed(2),
                targetRange: QUALITY_GATE.keywordDensityRange,
            });
        }
    } catch (densityErr) {
        logger.warn('Keyword density enforcement failed (non-fatal)', { action: 'quality_gate', stage: 'keyword_density' }, densityErr);
    }

    // ── Question-H2 ratio enforcement ─────────────────────────────
    // Rephrases the minimum number of statement H2s into questions to hit
    // the AEO/AI-Overview target ratio. Heading-only edit — bodies untouched.
    try {
        const ai = getAIRouter();
        const qResult = await enforceQuestionH2Ratio(
            content,
            keyword,
            QUALITY_GATE.minQuestionH2Ratio,
            (prompt) => ai.generate('section_writing', prompt, {
                systemPrompt: 'Rewrite the heading as a concise, natural question. Return only the heading text — no tags, no quotes.',
                temperature: 0.4,
                maxTokens: 64,
            }),
        );
        content = qResult.content;
        if (qResult.converted > 0) {
            logger.info('Question-H2 ratio enforced', {
                action: 'quality_gate',
                stage: 'question_h2_ratio',
                beforeRatio: +(qResult.before * 100).toFixed(0),
                afterRatio: +(qResult.after * 100).toFixed(0),
                headingsConverted: qResult.converted,
                target: +(QUALITY_GATE.minQuestionH2Ratio * 100).toFixed(0),
            });
        }
    } catch (qErr) {
        logger.warn('Question-H2 ratio enforcement failed (non-fatal)', { action: 'quality_gate', stage: 'question_h2_ratio' }, qErr);
    }

    // Re-score AFTER all rewrites for accurate final metrics
    const finalNaturalness = scoreNaturalness(content);

    // ── Factuality re-scoring (Patch 6): re-run on final content ──
    let finalFactuality: FactualityReport | null = lastFactuality;
    try {
        finalFactuality = await checkFactuality(content, keyword, { deepCheck: false });
    } catch {
        // If re-scoring fails, fall back to last in-loop result
        logger.warn('Post-loop factuality re-scoring failed — using last loop value', { action: 'quality_gate' });
    }

    // DIAGNOSTIC: Check for content depth signals (frameworks, examples, research)
    const hasFrameworks = /\b(framework|model|method|system|process|approach|strategy|step by step)\b/i.test(content);
    const hasExamples = /\b(example|for instance|for example|such as|like|including)\b/i.test(content);
    const hasResearch = /\b(study|research|survey|statistics|data|percent|%|according to|found that)\b/i.test(content);
    const hasActionable = /\b(how to|try this|start with|begin|implement|follow these|recommend|should|must)\b/i.test(content);

    logger.info('Content depth blueprint validation', { action: 'quality_gate', hasFrameworks, hasExamples, hasResearch, hasActionable });
    if (!hasFrameworks || !hasExamples || !hasResearch) {
        logger.warn('Missing content depth signals — article may not meet Step 6/7 requirements', { action: 'quality_gate', hasFrameworks, hasExamples, hasResearch });
    }

    // #7: Final GEO attribution check
    const geoCheck = checkGEOAttribution(content);
    if (geoCheck.issues.length > 0) {
        logger.warn('GEO attribution issues detected', { action: 'quality_gate', issues: geoCheck.issues });
    }

    // #6: Final snippet readiness check
    const snippetReadiness = verifySnippetReadiness(content);
    if (snippetReadiness.issues.length > 0) {
        logger.warn('Snippet readiness issues detected', { action: 'quality_gate', issues: snippetReadiness.issues.slice(0, 3) });
    }

    const metrics: ContentQualityMetrics = {
        naturalnessScore: finalNaturalness.score,
        factualityScore: finalFactuality?.score ?? 0,
        readabilityGrade: finalNaturalness.readabilityGrade,
        aiPhraseCount: finalNaturalness.aiPhraseCount,
        qualityGatePasses: gatePasses,
        sentenceRewrites,
        timestamp: new Date().toISOString(),
    };

    logger.info('Quality gate complete', {
        action: 'quality_gate',
        naturalnessScore: metrics.naturalnessScore,
        factualityScore: metrics.factualityScore,
        readabilityGrade: metrics.readabilityGrade,
        aiPhraseCount: metrics.aiPhraseCount,
        qualityGatePasses: metrics.qualityGatePasses,
        sentenceRewrites: metrics.sentenceRewrites,
        snippetReadiness: snippetReadiness.score,
        geoAttribution: geoCheck.score,
    });

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

// ── Keyword Density Enforcement ───────────────────────────────
// Brings keyword density into the configured band.
//   • Over-band  → deterministically removes surplus body occurrences
//                  (keeps one per block; replaces extras with the head noun
//                  for multi-word keywords, or "it" for single-word).
//   • Under-band → weaves the keyword into up to 3 keyword-free paragraphs
//                  via a bounded AI rewrite (best-effort; skips on failure).
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function enforceKeywordDensity(
    content: string,
    keyword: string,
    range: [number, number],
    aiGenerate?: (prompt: string) => Promise<string>,
): Promise<{ content: string; beforeDensity: number; afterDensity: number; action: 'none' | 'reduced' | 'increased' }> {
    const src = escapeRegExp(keyword.trim());
    const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const totalWords = plain.split(/\s+/).filter(Boolean).length;
    const countKw = (text: string) => (text.match(new RegExp(`\\b${src}\\b`, 'gi')) || []).length;

    if (totalWords < 100) {
        return { content, beforeDensity: 0, afterDensity: 0, action: 'none' };
    }

    const count = countKw(plain);
    const beforeDensity = count / totalWords;
    const [min, max] = range;
    const minCount = Math.ceil(min * totalWords);
    const maxCount = Math.floor(max * totalWords);

    // ── Over-stuffed: deterministically strip surplus occurrences ──
    if (count > maxCount) {
        let surplus = count - maxCount;
        const parts = keyword.trim().split(/\s+/);
        const headNoun = parts.length > 1 ? parts[parts.length - 1] : 'it';

        content = content.replace(/(<(p|li)[^>]*>)([\s\S]*?)(<\/\2>)/gi, (whole, open: string, _tag: string, inner: string, close: string) => {
            if (surplus <= 0) return whole;
            let keptOne = false;
            const newInner = inner.replace(new RegExp(`\\b${src}\\b`, 'gi'), (kw: string) => {
                if (surplus <= 0) return kw;
                if (!keptOne) { keptOne = true; return kw; } // keep one per block for topical relevance
                surplus--;
                return headNoun;
            });
            return open + newInner + close;
        });

        const afterCount = countKw(content.replace(/<[^>]+>/g, ' '));
        return { content, beforeDensity, afterDensity: afterCount / totalWords, action: 'reduced' };
    }

    // ── Under-target: weave keyword into keyword-free paragraphs (AI) ──
    if (count < minCount && aiGenerate) {
        const deficit = minCount - count;
        const pBlocks = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
        const targets = pBlocks
            .filter(p => countKw(p.replace(/<[^>]+>/g, ' ')) === 0)
            .slice(0, Math.min(deficit, 3));

        for (const block of targets) {
            const text = block.replace(/<[^>]+>/g, '').trim();
            if (text.length < 40) continue;
            try {
                const rewritten = await aiGenerate(
                    `Rewrite this paragraph to naturally include the exact phrase "${keyword}" exactly once. Keep the same meaning and roughly the same length. Do NOT add filler. Return only the rewritten paragraph text.\n\n${text}`,
                );
                const clean = rewritten.trim().replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '').trim();
                if (clean && countKw(clean) >= 1 && clean.length < text.length * 1.6) {
                    content = content.replace(block, `<p>${clean}</p>`);
                }
            } catch {
                // best-effort per paragraph
            }
        }

        const afterCount = countKw(content.replace(/<[^>]+>/g, ' '));
        return { content, beforeDensity, afterDensity: afterCount / totalWords, action: 'increased' };
    }

    return { content, beforeDensity, afterDensity: beforeDensity, action: 'none' };
}

// ── Question-H2 Ratio Enforcement ─────────────────────────────
// Rephrases the minimum number of statement-format H2s into questions to
// reach the target ratio for AEO / AI-Overview targeting. Edits heading
// text only — section bodies are untouched. Structural headings
// (TOC, Key Takeaways, FAQ, Sources, Conclusion) are excluded.
export async function enforceQuestionH2Ratio(
    content: string,
    keyword: string,
    minRatio: number,
    aiGenerate: (prompt: string) => Promise<string>,
): Promise<{ content: string; before: number; after: number; converted: number }> {
    const headings: { full: string; attrs: string; text: string }[] = [];
    const h2Re = /<h2([^>]*)>([\s\S]*?)<\/h2>/gi;
    let m: RegExpExecArray | null;
    while ((m = h2Re.exec(content)) !== null) {
        headings.push({ full: m[0], attrs: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() });
    }

    const skip = /table of contents|key takeaway|faq|frequently asked|sources|references|conclusion/i;
    const scorable = headings.filter(h => !skip.test(h.text));
    if (scorable.length < 5) return { content, before: 0, after: 0, converted: 0 };

    const isQuestion = (t: string) => t.trim().endsWith('?');
    const currentQ = scorable.filter(h => isQuestion(h.text)).length;
    const before = currentQ / scorable.length;
    const targetQ = Math.ceil(minRatio * scorable.length);
    if (currentQ >= targetQ) return { content, before, after: before, converted: 0 };

    const needed = targetQ - currentQ;
    const kwLower = keyword.toLowerCase();
    const candidates = scorable
        .filter(h => !isQuestion(h.text))
        // prefer headings that already contain the keyword
        .sort((a, b) => Number(b.text.toLowerCase().includes(kwLower)) - Number(a.text.toLowerCase().includes(kwLower)))
        .slice(0, needed);

    let converted = 0;
    for (const h of candidates) {
        try {
            const out = await aiGenerate(
                `Rewrite this article heading as a natural, search-friendly QUESTION ending with "?". Keep it under 12 words and keep the keyword "${keyword}" or a close variation if present. Return only the heading text.\n\n${h.text}`,
            );
            let q = out.trim().replace(/^["']|["']$/g, '').replace(/<[^>]+>/g, '').trim();
            if (q && !q.endsWith('?')) q += '?';
            if (q && q.length > 5 && q.length < 120) {
                content = content.replace(h.full, `<h2${h.attrs}>${q}</h2>`);
                converted++;
            }
        } catch {
            // best-effort per heading
        }
    }

    const after = (currentQ + converted) / scorable.length;
    return { content, before, after, converted };
}
