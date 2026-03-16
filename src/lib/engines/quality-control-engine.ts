// ============================================================
// RankMaster Pro - Final Quality Control Engine
// 9-Dimension pre-publish gate that evaluates content across
// readability, humanness, SEO structure, topical depth,
// semantic SEO, EEAT, AEO, user value, and competitiveness.
// ============================================================

import { scoreNaturalness } from './naturalness-scorer';
import { BANNED_PHRASES } from './human-writing-rules';
import type {
    QualityControlReport,
    QCDimensionResult,
    RankabilityPrediction,
    PublishDecision,
    HumannessClassification,
    CompetitiveClassification,
} from '../types';

// ── Input Interface ───────────────────────────────────────────

export interface QCInput {
    primaryKeyword: string;
    secondaryKeywords: string[];
    searchIntent: string;       // informational | commercial | transactional | navigational
    targetAudience: string;
    content: string;            // HTML content of the article
}

// ── Helpers ───────────────────────────────────────────────────

function stripHTML(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function countSyllables(word: string): number {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 2) return 1;
    const vowelGroups = w.match(/[aeiouy]+/g);
    let count = vowelGroups ? vowelGroups.length : 1;
    if (w.endsWith('e') && !w.endsWith('le') && count > 1) count--;
    if (w.endsWith('ed') && !w.endsWith('ted') && !w.endsWith('ded') && count > 1) count--;
    return Math.max(count, 1);
}

function extractSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 5);
}

function extractParagraphs(html: string): string[] {
    return (html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
        .map(p => p.replace(/<[^>]+>/g, '').trim())
        .filter(p => p.length > 0);
}

function extractHeadings(html: string): { level: number; text: string }[] {
    const matches = html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi);
    return [...matches].map(m => ({
        level: parseInt(m[1]),
        text: m[2].replace(/<[^>]+>/g, '').trim(),
    }));
}

// ── STEP 1: Readability & Clarity ─────────────────────────────

function evaluateReadability(text: string, html: string): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];

    const sentences = extractSentences(text);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const paragraphs = extractParagraphs(html);

    if (words.length < 50) {
        return { score: 0, issues: ['Content too short to evaluate'], suggestions: [], metrics: {} };
    }

    // Metrics
    const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avgSentLen = sentLengths.reduce((a, b) => a + b, 0) / Math.max(sentLengths.length, 1);
    const longSentPercent = (sentLengths.filter(l => l > 20).length / Math.max(sentLengths.length, 1)) * 100;

    // Passive voice
    const passivePattern = /\b(is|are|was|were|been|being|be)\s+(being\s+)?([\w]+ed|[\w]+en|known|shown|seen|done|made|given|taken|found|said|told)\b/gi;
    const passiveCount = (text.match(passivePattern) || []).length;
    const passivePercent = (passiveCount / Math.max(sentences.length, 1)) * 100;

    // Paragraph sizes (in lines ~ sentences)
    const paraWordCounts = paragraphs.map(p => p.split(/\s+/).length);
    const avgParaWords = paraWordCounts.reduce((a, b) => a + b, 0) / Math.max(paraWordCounts.length, 1);
    const bigParas = paraWordCounts.filter(c => c > 80).length;

    // Complex words (3+ syllables)
    const complexWords = words.filter(w => countSyllables(w) >= 3);
    const complexPercent = (complexWords.length / words.length) * 100;

    // Flesch-Kincaid grade
    const totalSyllables = words.reduce((t, w) => t + countSyllables(w), 0);
    const fkGrade = Math.max(0,
        0.39 * (words.length / Math.max(sentences.length, 1))
        + 11.8 * (totalSyllables / Math.max(words.length, 1))
        - 15.59
    );

    // Score calculation (start at 10, deduct)
    let score = 10;

    // Grade level: target 6-8
    if (fkGrade > 12) { score -= 4; issues.push(`Reading grade ${fkGrade.toFixed(1)} — too academic`); }
    else if (fkGrade > 10) { score -= 3; issues.push(`Reading grade ${fkGrade.toFixed(1)} — too complex for general readers`); }
    else if (fkGrade > 8) { score -= 1.5; suggestions.push(`Grade ${fkGrade.toFixed(1)} — aim for 6-8`); }
    else if (fkGrade < 4) { score -= 1; suggestions.push('Content may be overly simplistic'); }

    // Avg sentence length: target ≤18
    if (avgSentLen > 25) { score -= 2; issues.push(`Avg sentence length ${avgSentLen.toFixed(0)} words — too long`); }
    else if (avgSentLen > 18) { score -= 1; suggestions.push(`Avg sentence ${avgSentLen.toFixed(0)} words — aim for ≤18`); }

    // Long sentence %
    if (longSentPercent > 50) { score -= 1.5; issues.push(`${longSentPercent.toFixed(0)}% of sentences exceed 20 words`); }
    else if (longSentPercent > 35) { score -= 0.5; suggestions.push('Reduce long sentences (>20 words) below 35%'); }

    // Passive voice
    if (passivePercent > 25) { score -= 1; issues.push(`Passive voice at ${passivePercent.toFixed(0)}% — too high`); }
    else if (passivePercent > 15) { score -= 0.5; suggestions.push(`Passive voice ${passivePercent.toFixed(0)}% — aim below 15%`); }

    // Paragraph size
    if (bigParas > 2) { score -= 1; issues.push(`${bigParas} oversized paragraphs (>80 words)`); }

    // Complex words
    if (complexPercent > 25) { score -= 0.5; suggestions.push('Reduce complex vocabulary for broader readability'); }

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            readingGrade: Math.round(fkGrade * 10) / 10,
            avgSentenceLength: Math.round(avgSentLen * 10) / 10,
            longSentencePercent: Math.round(longSentPercent * 10) / 10,
            passiveVoicePercent: Math.round(passivePercent * 10) / 10,
            avgParagraphWords: Math.round(avgParaWords),
            complexWordPercent: Math.round(complexPercent * 10) / 10,
        },
    };
}

// ── STEP 2: Human-Like Writing & AI Footprint ─────────────────

function evaluateHumanness(text: string, html: string): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Use the existing naturalness scorer
    const report = scoreNaturalness(html);

    // Detect AI phrases
    const lowerText = text.toLowerCase();
    const detectedAIPhrases: string[] = [];
    for (const phrase of BANNED_PHRASES) {
        if (phrase.includes('.*')) {
            if (new RegExp(phrase, 'gi').test(lowerText)) detectedAIPhrases.push(phrase.replace('.*', '…'));
        } else if (lowerText.includes(phrase)) {
            detectedAIPhrases.push(phrase);
        }
    }

    // Robotic transitions check
    const roboticTransitions = ['moreover', 'furthermore', 'additionally', 'consequently', 'subsequently', 'notably'];
    let roboticTransitionCount = 0;
    for (const t of roboticTransitions) {
        const matches = lowerText.match(new RegExp(`\\b${t}\\b`, 'gi'));
        if (matches) roboticTransitionCount += matches.length;
    }

    // Predictable paragraph openings
    const paragraphs = extractParagraphs(html);
    const paraStarters = paragraphs.map(p => p.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, ''));
    const starterCounts = new Map<string, number>();
    for (const s of paraStarters) {
        if (s) starterCounts.set(s, (starterCounts.get(s) || 0) + 1);
    }
    const overusedParaStarters = [...starterCounts.entries()]
        .filter(([, count]) => count >= 3 && paragraphs.length > 5)
        .map(([word, count]) => `"${word}" opens ${count} paragraphs`);

    // Generic filler detection
    const fillerPatterns = [
        /there are many (reasons|ways|factors|options)\b/gi,
        /it (is|can be) said that\b/gi,
        /one of the most important (things|aspects|factors)\b/gi,
        /plays a (crucial|vital|key|pivotal|significant) role\b/gi,
    ];
    let fillerCount = 0;
    for (const p of fillerPatterns) {
        const m = text.match(p);
        if (m) fillerCount += m.length;
    }

    // Sentence structure repetition (check for uniform sentence pattern)
    const sentences = extractSentences(text);
    const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const sentMean = sentLengths.length > 0 ? sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length : 0;
    const variance = sentLengths.length > 1
        ? Math.sqrt(sentLengths.reduce((sum, l) => sum + Math.pow(l - sentMean, 2), 0) / sentLengths.length)
        : 0;

    // Score (normalize from 0-100 naturalness score to 0-10)
    let score = report.score / 10;

    // Additional deductions
    if (detectedAIPhrases.length >= 6) { score -= 1.5; issues.push(`${detectedAIPhrases.length} banned AI phrases detected`); }
    else if (detectedAIPhrases.length >= 3) { score -= 0.8; issues.push(`${detectedAIPhrases.length} AI cliché phrases found`); }
    else if (detectedAIPhrases.length >= 1) { score -= 0.3; suggestions.push(`Minor AI phrases: "${detectedAIPhrases.slice(0, 2).join('", "')}"`); }

    if (roboticTransitionCount >= 5) { score -= 1; issues.push('Heavy use of robotic transition words'); }
    if (overusedParaStarters.length > 0) { score -= 0.5; issues.push(`Predictable paragraph openings: ${overusedParaStarters.join('; ')}`); }
    if (fillerCount >= 3) { score -= 0.5; issues.push(`${fillerCount} generic filler statements detected`); }
    if (variance < 4) { score -= 0.5; suggestions.push('Sentence lengths too uniform — add rhythm variety'); }

    // Add naturalness issues/suggestions
    issues.push(...report.issues);
    suggestions.push(...report.suggestions);

    // Classification
    let classification: HumannessClassification;
    if (score >= 8) classification = 'Human-like';
    else if (score >= 6) classification = 'Minor AI patterns';
    else if (score >= 4) classification = 'Moderate AI patterns';
    else classification = 'Strong AI patterns';

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            classification,
            aiPhraseCount: detectedAIPhrases.length,
            roboticTransitions: roboticTransitionCount,
            lexicalDiversity: report.lexicalDiversity,
            sentenceVariance: Math.round(variance * 10) / 10,
            fillerStatements: fillerCount,
        },
    };
}

// ── STEP 3: SEO Structure Validation ──────────────────────────

function evaluateSEOStructure(text: string, html: string, primaryKeyword: string, searchIntent: string): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    const lowerText = text.toLowerCase();
    const lowerKeyword = primaryKeyword.toLowerCase();
    const headings = extractHeadings(html);
    const words = text.split(/\s+/).filter(w => w.length > 0);

    // 1. Keyword in title/H1
    const h1 = headings.find(h => h.level === 1);
    if (h1 && h1.text.toLowerCase().includes(lowerKeyword)) {
        score += 1.5;
    } else {
        issues.push('Primary keyword not found in H1/title');
        suggestions.push('Include the exact primary keyword in your H1 heading');
    }

    // 2. Keyword in first 100 words
    const first100 = words.slice(0, 100).join(' ').toLowerCase();
    if (first100.includes(lowerKeyword)) {
        score += 1;
    } else {
        issues.push('Keyword not found in first 100 words');
        suggestions.push('Naturally introduce the keyword in the opening paragraph');
    }

    // 3. Keyword in H2/H3 headings
    const subheadingsWithKw = headings.filter(h => h.level >= 2 && h.level <= 3 && h.text.toLowerCase().includes(lowerKeyword));
    if (subheadingsWithKw.length >= 2) score += 1.5;
    else if (subheadingsWithKw.length >= 1) score += 1;
    else suggestions.push('Include keyword in at least one H2 or H3 heading');

    // 4. Heading hierarchy (H1 → H2 → H3, no skips)
    let hierarchyValid = true;
    const h1Count = headings.filter(h => h.level === 1).length;
    if (h1Count !== 1) { hierarchyValid = false; issues.push(h1Count === 0 ? 'No H1 found' : 'Multiple H1 tags found'); }

    for (let i = 1; i < headings.length; i++) {
        if (headings[i].level > headings[i - 1].level + 1) {
            hierarchyValid = false;
            break;
        }
    }
    if (hierarchyValid) score += 1;
    else suggestions.push('Fix heading hierarchy — don\'t skip levels (H1 → H2 → H3)');

    // 5. Keyword density (0.5-1.5% ideal)
    const kwCount = (lowerText.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const density = (kwCount / Math.max(words.length, 1)) * 100;
    if (density >= 0.5 && density <= 1.5) score += 1.5;
    else if (density < 0.5) { suggestions.push(`Keyword density too low (${density.toFixed(1)}%) — aim for 0.5-1.5%`); score += 0.5; }
    else if (density <= 2.5) { suggestions.push(`Keyword density slightly high (${density.toFixed(1)}%)`); score += 0.8; }
    else { issues.push(`Keyword stuffing risk — density ${density.toFixed(1)}%`); }

    // 6. Structural elements
    const hasBulletList = /<[uo]l[\s>]/i.test(html);
    const hasTable = /<table[\s>]/i.test(html);
    const hasImages = /<img[\s]/i.test(html);
    const isCommercial = /commercial|transactional/i.test(searchIntent);

    if (hasBulletList) score += 0.8;
    else suggestions.push('Add bullet or numbered lists for scannability');

    if (hasTable) score += 0.5;
    else if (isCommercial) suggestions.push('Add a comparison table for commercial content');

    if (hasImages) score += 0.5;
    else suggestions.push('Add images with keyword-rich alt text');

    // 7. Internal/external link opportunities
    const internalLinks = (html.match(/<a[^>]+href="\/[^"]*"/gi) || []).length;
    const externalLinks = (html.match(/<a[^>]+href="https?:\/\/[^"]*"/gi) || []).length;
    if (internalLinks >= 3) score += 0.5;
    else suggestions.push('Add 3-5 internal links to related content');
    if (externalLinks >= 2) score += 0.5;
    else suggestions.push('Add 2-3 external authority references');

    // Subheading count bonus
    const subheadingCount = headings.filter(h => h.level >= 2).length;
    if (subheadingCount >= 6) score += 0.4;

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            keywordDensity: Math.round(density * 100) / 100,
            headingCount: headings.length,
            subheadingCount,
            internalLinks,
            externalLinks,
            hasBulletList: hasBulletList ? 1 : 0,
            hasTable: hasTable ? 1 : 0,
        },
    };
}

// ── STEP 4: Topical Depth & Coverage ──────────────────────────

function evaluateTopicalDepth(text: string, html: string, primaryKeyword: string, secondaryKeywords: string[]): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    const lowerText = text.toLowerCase();
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const headings = extractHeadings(html);
    const paragraphs = extractParagraphs(html);

    // 1. Word count depth
    if (words.length >= 2500) score += 2;
    else if (words.length >= 1500) score += 1.5;
    else if (words.length >= 800) score += 1;
    else { issues.push(`Only ${words.length} words — too thin for competitive ranking`); }

    // 2. Secondary keyword coverage
    const coveredSecondary = secondaryKeywords.filter(kw => lowerText.includes(kw.toLowerCase()));
    const coveragePercent = secondaryKeywords.length > 0 ? (coveredSecondary.length / secondaryKeywords.length) * 100 : 100;
    if (coveragePercent >= 80) score += 2;
    else if (coveragePercent >= 60) score += 1.5;
    else if (coveragePercent >= 40) score += 1;
    else {
        const missing = secondaryKeywords.filter(kw => !lowerText.includes(kw.toLowerCase()));
        issues.push(`Only ${coveragePercent.toFixed(0)}% secondary keyword coverage`);
        suggestions.push(`Missing subtopics: ${missing.slice(0, 5).join(', ')}`);
    }

    // 3. Section depth — penalize thin sections (less than 80 words under a heading)
    let thinSections = 0;
    for (let i = 0; i < headings.length; i++) {
        // Find content between this heading and next
        const headingText = headings[i].text;
        const headingIdx = html.indexOf(headingText);
        const nextHeadingIdx = i + 1 < headings.length ? html.indexOf(headings[i + 1].text, headingIdx + 1) : html.length;
        const sectionHTML = html.substring(headingIdx, nextHeadingIdx);
        const sectionText = sectionHTML.replace(/<[^>]+>/g, ' ').trim();
        const sectionWords = sectionText.split(/\s+/).filter(w => w.length > 0).length;
        if (sectionWords < 80 && headings[i].level >= 2) thinSections++;
    }

    if (thinSections === 0) score += 2;
    else if (thinSections <= 2) { score += 1; suggestions.push(`${thinSections} thin section(s) with <80 words — expand them`); }
    else { issues.push(`${thinSections} thin sections — content lacks depth in multiple areas`); }

    // 4. Practical content signals
    const hasPracticalSignals = /example|for instance|step|tip|how to|use case|real.world|hands.on/i.test(text);
    if (hasPracticalSignals) score += 1.5;
    else suggestions.push('Add practical examples, tips, or real-world use cases');

    // 5. Contextual insights (data, stats, years)
    const hasStats = /\d+(\.\d+)?%/.test(text);
    const hasYears = /\b20[12]\d\b/.test(text);
    const hasSpecificNumbers = (text.match(/\b\d{3,}/g) || []).length > 0;
    if (hasStats && hasYears) score += 1.5;
    else if (hasStats || hasYears || hasSpecificNumbers) score += 0.8;
    else suggestions.push('Include statistics, data points, and recent year references');

    // 6. Heading diversity
    const subheadingCount = headings.filter(h => h.level >= 2).length;
    if (subheadingCount >= 8) score += 1;
    else if (subheadingCount >= 5) score += 0.5;
    else suggestions.push('Add more subheadings to cover subtopics comprehensively');

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            wordCount: words.length,
            secondaryKeywordCoverage: Math.round(coveragePercent),
            thinSections,
            subheadingCount,
            hasPracticalExamples: hasPracticalSignals ? 'Yes' : 'No',
        },
    };
}

// ── STEP 5: Semantic SEO & Entity Coverage ────────────────────

function evaluateSemanticSEO(text: string, html: string, primaryKeyword: string, secondaryKeywords: string[]): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    const plainText = stripHTML(html);

    // 1. Entity extraction (proper nouns, brands, tools, acronyms)
    const STOP_WORDS = new Set(['The', 'This', 'That', 'These', 'Those', 'When', 'What', 'Where', 'Which', 'With', 'From', 'Your', 'They', 'Their', 'There', 'Here', 'Have', 'Should', 'Would', 'Could', 'About', 'After', 'Before', 'Between', 'Each', 'Every', 'Most', 'Some', 'Many', 'Much', 'Other', 'More', 'Also', 'Just', 'Than', 'Then', 'Only', 'Very', 'Still', 'Even', 'Such', 'Into', 'Over', 'Under', 'Does', 'Will', 'Been', 'Being', 'Being', 'Both', 'But', 'AND', 'THE', 'FOR', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'ARE', 'HAS']);

    // Pattern 1: Capitalized proper nouns (original pattern)
    const capitalizedEntities = (plainText.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g) || []);

    // Pattern 2: Acronyms — 2+ uppercase letters (AWS, API, SEO, IBM, NASA, SaaS)
    const acronyms = (plainText.match(/\b[A-Z]{2,}[a-z]?\b/g) || []);

    // Pattern 3: camelCase / PascalCase products (iPhone, WordPress, YouTube, GitHub)
    const camelCase = (plainText.match(/\b[a-z]+[A-Z][a-zA-Z]*\b|\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/g) || []);

    // Pattern 4: Hyphenated tech terms (machine-learning, e-commerce, real-time)
    const hyphenated = (plainText.match(/\b[A-Za-z]+-[A-Za-z]+(?:-[A-Za-z]+)?\b/g) || [])
        .filter(h => h.length > 5 && /[A-Z]/.test(h));

    const allEntities = [...capitalizedEntities, ...acronyms, ...camelCase, ...hyphenated];
    const uniqueEntities = new Set(allEntities.filter(e => e.length > 2 && !STOP_WORDS.has(e)));

    if (uniqueEntities.size >= 20) score += 3;
    else if (uniqueEntities.size >= 12) score += 2;
    else if (uniqueEntities.size >= 6) score += 1;
    else { issues.push('Low entity coverage — missing brands, tools, and named concepts'); suggestions.push('Mention specific brands, tools, people, or organizations relevant to the topic'); }

    // 2. Keyword variations and synonyms
    const keywordParts = primaryKeyword.toLowerCase().split(/\s+/);
    const lowerText = text.toLowerCase();
    let variationCount = 0;
    for (const part of keywordParts) {
        if (part.length >= 4) {
            // Check for plural, -ing, -ed variations
            const variations = [part + 's', part + 'ing', part + 'ed', part.replace(/y$/, 'ies'), part.replace(/e$/, 'ing')];
            for (const v of variations) {
                // Count variations that appear in text (don't require primary keyword absence)
                if (lowerText.includes(v)) variationCount++;
            }
        }
    }
    // Also count secondary keywords as semantic variations
    const usedSecondary = secondaryKeywords.filter(kw => lowerText.includes(kw.toLowerCase()));
    variationCount += usedSecondary.length;

    if (variationCount >= 8) score += 2.5;
    else if (variationCount >= 4) score += 1.5;
    else if (variationCount >= 2) score += 1;
    else suggestions.push('Use more keyword synonyms and LSI variations throughout the content');

    // 3. Contextual topic connections (co-occurring terms)
    const topicalTerms = [
        'strategy', 'guide', 'process', 'method', 'technique', 'approach',
        'benefit', 'advantage', 'challenge', 'solution', 'best practice',
        'tool', 'platform', 'software', 'framework', 'system',
        'metric', 'analytics', 'performance', 'result', 'outcome',
        'trend', 'future', 'update', 'change', 'improvement',
    ];
    const contextTermCount = topicalTerms.filter(t => lowerText.includes(t)).length;
    if (contextTermCount >= 12) score += 2;
    else if (contextTermCount >= 7) score += 1.5;
    else if (contextTermCount >= 4) score += 1;
    else suggestions.push('Enrich content with more contextual topic terms');

    // 4. Topical authority contribution
    const hasDefinition = /\b(is|refers to|means|defined as|known as)\b/i.test(text.substring(0, 500));
    const hasDepthMarkers = /\b(according to|research shows|studies indicate|data suggests|experts recommend)\b/i.test(text);
    if (hasDefinition) score += 1;
    if (hasDepthMarkers) score += 1.5;
    else suggestions.push('Add authority markers like "research shows", "experts recommend"');

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            uniqueEntities: uniqueEntities.size,
            keywordVariations: variationCount,
            contextualTerms: contextTermCount,
            topEntities: [...uniqueEntities].slice(0, 10).join(', '),
        },
    };
}

// ── STEP 6: EEAT Signal Analysis ──────────────────────────────

function evaluateEEAT(text: string, html: string): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    const lowerText = text.toLowerCase();
    const lowerHTML = html.toLowerCase();

    // EXPERIENCE signals
    const experiencePatterns = [
        /\b(in my experience|i've tested|i've used|from my testing|hands-on|first-hand|personally|i recommend)\b/gi,
        /\b(our team|we found|we discovered|we tested|our research|our analysis|we've seen)\b/gi,
    ];
    const hasExperience = experiencePatterns.some(p => p.test(text));
    if (hasExperience) score += 1.5;
    else { issues.push('No first-hand experience signals'); suggestions.push('Add personal experience: "In my testing…", "I\'ve used X for Y years"'); }

    // Real-world examples
    const hasExamples = /\b(for example|for instance|such as|like when|here's what|real.world example)\b/i.test(text);
    if (hasExamples) score += 1;
    else suggestions.push('Add real-world examples to show practical knowledge');

    // EXPERTISE signals
    const expertTerms = ['methodology', 'empirical', 'peer-reviewed', 'benchmark', 'framework', 'implementation', 'optimization', 'algorithm', 'protocol', 'evidence-based'];
    const expertCount = expertTerms.filter(t => lowerText.includes(t)).length;
    if (expertCount >= 3) score += 1.5;
    else if (expertCount >= 1) score += 0.8;

    // Author box / byline
    const hasAuthorBox = lowerHTML.includes('author-box') || lowerHTML.includes('written by') || lowerHTML.includes('reviewed by') || /class="[^"]*author/i.test(html);
    if (hasAuthorBox) score += 1;
    else suggestions.push('Add an author box with credentials and bio');

    // AUTHORITATIVENESS signals
    const authDomains = ['.gov', '.edu', '.org', 'ncbi.nlm', 'scholar.google', 'pubmed', 'harvard', 'stanford'];
    const links = html.match(/<a[^>]+href="([^"]+)"/gi) || [];
    const externalLinks = links.filter(l => /href="https?:\/\//i.test(l));
    const authLinks = externalLinks.filter(l => authDomains.some(d => l.toLowerCase().includes(d)));
    if (authLinks.length >= 3) score += 1.5;
    else if (authLinks.length >= 1) score += 0.8;
    else if (externalLinks.length >= 2) score += 0.4;
    else { issues.push('No authoritative source citations'); suggestions.push('Add links to .gov, .edu, or research sources'); }

    // Expert quotes
    const quotePatterns = /according to|as\s+\w+\s+(noted|stated|explained)|research (shows|suggests|indicates)|study (found|published)/gi;
    const quoteCount = (text.match(quotePatterns) || []).length;
    if (quoteCount >= 3) score += 1;
    else if (quoteCount >= 1) score += 0.5;

    // TRUSTWORTHINESS signals
    const hasDateSignal = lowerText.includes('updated') || lowerText.includes('last modified') || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+20\d{2}/i.test(text);
    if (hasDateSignal) score += 0.8;

    // Balanced tone (no exaggerated claims)
    const exaggerations = ['best ever', 'guaranteed', 'number one', '#1', 'without a doubt', 'hands down the best', 'absolutely the best', 'nothing beats'];
    const exaggerationCount = exaggerations.filter(e => lowerText.includes(e)).length;
    if (exaggerationCount === 0) score += 0.8;
    else { issues.push(`${exaggerationCount} exaggerated claim(s) detected — hurts trust`); score -= 0.5; }

    // Data depth bonus
    const percentages = (text.match(/\d+(\.\d+)?%/g) || []).length;
    const yearRefs = (text.match(/\b20[12]\d\b/g) || []).length;
    if (percentages >= 3 && yearRefs >= 2) score += 0.6;

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            hasExperience: hasExperience ? 'Yes' : 'No',
            expertTermCount: expertCount,
            authoritativeLinks: authLinks.length,
            externalLinks: externalLinks.length,
            expertQuotes: quoteCount,
            exaggeratedClaims: exaggerationCount,
        },
    };
}

// ── STEP 7: AEO / Featured Snippet Optimization ──────────────

function evaluateAEO(text: string, html: string, primaryKeyword: string): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    const lowerHTML = html.toLowerCase();
    const paragraphs = extractParagraphs(html);
    const headings = extractHeadings(html);

    // 1. Direct answer paragraph (≤50 words, answers the keyword question)
    const shortAnswerParas = paragraphs.filter(p => {
        const wc = p.split(/\s+/).length;
        return wc >= 20 && wc <= 50;
    });
    if (shortAnswerParas.length >= 2) score += 1.5;
    else if (shortAnswerParas.length >= 1) score += 1;
    else { issues.push('No concise answer paragraph (20-50 words) found'); suggestions.push('Add a direct, concise answer right after the main question heading'); }

    // 2. Definition paragraph in first 100 words
    const firstParaWords = paragraphs.length > 0 ? paragraphs[0].split(/\s+/).length : 0;
    if (firstParaWords >= 30 && firstParaWords <= 80) score += 1.5;
    else suggestions.push('Make the first paragraph a 30-60 word direct answer');

    // 3. List-based answers
    const hasOrderedList = /<ol[\s>]/i.test(html);
    const hasUnorderedList = /<ul[\s>]/i.test(html);
    if (hasOrderedList) score += 1.5;
    else if (hasUnorderedList) score += 1;
    else suggestions.push('Add numbered or bulleted lists for structured answers');

    // 4. FAQ section
    const hasFAQ = lowerHTML.includes('faq') || lowerHTML.includes('frequently asked') || lowerHTML.includes('common questions');
    if (hasFAQ) score += 2;
    else { issues.push('No FAQ section found'); suggestions.push('Add a dedicated FAQ section with 4-6 common questions'); }

    // 5. Question-based headings
    const questionHeadings = headings.filter(h => h.text.includes('?'));
    if (questionHeadings.length >= 4) score += 1.5;
    else if (questionHeadings.length >= 2) score += 1;
    else suggestions.push('Use question-based headings ("What is…?", "How does…?")');

    // 6. Table for comparison / data
    if (/<table[\s>]/i.test(html)) score += 1;

    // 7. Key takeaways / summary box
    if (lowerHTML.includes('key takeaway') || lowerHTML.includes('summary') || lowerHTML.includes('tldr') || lowerHTML.includes('tl;dr')) score += 1;
    else suggestions.push('Add a "Key Takeaways" or TL;DR summary section');

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            shortAnswerParagraphs: shortAnswerParas.length,
            questionHeadings: questionHeadings.length,
            hasFAQ: hasFAQ ? 'Yes' : 'No',
            hasOrderedList: hasOrderedList ? 'Yes' : 'No',
            hasTable: /<table[\s>]/i.test(html) ? 'Yes' : 'No',
        },
    };
}

// ── STEP 8: User Value & Information Gain ─────────────────────

function evaluateUserValue(text: string, html: string, primaryKeyword: string): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    const words = text.split(/\s+/).filter(w => w.length > 0);
    const lowerText = text.toLowerCase();
    const paragraphs = extractParagraphs(html);
    const headings = extractHeadings(html);

    // 1. Usefulness — actionable content
    const actionPatterns = /\b(how to|step|tip|trick|strategy|method|technique|checklist|template|resource|download|try|use this|start by|here's how)\b/gi;
    const actionCount = (text.match(actionPatterns) || []).length;
    if (actionCount >= 8) score += 2;
    else if (actionCount >= 4) score += 1.5;
    else if (actionCount >= 2) score += 1;
    else { issues.push('Content lacks actionable advice'); suggestions.push('Add specific how-tos, tips, or actionable steps'); }

    // 2. Clarity — well-structured, easy to follow
    const hasLogicalFlow = headings.length >= 5 && paragraphs.length >= 8;
    if (hasLogicalFlow) score += 1.5;
    else suggestions.push('Improve structure with more headings and shorter paragraphs');

    // 3. Completeness
    if (words.length >= 2000 && headings.filter(h => h.level >= 2).length >= 6) score += 2;
    else if (words.length >= 1200 && headings.filter(h => h.level >= 2).length >= 4) score += 1;
    else suggestions.push('Expand content for more comprehensive topic coverage');

    // 4. Originality signals (unique insights, not just rehashed information)
    const originalityPatterns = [
        /\b(in my experience|i('ve| have) (found|tested|seen)|our team|we discovered|from my|personally)\b/gi,
        /\b(little-known|often overlooked|most people don't|what (most|many) miss|the truth is|here's the thing)\b/gi,
        /\b(pro tip|insider|advanced|underrated|hidden|secret)\b/gi,
    ];
    const originalityHits = originalityPatterns.reduce((count, p) => count + (text.match(p) || []).length, 0);
    if (originalityHits >= 5) score += 2;
    else if (originalityHits >= 2) score += 1;
    else { suggestions.push('Add unique insights, personal experience, or little-known tips'); }

    // 5. Information gain beyond generic
    const hasSpecificData = /\d+(\.\d+)?%/.test(text) || /\$\d+/.test(text) || /\b\d{4,}\b/.test(text);
    const hasComparisons = lowerText.includes(' vs ') || lowerText.includes('compared to') || lowerText.includes('versus') || lowerText.includes('difference between');
    const hasTools = /\b(tool|software|app|platform|plugin|extension|service)\b/i.test(text);

    if (hasSpecificData && hasComparisons) score += 1.5;
    else if (hasSpecificData || hasComparisons || hasTools) score += 0.8;
    else suggestions.push('Include specific data, comparisons, or tool recommendations');

    // 6. No fluff/filler ratio
    const fillerSentences = extractSentences(text).filter(s => {
        const lower = s.trim().toLowerCase();
        return /^(it is|it's|this is|that is) (important|crucial|essential|vital|worth)/i.test(lower) ||
            /^(there are|there is) (many|several|various|numerous)/i.test(lower);
    });
    const fillerRatio = fillerSentences.length / Math.max(extractSentences(text).length, 1);
    if (fillerRatio < 0.05) score += 1;
    else if (fillerRatio > 0.15) { score -= 0.5; issues.push('Too many filler statements — reduce generic phrases'); }

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            actionableElements: actionCount,
            originalitySignals: originalityHits,
            hasSpecificData: hasSpecificData ? 'Yes' : 'No',
            fillerRatio: Math.round(fillerRatio * 100) + '%',
        },
    };
}

// ── STEP 9: Competitive Strength Estimation ───────────────────

function evaluateCompetitiveStrength(
    readability: number, humanness: number, seo: number, depth: number,
    semantic: number, eeat: number, aeo: number, value: number,
    wordCount: number
): QCDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Weighted composite of all other scores
    const composite = (
        readability * 0.10 +
        humanness * 0.12 +
        seo * 0.15 +
        depth * 0.15 +
        semantic * 0.10 +
        eeat * 0.15 +
        aeo * 0.10 +
        value * 0.13
    );

    let score = composite;

    // Word count bonus/penalty
    if (wordCount >= 2500) score += 0.3;
    else if (wordCount < 1000) { score -= 0.5; issues.push('Word count too low for competitive ranking'); }

    // Weak dimension penalty
    const dimScores = [readability, humanness, seo, depth, semantic, eeat, aeo, value];
    const weakDims = dimScores.filter(s => s < 5);
    if (weakDims.length >= 3) { score -= 1; issues.push(`${weakDims.length} dimensions scoring below 5/10 — major weaknesses`); }
    else if (weakDims.length >= 1) { suggestions.push('Improve weak scoring dimensions for better competitiveness'); }

    // Classification
    let classification: CompetitiveClassification;
    if (score >= 8.5) classification = 'Dominant';
    else if (score >= 7) classification = 'Strong';
    else if (score >= 5) classification = 'Moderate';
    else classification = 'Weak';

    if (classification === 'Weak') issues.push('Content unlikely to compete with top-ranking pages');
    if (classification === 'Moderate') suggestions.push('Content needs improvement in multiple areas to compete effectively');

    return {
        score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        issues,
        suggestions,
        metrics: {
            classification,
            compositeBase: Math.round(composite * 10) / 10,
            weakDimensions: weakDims.length,
        },
    };
}

// ── Final Decision Logic ──────────────────────────────────────

function predictRankability(overall: number): RankabilityPrediction {
    if (overall >= 9) return 'ELITE_RANKABLE_CONTENT';
    if (overall >= 7.5) return 'HIGH_RANK_POTENTIAL';
    if (overall >= 5.5) return 'MODERATE_RANK_POTENTIAL';
    if (overall >= 3.5) return 'LOW_RANK_POTENTIAL';
    return 'NOT_RANKABLE';
}

function decidePublish(overall: number, issues: string[]): PublishDecision {
    const criticalIssues = issues.length;
    if (overall >= 8 && criticalIssues <= 2) return 'Publish Immediately';
    if (overall >= 6.5 && criticalIssues <= 5) return 'Acceptable';
    if (overall >= 4) return 'Needs Revision';
    return 'Reject';
}

function buildReasoning(overall: number, prediction: RankabilityPrediction, dims: Record<string, number>): string {
    const parts: string[] = [];
    parts.push(`Overall quality score: ${overall}/10.`);

    const strengths = Object.entries(dims).filter(([, s]) => s >= 7).map(([d]) => d);
    const weaknesses = Object.entries(dims).filter(([, s]) => s < 5).map(([d]) => d);

    if (strengths.length > 0) parts.push(`Strengths: ${strengths.join(', ')}.`);
    if (weaknesses.length > 0) parts.push(`Weaknesses: ${weaknesses.join(', ')}.`);

    switch (prediction) {
        case 'ELITE_RANKABLE_CONTENT':
            parts.push('Content excels across all dimensions and is ready for top-tier SERP competition.');
            break;
        case 'HIGH_RANK_POTENTIAL':
            parts.push('Content has strong ranking potential with minor optimization opportunities remaining.');
            break;
        case 'MODERATE_RANK_POTENTIAL':
            parts.push('Content can rank for medium-competition keywords but needs improvement for highly competitive SERPs.');
            break;
        case 'LOW_RANK_POTENTIAL':
            parts.push('Content has significant gaps that will prevent competitive ranking. Major revisions recommended.');
            break;
        case 'NOT_RANKABLE':
            parts.push('Content does not meet minimum quality standards for ranking. Complete rewrite recommended.');
            break;
    }

    return parts.join(' ');
}

function collectImprovements(dims: QCDimensionResult[]): string[] {
    // Gather all issues and suggestions, prioritize by severity
    const allItems: { text: string; priority: number }[] = [];

    for (const dim of dims) {
        for (const issue of dim.issues) {
            allItems.push({ text: issue, priority: 1 }); // issues are higher priority
        }
        for (const sug of dim.suggestions) {
            allItems.push({ text: sug, priority: 2 });
        }
    }

    // Sort by priority, then take top 5
    allItems.sort((a, b) => a.priority - b.priority);
    const seen = new Set<string>();
    return allItems
        .filter(item => {
            if (seen.has(item.text)) return false;
            seen.add(item.text);
            return true;
        })
        .slice(0, 10)
        .map(item => item.text);
}

// ── Main Export ───────────────────────────────────────────────

export function runQualityControl(input: QCInput): QualityControlReport {
    const plainText = stripHTML(input.content);
    const words = plainText.split(/\s+/).filter(w => w.length > 0);

    // Run all 9 steps
    const readability = evaluateReadability(plainText, input.content);
    const humanness = evaluateHumanness(plainText, input.content);
    const seoStructure = evaluateSEOStructure(plainText, input.content, input.primaryKeyword, input.searchIntent);
    const topicalDepth = evaluateTopicalDepth(plainText, input.content, input.primaryKeyword, input.secondaryKeywords);
    const semantic = evaluateSemanticSEO(plainText, input.content, input.primaryKeyword, input.secondaryKeywords);
    const eeat = evaluateEEAT(plainText, input.content);
    const aeo = evaluateAEO(plainText, input.content, input.primaryKeyword);
    const value = evaluateUserValue(plainText, input.content, input.primaryKeyword);

    // Competitive requires other scores
    const competitive = evaluateCompetitiveStrength(
        readability.score, humanness.score, seoStructure.score, topicalDepth.score,
        semantic.score, eeat.score, aeo.score, value.score, words.length
    );

    // Overall weighted average
    const overall = Math.round((
        readability.score * 0.10 +
        humanness.score * 0.14 +
        seoStructure.score * 0.13 +
        topicalDepth.score * 0.12 +
        semantic.score * 0.10 +
        eeat.score * 0.14 +
        aeo.score * 0.09 +
        value.score * 0.10 +
        competitive.score * 0.08
    ) * 10) / 10;

    const rankability = predictRankability(overall);
    const allDims = [readability, humanness, seoStructure, topicalDepth, semantic, eeat, aeo, value, competitive];
    const allIssues = allDims.flatMap(d => d.issues);
    const publishDecision = decidePublish(overall, allIssues);
    const requiredImprovements = publishDecision !== 'Publish Immediately' ? collectImprovements(allDims) : [];

    const dimMap: Record<string, number> = {
        Readability: readability.score,
        Humanness: humanness.score,
        'SEO Structure': seoStructure.score,
        'Topical Depth': topicalDepth.score,
        Semantic: semantic.score,
        'E-E-A-T': eeat.score,
        AEO: aeo.score,
        'User Value': value.score,
        Competitive: competitive.score,
    };

    return {
        primaryKeyword: input.primaryKeyword,
        secondaryKeywords: input.secondaryKeywords,
        searchIntent: input.searchIntent,
        targetAudience: input.targetAudience,

        readabilityScore: readability,
        humannessScore: humanness,
        seoStructureScore: seoStructure,
        topicalDepthScore: topicalDepth,
        semanticScore: semantic,
        eeatScore: eeat,
        aeoScore: aeo,
        valueScore: value,
        competitiveScore: competitive,

        overallScore: overall,
        rankabilityPrediction: rankability,
        publishDecision,
        humannessClassification: (humanness.metrics.classification as HumannessClassification) || 'Minor AI patterns',
        competitiveClassification: (competitive.metrics.classification as CompetitiveClassification) || 'Moderate',

        requiredImprovements,
        reasoning: buildReasoning(overall, rankability, dimMap),

        evaluatedAt: new Date().toISOString(),
        wordCount: words.length,
    };
}
