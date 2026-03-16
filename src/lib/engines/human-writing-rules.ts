// ============================================================
// RankMaster Pro - Human Writing Rules Engine
// Centralized module for natural, human-style content rules.
// Eliminates AI-sounding patterns across ALL content prompts.
// ============================================================

// ── Complete Banned Phrases List ──────────────────────────────
// Merged from user ruleset + existing naturalness-scorer blacklist.
// Used by both prompt injection AND post-generation scoring.

export const BANNED_PHRASES = [
    // ── User-specified mandatory bans ──────────────────────
    'in today\'s world',
    'in today\'s digital landscape',
    'in today\'s fast-paced',
    'in conclusion',
    'in summary',
    'furthermore',
    'moreover',
    'additionally',
    'it is important to note',
    'it\'s important to note',
    'it is worth noting',
    'it\'s worth noting',
    'when it comes to',
    'whether you\'re a beginner or expert',
    'whether you\'re a',
    'whether you are a',
    'this guide will walk you through',
    'unlock the power',
    'unlock the potential',
    'leverage',
    'seamless',
    'seamlessly',
    'robust',
    'robust and scalable',
    'cutting-edge',
    'state-of-the-art',
    'game-changer',
    'game changer',
    'comprehensive guide',
    'comprehensive article',
    'this comprehensive',
    'navigate the complexities',
    'delve into',
    'dive into',
    'dive deep into',
    'let\'s delve into',
    'let\'s dive into',

    // ── Extended AI cliché bans ────────────────────────────
    'in the ever-evolving',
    'in this comprehensive guide',
    'unleash the power',
    'harness the power',
    'harnessing the power',
    'harness the potential',
    'look no further',
    'without further ado',
    'buckle up',
    'at the end of the day',
    'the bottom line is',
    'in a nutshell',
    'it goes without saying',
    'needless to say',
    'as we all know',
    'it\'s no secret that',
    'the landscape of',
    'stands out as',
    'a testament to',
    'embark on a journey',
    'pivotal role',
    'crucial role',
    'plays a vital role',
    'revolutionize',
    'revolutionizing',
    'leverage the',
    'elevate your',
    'streamline your',
    'supercharge your',
    'take your .* to the next level',
    'navigating the',
    'navigating this',
    'we will explore',
    'let us explore',
    'we will discuss',
    'let us delve',
    'to sum up',
    'what the future holds',
    'the future is promising',
    'immense potential',

    // ── Transitional cliché starters ──────────────────────
    'firstly',
    'secondly',
    'finally',
    'one of the most important things',
    'there are many reasons why',
    'it can be said that',
    'overall',

    // ── Soft patterns (less penalty in scorer, but still banned in prompts) ──
    'you might be wondering',
    'you may be wondering',
    'rest assured',
    'first and foremost',
];

// ── Human-Style System Prompt Fragment ────────────────────────
// Prepend or merge this into every AI system prompt.

export const HUMAN_STYLE_SYSTEM_PROMPT = `You are a real human writer. Your writing sounds natural, simple, and clear.
You write like a person talking to a friend — not like a textbook or a sales pitch.
You use easy words, short sentences, and contractions (you're, it's, don't, can't).
A 12-year-old should understand every sentence you write.
You NEVER sound robotic, motivational, or corporate.`;

// ── Human-Style Content Rules Prompt Fragment ─────────────────
// Append this block to every content-generation prompt.

export const HUMAN_STYLE_CONTENT_RULES = `
HUMAN WRITING RULES (MANDATORY — content WILL BE REJECTED if these are broken):

1. LANGUAGE: Use simple, everyday words. No jargon unless you explain it right away.
2. SENTENCES: Keep most sentences under 18-20 words. Mix short (5-8 words) with medium (12-18 words). A few can be longer, but not many.
3. PARAGRAPHS: 2-4 lines max per paragraph. Break up walls of text.
4. CONTRACTIONS: Use them naturally — "you're", "it's", "don't", "can't", "won't", "they're".
5. TONE: Conversational and direct. Not formal. Not corporate. Not a textbook. Not salesy or motivational.
6. VARIETY: Start sentences in different ways. Never start two consecutive sentences with the same word. Vary paragraph length slightly.
7. TRANSITIONS: Use natural transitions ("So", "Here's the thing", "That said", "But", "And"). Do NOT use formal connectors (Moreover, Furthermore, Additionally, Consequently).
8. EXAMPLES: Add small, relatable examples when they help explain a point.
9. NO FILLER: Remove any line that doesn't add real value. No empty statements. No over-explaining simple ideas.

STRICTLY BANNED PHRASES — NEVER use these under any circumstances:
- "In today's world" / "In today's digital landscape"
- "In conclusion" / "In summary" / "Overall"
- "Furthermore" / "Moreover" / "Additionally"
- "It is important to note" / "It's worth noting"
- "When it comes to"
- "Whether you're a beginner or expert"
- "This guide will walk you through"
- "Unlock the power" / "Leverage" / "Seamless" / "Robust"
- "Cutting-edge" / "Game-changer" / "Comprehensive guide"
- "Navigate the complexities" / "Delve into" / "Dive deep"
- "Firstly, Secondly, Finally"
- "One of the most important things"
- "There are many reasons why" / "It can be said that"
- "Revolutionize" / "Harness the power" / "Embark on a journey"

ANTI-AI PATTERN CHECK (do this before finishing):
- No repeated sentence openings
- No generic filler lines
- No empty statements that say nothing
- No over-explaining simple ideas
- No unnatural keyword stuffing
- No predictable paragraph patterns (intro → point → summary for every section)

The content must feel written by a real person who knows the topic well and is explaining it simply.`;

// ── Post-Generation AI Pattern Cleaner ────────────────────────
// Runs on HTML output to catch any surviving banned phrases.

const PHRASE_REPLACEMENTS: [RegExp, string][] = [
    [/\bIn today'?s (?:digital )?(?:landscape|world|fast-paced)[.,]?\s*/gi, ''],
    [/\bIn conclusion[.,]?\s*/gi, ''],
    [/\bIn summary[.,]?\s*/gi, ''],
    [/\bOverall[.,]\s*/gi, ''],
    [/\bMoreover[.,]\s*/gi, ''],
    [/\bFurthermore[.,]\s*/gi, ''],
    [/\bAdditionally[.,]\s*/gi, ''],
    [/\bIt is important to note (?:that )?/gi, ''],
    [/\bIt'?s (?:important to note|worth noting) (?:that )?/gi, ''],
    [/\bWhen it comes to /gi, 'For '],
    [/\bThis comprehensive guide (?:will )?/gi, 'This article '],
    [/\bcomprehensive guide/gi, 'article'],
    [/\bcomprehensive article/gi, 'article'],
    [/\bdelve(?:s)? into/gi, 'look at'],
    [/\bdive(?:s)? (?:deep )?into/gi, 'look at'],
    [/\bnavigate the complexities of/gi, 'understand'],
    [/\bunlock the (?:power|potential) of/gi, 'use'],
    [/\bleverage\b/gi, 'use'],
    [/\bseamlessly?\b/gi, 'smoothly'],
    [/\brobust\b/gi, 'strong'],
    [/\bcutting-edge\b/gi, 'modern'],
    [/\bstate-of-the-art\b/gi, 'modern'],
    [/\bgame[- ]changer\b/gi, 'big deal'],
    [/\brevolutioniz(?:e|ing)\b/gi, 'changing'],
    [/\bharness(?:ing)? the power of/gi, 'using'],
    [/\bembark on a journey/gi, 'start'],
    [/\bFirstly[.,]\s*/gi, 'First, '],
    [/\bSecondly[.,]\s*/gi, 'Second, '],
    [/\bWithout further ado[.,]?\s*/gi, ''],
    [/\bIn a nutshell[.,]?\s*/gi, ''],
    [/\bAt the end of the day[.,]?\s*/gi, ''],
    [/\bIt goes without saying (?:that )?/gi, ''],
    [/\bNeedless to say[.,]?\s*/gi, ''],
    [/\bAs we all know[.,]?\s*/gi, ''],
];

/**
 * Post-generation cleaner that catches any surviving banned phrases
 * and fixes common AI writing patterns in the HTML output.
 * NOTE: Heading tags (H1-H6) are preserved during phrase replacement
 * to avoid stripping keyword-rich heading text.
 */
export function cleanAIPatterns(html: string): string {
    let cleaned = html;

    // 1. Replace banned phrases with neutral alternatives
    //    Skip text inside heading tags to preserve keyword-rich headings
    for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
        cleaned = replaceOutsideHeadings(cleaned, pattern, replacement);
    }

    // 2. Fix double spaces created by removals
    cleaned = cleaned.replace(/  +/g, ' ');

    // 3. Fix empty paragraphs created by removals
    cleaned = cleaned.replace(/<p>\s*<\/p>/gi, '');

    // 4. Fix leading space inside tags
    cleaned = cleaned.replace(/<(p|li|td|th|h[1-6])>\s+/gi, '<$1>');

    // 5. Capitalize first letter after tag if it was lowered by removal
    cleaned = cleaned.replace(/<(p|li|td)>([a-z])/gi, (_, tag, letter) => {
        return `<${tag}>${letter.toUpperCase()}`;
    });

    // 6. Fix dangling commas/periods at sentence start after phrase removal
    //    e.g., ", the data shows" → "The data shows"
    cleaned = cleaned.replace(/([.>])\s*[,;]\s+([a-z])/gi, (_, before, letter) => {
        return `${before} ${letter.toUpperCase()}`;
    });

    // 7. Fix mid-sentence lowercase after removal
    //    e.g., ". the next step" → ". The next step"
    cleaned = cleaned.replace(/\.\s+([a-z])/g, (_, letter) => {
        return `. ${letter.toUpperCase()}`;
    });

    // 8. Remove orphaned short sentences (under 4 words) left by removals
    //    e.g., "<p>That said.</p>" or "<p>So.</p>"
    cleaned = cleaned.replace(/<p>([^<]{1,20})\.<\/p>/gi, (match, text) => {
        const wordCount = text.trim().split(/\s+/).length;
        return wordCount <= 3 ? '' : match;
    });

    // 9. Fix empty list items
    cleaned = cleaned.replace(/<li>\s*<\/li>/gi, '');

    // 10. Inject natural contractions where formal forms survive
    cleaned = injectContractions(cleaned);

    return cleaned;
}

// ── Contraction Injection Post-Processor ─────────────────────
// Converts formal phrasing to natural contractions to sound human.
// Only applies inside text content (not HTML attributes or quotes).

const CONTRACTION_MAP: [RegExp, string][] = [
    [/\byou are\b/gi, "you're"],
    [/\bit is\b/gi, "it's"],
    [/\bdo not\b/gi, "don't"],
    [/\bdoes not\b/gi, "doesn't"],
    [/\bcan not\b/gi, "can't"],
    [/\bcannot\b/gi, "can't"],
    [/\bwill not\b/gi, "won't"],
    [/\bwould not\b/gi, "wouldn't"],
    [/\bcould not\b/gi, "couldn't"],
    [/\bshould not\b/gi, "shouldn't"],
    [/\bthey are\b/gi, "they're"],
    [/\bwe are\b/gi, "we're"],
    [/\bthere is\b/gi, "there's"],
    [/\bwhat is\b/gi, "what's"],
    [/\bthat is\b/gi, "that's"],
    [/\bwho is\b/gi, "who's"],
    [/\bhere is\b/gi, "here's"],
    [/\bit will\b/gi, "it'll"],
    [/\bis not\b/gi, "isn't"],
    [/\bare not\b/gi, "aren't"],
    [/\bwas not\b/gi, "wasn't"],
    [/\bwere not\b/gi, "weren't"],
    [/\bhave not\b/gi, "haven't"],
    [/\bhas not\b/gi, "hasn't"],
    [/\blet us\b/gi, "let's"],
];

function injectContractions(html: string): string {
    // Only apply contractions to text inside HTML tags, not inside attributes.
    // SKIP heading tags (H1-H6) — contracting "What is" → "What's" in headings
    // causes keyword mismatch with search queries like "What is SEO?".
    return html.replace(/>([^<]+)</g, (fullMatch, textContent: string, offset: number) => {
        // Check if we're inside a heading or blockquote tag by looking backwards
        const before = html.substring(Math.max(0, offset - 50), offset + 1);
        if (/<h[1-6][^>]*>$/i.test(before) || /<blockquote[^>]*>/i.test(before)) {
            return fullMatch; // Don't contract inside headings or blockquotes
        }
        let text = textContent;
        for (const [pattern, replacement] of CONTRACTION_MAP) {
            text = text.replace(pattern, replacement);
        }
        return `>${text}<`;
    });
}

// ── Heading-aware replacement helper ─────────────────────────
// Applies a regex replacement to HTML text but skips content
// inside heading tags (H1-H6) to preserve keyword-rich headings.

function replaceOutsideHeadings(html: string, pattern: RegExp, replacement: string): string {
    // Split HTML into heading vs non-heading segments
    // Match: <h1>...</h1> through <h6>...</h6>
    const headingRegex = /(<h[1-6][^>]*>.*?<\/h[1-6]>)/gi;
    const parts = html.split(headingRegex);

    return parts.map(part => {
        // If this part is a heading tag, return it unchanged
        if (/^<h[1-6][^>]*>/i.test(part)) {
            return part;
        }
        // Otherwise, apply the replacement
        return part.replace(pattern, replacement);
    }).join('');
}

// ── Sentence-Level Rewriting ──────────────────────────────────
// Identifies individual robotic sentences and rewrites them via AI.
// Used as a final post-processing pass after cleanAIPatterns.

/** Patterns that indicate a sentence is robotic / AI-generated */
const ROBOTIC_SENTENCE_PATTERNS: RegExp[] = [
    /^(Additionally|Moreover|Furthermore|Consequently|Subsequently|Notably|Importantly|Interestingly|Undoubtedly|Undeniably),?\s/i,
    /^(It is|It's) (important|worth|essential|crucial|vital|imperative) (to|that)/i,
    /^(This|These|That|Those) (ensures?|provides?|enables?|allows?|facilitates?|demonstrates?|highlights?|underscores?|showcases?)\s/i,
    /^(By|Through) (leveraging|utilizing|harnessing|implementing|incorporating|embracing)\s/i,
    /\b(plays a (?:crucial|vital|key|pivotal|significant) role)\b/i,
    /\b(is a (?:game[- ]changer|must-have|no-brainer))\b/i,
    /\b(serves as a (?:testament|reminder|beacon))\b/i,
    /\b(?:landscape|paradigm|ecosystem|synergy|holistic approach)\b/i,
];

/** Patterns for sentences that are too passive / formal */
const PASSIVE_FORMAL_PATTERNS: RegExp[] = [
    /^It (?:should be noted|must be emphasized|cannot be overstated|is widely recognized) that\b/i,
    /^(?:In order to|For the purpose of|With regard to|In accordance with|In the context of)\b/i,
];

/**
 * Identifies robotic sentences in HTML content.
 * Returns an array of { original, reason } objects.
 */
export function identifyRoboticSentences(html: string): { original: string; reason: string }[] {
    // Extract text from paragraph and list item tags
    const textBlocks = html.match(/<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/gi) || [];
    const robotic: { original: string; reason: string }[] = [];

    for (const block of textBlocks) {
        const text = block.replace(/<[^>]+>/g, '').trim();
        if (!text || text.length < 20) continue;

        // Split into sentences
        const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 15);

        for (const sentence of sentences) {
            // Check robotic patterns
            for (const pattern of ROBOTIC_SENTENCE_PATTERNS) {
                if (pattern.test(sentence)) {
                    robotic.push({ original: sentence, reason: 'AI cliché pattern' });
                    break;
                }
            }

            // Check passive/formal patterns
            for (const pattern of PASSIVE_FORMAL_PATTERNS) {
                if (pattern.test(sentence)) {
                    robotic.push({ original: sentence, reason: 'Overly formal/passive' });
                    break;
                }
            }

            // Check for very long sentences (40+ words)
            const wordCount = sentence.split(/\s+/).length;
            if (wordCount > 40) {
                robotic.push({ original: sentence, reason: `Too long (${wordCount} words)` });
            }
        }
    }

    // Deduplicate and limit to 8
    const seen = new Set<string>();
    return robotic.filter(r => {
        if (seen.has(r.original)) return false;
        seen.add(r.original);
        return true;
    }).slice(0, 8);
}

/**
 * Rewrites robotic sentences via AI in a single batch call.
 * Requires an AI generate function. Returns the HTML with
 * robotic sentences replaced by natural alternatives.
 */
export async function rewriteRoboticSentences(
    html: string,
    aiGenerate: (prompt: string) => Promise<string>
): Promise<string> {
    const robotic = identifyRoboticSentences(html);
    if (robotic.length === 0) return html;

    console.log(`[SentenceRewriter] Found ${robotic.length} robotic sentence(s) to fix`);

    // Build a single batch prompt for efficiency
    const prompt = `Rewrite each numbered sentence below to sound natural, conversational, and simple. 
Keep the SAME meaning but:
- Use short words, contractions, and active voice
- Remove filler phrases and hedging
- Keep sentences under 20 words when possible
- Sound like a knowledgeable friend explaining something

Return ONLY the rewritten sentences, one per line, numbered to match.

${robotic.map((r, i) => `${i + 1}. ${r.original}`).join('\n')}`;

    try {
        const result = await aiGenerate(prompt);
        const rewrittenLines = result.trim().split('\n').filter(l => l.trim());

        let modified = html;
        for (let i = 0; i < Math.min(robotic.length, rewrittenLines.length); i++) {
            // Strip the numbering prefix (e.g., "1. " or "1) ")
            const rewritten = rewrittenLines[i].replace(/^\d+[.)]\s*/, '').trim();
            if (rewritten && rewritten.length > 10 && rewritten.length < robotic[i].original.length * 2) {
                modified = modified.replace(robotic[i].original, rewritten);
            }
        }

        return modified;
    } catch (error) {
        console.error('[SentenceRewriter] AI rewrite failed:', error);
        return html; // Return original on failure
    }
}
