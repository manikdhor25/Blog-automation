// ============================================================
// Content Writer — Shared Prompt Builders
// Used by both generateArticle() and streaming route
// Extracted from content-writer.ts for modularity
// ============================================================

import { HUMAN_STYLE_SYSTEM_PROMPT, HUMAN_STYLE_CONTENT_RULES } from './human-writing-rules';
import {
    ContentPromptOptions,
    WORD_COUNT_MINIMUMS,
    getTemplateVariation,
} from './content-utils';

export function buildContentPrompt(opts: ContentPromptOptions): {
    prompt: string;
    systemPrompt: string;
} {
    const variation = getTemplateVariation();
    const lang = opts.language || 'en';
    const langInstruction = lang !== 'en'
        ? `\n\nIMPORTANT: Write the ENTIRE article in ${lang} language. All headings, body text, FAQ answers, and meta descriptions must be in ${lang}.`
        : '';

    // PAA integration (#6) — seed FAQ with real search questions
    const paaSection = opts.paaQuestions && opts.paaQuestions.length > 0
        ? `\n\nPEOPLE ALSO ASK (use these as FAQ seeds and inspiration for H2/H3 headings):\n${opts.paaQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        : '';

    // Author data — use real data or generic editorial (#3 EEAT fix)
    const authorName = opts.authorName || 'Editorial Team';
    const authorBio = opts.authorBio || '';
    const authorInstruction = authorBio
        ? `Add this author box at the ${variation.authorBoxPosition === 'top_after_h1' ? 'top (after H1)' : 'bottom (before Sources)'}:
    <div class="author-box"><strong>${authorName}</strong><p>${authorBio}</p></div>`
        : `Add a "Written by ${authorName}" byline. Place it ${variation.authorBoxPosition === 'top_after_h1' ? 'after the H1' : 'before the Sources section'}.`;

    // Takeaways format based on variation
    const takeawaysInstr = {
        bullets: 'KEY TAKEAWAYS as a bulleted (unordered) list',
        numbered: 'KEY TAKEAWAYS as a numbered (ordered) list',
        callout_box: 'KEY TAKEAWAYS inside a <div class="callout-box"> styled section',
    }[variation.takeawaysFormat];

    const takeawaysPos = {
        after_intro: 'immediately after the introduction paragraph',
        before_conclusion: 'just before the conclusion',
    }[variation.takeawaysPosition];

    // Determine enforced minimum word count
    const minWords = opts.minWordCount || (opts.isCluster ? WORD_COUNT_MINIMUMS.cluster : WORD_COUNT_MINIMUMS.normal);
    const targetWords = Math.max(opts.targetWordCount, minWords);
    const articleType = opts.isCluster ? 'CLUSTER/PILLAR' : 'STANDARD';

    const prompt = `Write an SEO-optimized article targeting the keyword: "${opts.keyword}"

PHASE 1 - SEARCH INTENT UNDERSTANDING (Do not output, internalize only):
- What problem brought the reader here?
- What outcome do they want?
- What confusion or frustration might they have?
Write the article so the reader feels understood immediately.

PHASE 2 - COMPETITOR GAP ANALYSIS:
- Average competitor word count: ${opts.competitorInsight.avgWordCount}
- Common topics covered: ${opts.competitorInsight.commonTopics.join(', ')}
- Content gaps to exploit: ${opts.competitorInsight.contentGaps.join(', ')}
- Featured snippet opportunities: ${opts.competitorInsight.snippetOpportunities.join(', ')}
${opts.niche ? `- Niche: ${opts.niche}` : ''}
${opts.existingPosts ? `- Related posts on site: ${opts.existingPosts.join(', ')}` : ''}

PHASE 3 - INFORMATION GAIN:
Add value beyond existing articles by including at least three of the following:
- a memorable framework or model
- deeper explanation of underlying psychology or science
- real-world example or scenario
- implementation checklist
- explanation of common mistakes
- clear cause-and-effect reasoning
${paaSection}${langInstruction}

REQUIREMENTS:
1. **MANDATORY MINIMUM WORD COUNT: ${minWords} words** (Article type: ${articleType})
   - This is a HARD requirement. The article MUST contain at least ${minWords} words of substantive content.
   - Target ${targetWords}+ words to ensure the minimum is met after formatting.
   - DO NOT pad with filler - every section must add real value.
   - Ensure ${opts.isCluster ? '10-15' : '6-10'} well-developed H2 sections with multiple H3 subsections each.

2. FORMAT: Return valid HTML ONLY - use h1, h2, h3, p, ul, ol, li, table, strong, a, blockquote tags.
   - DO NOT use markdown syntax (no ## headings, no * bullets, no triple-backtick code blocks) - this will BREAK the output.
   - Every heading MUST use HTML tags: <h2>Heading Text</h2> NOT ## Heading Text
   - Every list MUST use <ul><li> or <ol><li> NOT * or -
   - Every paragraph MUST be wrapped in <p> tags

3. ARTICLE STRUCTURE:
   - <h1> title with keyword - make it specific and unique, NOT generic
   - "Last Updated: ${new Date().toISOString().split('T')[0]}" badge near the H1
   - 1. Direct Answer (40-60 words): Provide a concise response to the main query immediately.
   - 2. Opening Scene: Start with a relatable situation the reader recognizes. Target 150-250 words total for intro.
   - 3. Why the Problem Happens: Explain the science, psychology, or behavior behind the issue.
   - 4. Introduce a Clear Framework: Create a memorable system or model relevant to the topic.
   - 5. Walk Through the Framework: Explain each step with practical insight using H2s and H3s. Include ${variation.h2Count} H2s total.
   - 6. Realistic Example: Show how someone could apply the advice in real life.
   - 7. Common Mistakes: Explain typical errors and how to avoid them in an H2 section.
   - 8. Practical Implementation Checklist: Provide simple steps readers can follow immediately. Include at least TWO ordered/unordered actionable lists.
   - 9. Comparison/Differentiation: At least ONE comparison table WITH REAL DIFFERENTIATION (4+ columns comparing actual features, pricing, ratings, or specs).
   - 10. ${takeawaysInstr}, placed ${takeawaysPos}
   - 11. FAQ Section (4-6 questions): Include ${variation.faqCount} realistic search questions. Each answer MUST be 40-60 words (3-4 sentences). Single-sentence FAQ answers are UNACCEPTABLE.
   - 12. Closing Perspective: Encourage readers to start with one small action. Add SOURCES and REFERENCES section with REAL URLs (must include https:// links to actual pages).

4. IMAGE SEO:
   - Add ${variation.imageCount} image placements using HTML comments: <!-- IMAGE: [description] | alt: "[keyword-rich alt text]" -->
   - Place after key headings - NEVER skip this requirement
   - Include at least 1 infographic/chart suggestion and 1 hero image

5. ENTITY COVERAGE:
   - Mention ALL key entities: ${(opts.competitorInsight.keyEntities || []).join(', ')}
   - Add unique entities competitors missed
   - Use full proper names on first mention

6. SEO OPTIMIZATION:
   - Keyword in H1, first paragraph, 2+ H2s, and closing section
   - Keyword density: 0.8-1.5% (DO NOT exceed 1.5%)
   - Semantic related terms naturally integrated

7. AEO / GEO OPTIMIZATION:
   - Direct, concise answers after each question heading (40-60 words each)
   - Question-based H2/H3 headings ("What is...", "How does...", "Why should...")
   - After each H2, add a 1-2 sentence TL;DR in <strong> tags
   - Statistics MUST include year and source: "73% of marketers (HubSpot, 2025)"

8. FEATURED SNIPPET OPTIMIZATION:
   - Paragraph snippet: 40-60 word definition after "What is..." heading
   - List snippet: Numbered steps for "How to..." sections
   - Table snippet: Feature comparison table

9. E-E-A-T SIGNALS:
   - DO NOT fabricate experience claims or credentials
   - Use third-person expert framing: "Industry analysts at Gartner note..."
   - All statistics must reference 2025 or 2026 data - NEVER cite data from 2020-2024 as current
   - Reference 3+ authoritative sources with full HTTPS URLs
   - ${authorInstruction}
   - Practical observations suggesting real-world familiarity

10. VOICE/TONE: ${opts.tone || 'intelligent, calm, conversational, and credible'}.

${HUMAN_STYLE_CONTENT_RULES}

11. ATTRIBUTION VARIETY - Do NOT repeat "According to" more than 2 times. Use alternatives:
    - "Gartner's 2025 analysis shows..."
    - "Data from McKinsey reveals..."
    - "A 2026 IBM study found..."
    - "Research published by [source] indicates..."
    - "[Source] reports that..."
    - "The latest data from [source] suggests..."
    - "[Specific number]% of [group] - [Source], 2025"
    - Inline parenthetical: "...saw a 40% increase (Forrester, 2025)"

Respond with JSON:
{
  "title": "Clickable H1 — use CTR formula: Number+Keyword+Promise, Keyword+Outcome, or Question+Hook. Include a power word (proven, essential, tested, real, surprising). NEVER use 'Ultimate Guide', 'Complete Guide', 'Everything You Need to Know', or similar generic patterns.",
  "metaTitle": "≤60 chars — keyword in first 5 words, include click trigger (year/${new Date().getFullYear()}, number, [bracket], power word). MUST be DIFFERENT from the H1 title — shorter, punchier, optimized for SERP CTR.",
  "metaDescription": "155-char compelling meta description with keyword and CTA",
  "content": "<full HTML content>",
  "faqSection": [{ "question": "...", "answer": "concise 40-60 word answer" }],
  "suggestedInternalLinks": ["topic suggestions for internal linking"],
  "suggestedExternalLinks": ["types of authoritative sources to link to"]
}`;

    const systemPrompt = `${HUMAN_STYLE_SYSTEM_PROMPT}

You are an investigative journalist, research analyst, behavioral science writer, and SEO strategist responsible for creating authoritative editorial content.
Your goal is to produce an article that could realistically become one of the most valuable resources available online for this topic.
Your writing is:
- Data-driven: every claim is backed by a real, verifiable source
- Structurally optimized for Featured Snippets, AI Overviews, and Answer Engines
You NEVER fabricate statistics, quotes, or credentials. If you do not have a real source, you say "research suggests" rather than inventing a specific number.
Always respond with valid JSON.`;

    return { prompt, systemPrompt };
}

// Shared streaming prompt builder (condensed for real-time gen)
export function buildStreamingPrompt(opts: ContentPromptOptions): {
    prompt: string;
    systemPrompt: string;
} {
    const variation = getTemplateVariation();
    const lang = opts.language || 'en';
    const langInstruction = lang !== 'en' ? `\n\nIMPORTANT: Write the ENTIRE article in ${lang} language.` : '';

    const paaSection = opts.paaQuestions && opts.paaQuestions.length > 0
        ? `\nPEOPLE ALSO ASK: ${opts.paaQuestions.slice(0, 5).join(' | ')} `
        : '';

    // Takeaways format based on variation (copied from buildContentPrompt for consistency)
    const takeawaysInstr = {
        bullets: 'KEY TAKEAWAYS as a bulleted (unordered) list',
        numbered: 'KEY TAKEAWAYS as a numbered (ordered) list',
        callout_box: 'KEY TAKEAWAYS inside a <div class="callout-box"> styled section',
    }[variation.takeawaysFormat];

    const takeawaysPos = {
        after_intro: 'immediately after the introduction paragraph',
        before_conclusion: 'just before the conclusion',
    }[variation.takeawaysPosition];

    const minWords = opts.minWordCount || (opts.isCluster ? WORD_COUNT_MINIMUMS.cluster : WORD_COUNT_MINIMUMS.normal);
    const targetWords = Math.max(opts.targetWordCount, minWords);

    const prompt = `Write an SEO-optimized article targeting: "${opts.keyword}"

PHASE 1 - SEARCH INTENT/GAP ANALYSIS: Internalize user intent. Competitor avg: ${opts.competitorInsight.avgWordCount} words. Topics: ${opts.competitorInsight.commonTopics.join(', ')}. Gaps: ${opts.competitorInsight.contentGaps.join(', ')}.

PHASE 2 - INFORMATION GAIN: Include framework, psychology, real examples, checklist, and mistake analysis.
${opts.niche ? `NICHE: ${opts.niche}` : ''}${paaSection}${langInstruction}

MANDATORY MINIMUM: ${minWords} words. Target ${targetWords}+ words. This is NON-NEGOTIABLE.

12-STEP STRUCTURE:
1. H1 with Keyword and Badge.
2. Direct Answer (40-60 words).
3. Opening Scene (150-250 words total intro).
4. Why the Problem Happens (science/psychology).
5. Framework (Introduce model).
6. Walk Through Framework (${opts.isCluster ? '10-15' : variation.h2Count} H2s total with H3s).
7. Realistic Example.
8. Common Mistakes section.
9. Practical Implementation Checklist (2+ lists).
10. Comparison Table (4+ columns).
11. ${takeawaysInstr} (${takeawaysPos}).
12. FAQ (${variation.faqCount} Qs, 40-60 word answers) + Sources (real URLs).

FORMAT: Valid HTML ONLY. No markdown. Use h1, h2, h3, p, ul, ol, li, table, strong, a.
SEO: keyword density 0.8-1.5%, AEO (Q&A/TL;DRs), GEO (entities), E-E-A-T (real 2025/26 data, Author byline).
IMAGE SEO: Add ${variation.imageCount} <!-- IMAGE: [desc] | alt: "[alt]" -->.
${HUMAN_STYLE_CONTENT_RULES}

Return ONLY the HTML content. Do not wrap in JSON or code blocks.`;

    const systemPrompt = `${HUMAN_STYLE_SYSTEM_PROMPT}

You are also a senior content strategist creating rank-worthy articles. Never fabricate data - attribute every stat. Optimize for Google, AI Overviews, and Featured Snippets.`;

    return { prompt, systemPrompt };
}
