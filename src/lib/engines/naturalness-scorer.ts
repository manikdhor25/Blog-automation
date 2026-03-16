// ============================================================
// RankMaster Pro - NLP Naturalness Scorer Engine
// Detects AI writing patterns, measures lexical diversity,
// sentence rhythm, passive voice, and AI phrase fingerprints
// ============================================================

import { BANNED_PHRASES } from './human-writing-rules';

export interface NaturalnessReport {
    score: number;            // 0-100
    lexicalDiversity: number; // Type-Token Ratio (0-1)
    sentenceVariance: number; // Standard deviation of sentence lengths
    passiveVoicePercent: number;
    aiPhraseCount: number;
    repetitiveStarterCount: number;
    readabilityGrade: number; // Flesch-Kincaid grade level
    issues: string[];
    suggestions: string[];
}

// ── AI Cliché Blacklist ────────────────────────────────────────
// Uses centralized BANNED_PHRASES from human-writing-rules.ts
const AI_PHRASE_BLACKLIST = BANNED_PHRASES;

// Patterns that are overused by AI but can appear naturally — scored less harshly
const AI_SOFT_PATTERNS = [
    'whether you\'re a',
    'whether you are a',
    'you might be wondering',
    'you may be wondering',
    'this is where',
    'that being said',
    'with that said',
    'having said that',
    'rest assured',
    'first and foremost',
];

// ── Passive Voice Detection ────────────────────────────────────

const PASSIVE_PATTERNS = [
    /\b(is|are|was|were|been|being|be)\s+(being\s+)?([\w]+ed|[\w]+en|known|shown|seen|done|made|given|taken|found|said|told)\b/gi,
];

// ── Core Engine ────────────────────────────────────────────────

export function scoreNaturalness(htmlContent: string): NaturalnessReport {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100; // Start perfect, deduct for problems

    // Strip HTML tags for text analysis
    const text = htmlContent
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

    if (words.length < 100 || sentences.length < 5) {
        return {
            score: 50,
            lexicalDiversity: 0,
            sentenceVariance: 0,
            passiveVoicePercent: 0,
            aiPhraseCount: 0,
            repetitiveStarterCount: 0,
            readabilityGrade: 0,
            issues: ['Content too short for meaningful naturalness analysis'],
            suggestions: [],
        };
    }

    // ── 1. Lexical Diversity (Type-Token Ratio) ────────────────
    // TTR = unique words / total words (measured on first 500 words to normalize)
    const sampleWords = words.slice(0, 500).map(w => w.toLowerCase().replace(/[^a-z']/g, ''));
    const uniqueWords = new Set(sampleWords.filter(w => w.length > 2));
    const ttr = uniqueWords.size / Math.max(sampleWords.length, 1);

    // Human writing typically has TTR 0.45-0.65; AI is often 0.35-0.45
    let lexicalDiversity = ttr;
    if (ttr < 0.35) {
        score -= 15;
        issues.push(`Very low lexical diversity (TTR: ${ttr.toFixed(2)}) — repetitive vocabulary`);
        suggestions.push('Use more synonyms and varied vocabulary to avoid repetitive word choices');
    } else if (ttr < 0.42) {
        score -= 8;
        suggestions.push(`Lexical diversity is below average (TTR: ${ttr.toFixed(2)}) — consider varying word choices`);
    } else if (ttr > 0.55) {
        // Excellent diversity — slight bonus
        score = Math.min(score + 3, 100);
    }

    // ── 2. Sentence Length Variance ────────────────────────────
    const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const meanLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
    const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - meanLength, 2), 0) / sentenceLengths.length;
    const stdDev = Math.sqrt(variance);

    // Human writing has σ ~8-12; AI writing is often σ ~4-6
    if (stdDev < 4) {
        score -= 15;
        issues.push(`Sentence length is too uniform (σ: ${stdDev.toFixed(1)}) — classic AI pattern`);
        suggestions.push('Mix short punchy sentences (5-8 words) with longer complex ones (20-30 words)');
    } else if (stdDev < 6) {
        score -= 7;
        suggestions.push(`Sentence rhythm is slightly uniform (σ: ${stdDev.toFixed(1)}) — add more length variety`);
    } else if (stdDev > 10) {
        // Excellent rhythm — slight bonus
        score = Math.min(score + 3, 100);
    }

    // ── 3. Passive Voice Frequency ─────────────────────────────
    let passiveCount = 0;
    for (const pattern of PASSIVE_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) passiveCount += matches.length;
    }
    const passivePercent = (passiveCount / Math.max(sentences.length, 1)) * 100;

    // Acceptable: 5-15%; AI often hits 20-35%
    if (passivePercent > 30) {
        score -= 12;
        issues.push(`Excessive passive voice (${passivePercent.toFixed(0)}% of sentences)`);
        suggestions.push('Rewrite passive constructions to active voice (e.g., "X was created by Y" → "Y created X")');
    } else if (passivePercent > 20) {
        score -= 6;
        suggestions.push(`Passive voice is moderately high (${passivePercent.toFixed(0)}%) — aim for under 15%`);
    }

    // ── 4. AI Cliché Phrase Detection ──────────────────────────
    const lowerText = text.toLowerCase();
    let aiPhraseCount = 0;
    const detectedPhrases: string[] = [];

    for (const phrase of AI_PHRASE_BLACKLIST) {
        if (phrase.includes('.*')) {
            // Regex pattern
            const regex = new RegExp(phrase, 'gi');
            const matches = lowerText.match(regex);
            if (matches) {
                aiPhraseCount += matches.length;
                detectedPhrases.push(phrase.replace('.*', '...'));
            }
        } else {
            // Count occurrences
            let idx = 0;
            while ((idx = lowerText.indexOf(phrase, idx)) !== -1) {
                aiPhraseCount++;
                detectedPhrases.push(phrase);
                idx += phrase.length;
            }
        }
    }

    // Soft patterns (less penalty)
    let softCount = 0;
    for (const phrase of AI_SOFT_PATTERNS) {
        if (lowerText.includes(phrase)) softCount++;
    }

    const totalAIPhrases = aiPhraseCount + Math.ceil(softCount * 0.5);

    if (totalAIPhrases >= 8) {
        score -= 20;
        issues.push(`Heavy AI cliché usage: ${aiPhraseCount} blacklisted phrases detected`);
        suggestions.push(`Remove or rephrase: "${detectedPhrases.slice(0, 5).join('", "')}"`);
    } else if (totalAIPhrases >= 4) {
        score -= 10;
        issues.push(`Moderate AI cliché usage: ${aiPhraseCount} phrases detected`);
        suggestions.push(`Consider rephrasing: "${detectedPhrases.slice(0, 3).join('", "')}"`);
    } else if (totalAIPhrases >= 2) {
        score -= 4;
        suggestions.push(`Minor AI clichés detected: "${detectedPhrases.slice(0, 2).join('", "')}"`);
    }

    // ── 5. Repetitive Sentence Starters ────────────────────────
    const starters: string[] = [];
    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
        if (firstWord && firstWord.length > 1) {
            starters.push(firstWord);
        }
    }

    // Count consecutive same starters
    let repetitiveStarterCount = 0;
    for (let i = 1; i < starters.length; i++) {
        if (starters[i] === starters[i - 1]) {
            repetitiveStarterCount++;
        }
    }

    // Also count overall starter repetition (any word starting >15% of sentences)
    const starterFreq = new Map<string, number>();
    for (const s of starters) {
        starterFreq.set(s, (starterFreq.get(s) || 0) + 1);
    }
    const overusedStarters = Array.from(starterFreq.entries())
        .filter(([word, count]) => count / starters.length > 0.15 && count > 3 && !['the', 'a', 'an', 'it', 'this'].includes(word))
        .map(([word, count]) => `"${word}" starts ${count} sentences (${(count / starters.length * 100).toFixed(0)}%)`);

    if (repetitiveStarterCount >= 5) {
        score -= 12;
        issues.push(`${repetitiveStarterCount} consecutive sentence pairs start with the same word`);
        suggestions.push('Never start two consecutive sentences with the same word');
    } else if (repetitiveStarterCount >= 3) {
        score -= 5;
        suggestions.push(`${repetitiveStarterCount} consecutive same-word sentence starts detected — add variety`);
    }

    if (overusedStarters.length > 0) {
        score -= Math.min(overusedStarters.length * 4, 12);
        issues.push(`Overused sentence starters: ${overusedStarters.join('; ')}`);
    }

    // ── 6. Transition Word Overuse ─────────────────────────────
    // AI tends to use "However", "Moreover", "Furthermore" excessively
    const heavyTransitions = ['however', 'moreover', 'furthermore', 'additionally', 'consequently', 'nevertheless'];
    let transitionOveruse = 0;
    for (const t of heavyTransitions) {
        const regex = new RegExp(`\\b${t}\\b`, 'gi');
        const matches = lowerText.match(regex);
        if (matches) transitionOveruse += matches.length;
    }
    const transitionsPerK = (transitionOveruse / words.length) * 1000;
    if (transitionsPerK > 8) {
        score -= 8;
        issues.push(`Excessive formal transitions (${transitionOveruse} occurrences) — typical AI pattern`);
        suggestions.push('Replace formal transitions with natural connectors or just start new ideas directly');
    } else if (transitionsPerK > 5) {
        score -= 3;
        suggestions.push('Slightly heavy use of formal transition words — vary your connectors');
    }

    // ── 7. Sentence Length Check ────────────────────────────────
    // Human-style rules: most sentences should be under 18-20 words
    const avgSentenceLen = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
    const longSentences = sentenceLengths.filter(l => l > 20).length;
    const longPercent = (longSentences / sentenceLengths.length) * 100;

    if (avgSentenceLen > 22) {
        score -= 10;
        issues.push(`Average sentence length is ${avgSentenceLen.toFixed(0)} words — too long for easy reading`);
        suggestions.push('Break long sentences into shorter ones (aim for most under 18-20 words)');
    } else if (avgSentenceLen > 18) {
        score -= 4;
        suggestions.push(`Average sentence is ${avgSentenceLen.toFixed(0)} words — try breaking some into shorter ones`);
    }

    if (longPercent > 50) {
        score -= 6;
        issues.push(`${longPercent.toFixed(0)}% of sentences are over 20 words — too many long sentences`);
    }

    // ── 8. Contraction Usage ────────────────────────────────────
    // Natural writing uses contractions; AI tends to avoid them
    const contractionPattern = /\b(you're|it's|don't|can't|won't|they're|we're|isn't|aren't|doesn't|didn't|couldn't|shouldn't|wouldn't|haven't|hasn't|hadn't|wasn't|weren't|that's|there's|here's|what's|who's|how's|let's|I'm|I've|I'll|I'd|he's|she's|we've|we'll|they've|they'll)\b/gi;
    const contractionMatches = text.match(contractionPattern);
    const contractionCount = contractionMatches ? contractionMatches.length : 0;
    const contractionsPerK = (contractionCount / words.length) * 1000;

    if (contractionsPerK >= 8) {
        // Great — natural contraction use, small bonus
        score = Math.min(score + 3, 100);
    } else if (contractionsPerK < 2 && words.length > 500) {
        score -= 5;
        suggestions.push('Use more contractions (you\'re, it\'s, don\'t) to sound more natural');
    }

    // ── 9. Flesch-Kincaid Readability Grade ─────────────────────
    // Target: grade ≤ 8 for easy reading (12-year-old level)
    const syllableCount = words.reduce((total, word) => {
        return total + countSyllables(word);
    }, 0);

    const totalSentences = Math.max(sentenceLengths.length, 1);
    const totalWords = Math.max(words.length, 1);

    const fkGrade = 0.39 * (totalWords / totalSentences)
        + 11.8 * (syllableCount / totalWords)
        - 15.59;

    const readabilityGrade = Math.max(0, Math.round(fkGrade * 10) / 10);

    if (readabilityGrade > 12) {
        score -= 12;
        issues.push(`Flesch-Kincaid grade ${readabilityGrade} — reads like an academic paper`);
        suggestions.push('Simplify vocabulary and shorten sentences to reach grade 8 or below');
    } else if (readabilityGrade > 10) {
        score -= 8;
        issues.push(`Flesch-Kincaid grade ${readabilityGrade} — too complex for general audience`);
        suggestions.push('Aim for grade 8 or below: use simpler words and shorter sentences');
    } else if (readabilityGrade > 8) {
        score -= 4;
        suggestions.push(`Readability grade ${readabilityGrade} — try to simplify to grade 8`);
    }

    return {
        score: Math.max(score, 0),
        lexicalDiversity,
        sentenceVariance: stdDev,
        passiveVoicePercent: passivePercent,
        aiPhraseCount,
        repetitiveStarterCount,
        readabilityGrade,
        issues,
        suggestions,
    };
}

// ── Syllable Counter ──────────────────────────────────────────
// Estimates syllable count using vowel-group heuristic.
// Not perfect, but good enough for FK grade calculation.
function countSyllables(word: string): number {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 2) return 1;

    // Count vowel groups
    const vowelGroups = w.match(/[aeiouy]+/g);
    let count = vowelGroups ? vowelGroups.length : 1;

    // Silent 'e' at end
    if (w.endsWith('e') && !w.endsWith('le') && count > 1) {
        count--;
    }

    // Common suffixes that don't add syllables
    if (w.endsWith('ed') && !w.endsWith('ted') && !w.endsWith('ded') && count > 1) {
        count--;
    }

    return Math.max(count, 1);
}
