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

// ── #1: GEO (Generative Engine Optimization) Content Rules ────
// Ensures content is optimized for AI engine citation/extraction
export const GEO_CONTENT_RULES = `
GEO (GENERATIVE ENGINE OPTIMIZATION) RULES:
- Use structured attribution patterns throughout:
  • "According to [Source], [specific claim with data]"
  • "Research from [Institution] shows that [finding]"
  • "[Expert Name], [Title] at [Organization], notes that [insight]"
  • "A [Year] study published in [Source] found that [result]"
- Include at least 3-4 attributed quotes or data points per article
- Every statistical claim MUST have an inline attribution — no orphaned stats
- Write self-contained sentences: avoid "This is important" without a clear antecedent
- Structure paragraphs so AI engines can extract them as standalone answers
- Use "is-a" definitions for key terms: "[Term] is [concise definition]"
- Prefer concrete numbers over vague qualifiers: "42% increase" not "significant increase"

AI ENGINE EXTRACTION OPTIMIZATION:
- Keep extractable answer blocks to 2-3 sentences (40-60 words) — this is the sweet spot for Google AI Overviews and Perplexity
- Include the question/topic keyword at the START of each answer passage — Bing Copilot weights opening terms heavily
- Use inline citations with year: "(Source, 2025)" — Perplexity and ChatGPT use these to verify claims
- Structure data as "X is Y" or "X does Y" patterns — AI engines prefer definitive declarative sentences over hedged language
- Avoid pronouns in extractable passages — use the full noun/term so the passage makes sense when pulled out of context
`;

// ── #2: AEO (Answer Engine Optimization) NLP Rules ────────────
// Structures content for direct extraction by answer engines
export const AEO_NLP_RULES = `
AEO (ANSWER ENGINE OPTIMIZATION) NLP RULES:
- Use "is-a" definition patterns: "[Term] is [definition]" within the first 2 sentences of each H2 section
- Include entity-attribute-value triples: "[Entity] has [attribute] of [value]"
- The first paragraph under EVERY H2 must be a direct, self-contained answer (40-60 words)
- Question-H2s must be answered in the FIRST sentence — not the second or third
- Use subject-verb-object order for key claims (active voice)
- Include at least 3 "is-a" definitions throughout the article for key concepts
- Each H3 subsection should open with its most important finding or claim
`;

// ── #38: Passage Ranking Optimization Rules ───────────────────
// Ensures individual passages can rank independently
export const PASSAGE_RANKING_RULES = `
PASSAGE RANKING OPTIMIZATION:
- The FIRST paragraph under each H2/H3 MUST be a self-contained answer passage (40-60 words)
- Each passage must:
  • Start with the topic or question being answered
  • Contain NO anaphoric references ("this", "it", "these") without a clear antecedent in the SAME paragraph
  • Be factually complete WITHOUT requiring surrounding context
  • Google can rank this paragraph INDEPENDENTLY — write it that way
- Vary passage formats: some as definitions, some as processes, some as comparisons
`;

// ── #11: Expertise Signals (de-fabricated) ────────────────────
// Demonstrates E-E-A-T expertise WITHOUT inventing first-hand experience.
// First-person testing claims are gated on real input data; otherwise
// everything is attributed to named third parties. Resolves the prior
// contradiction with the "DO NOT fabricate experience" requirement.
export const EXPERTISE_SIGNALS = `
EXPERTISE & TRUST SIGNALS (demonstrate expertise WITHOUT fabricating experience):
- Show analytical depth using SOURCED framing, not invented testing:
  • "Across the sources reviewed, the consistent pattern is [insight]."
  • "Published data from [Named Org, Year] points to [finding]."
  • "[Expert Name], [Title] at [Org], notes that [insight]."
- Add at least 1 non-obvious insight competitors miss — a contrarian take, an overlooked factor, or a novel connection.
- Add 1 "what most guides get wrong" callout that challenges conventional advice WITH a cited reason.
- FIRST-PERSON RULE: Use "we tested / I measured / in our analysis" ONLY when real first-party data is supplied in the input.
  If no first-party data exists, attribute everything to named third parties instead. NEVER manufacture a personal test or hands-on experience.
`;

/** @deprecated Renamed to EXPERTISE_SIGNALS (de-fabricated). Kept as alias for backward compatibility. */
export const ORIGINAL_RESEARCH_SIGNALS = EXPERTISE_SIGNALS;

// ── Shared Section SEO Rules (AEO + GEO + passage ranking) ─────
// CRITICAL: this block MUST be injected into every section-level prompt
// on the live generateFromOutline() path, which previously received only
// HUMAN_STYLE_CONTENT_RULES and silently lost AEO/GEO/passage instructions.
export const SECTION_SEO_RULES = `
ANSWER-ENGINE & PASSAGE RULES (apply to THIS section):
- The FIRST paragraph under the H2 is a self-contained answer of 40-60 words.
  • Start with the topic/question being answered.
  • No "this/it/these/that" without an antecedent in the SAME paragraph.
  • It must make full sense pulled out of context — Google ranks passages independently.
- Use one "is-a" definition for the section's key term: "[Term] is [definition]".
- Question-format H2s are answered in the FIRST sentence, not the second.

CITATION RULES:
- Every statistic carries an inline source + year: "73% of marketers (HubSpot, 2025)".
- No orphaned stats. No vague "significant increase" — use the real number.
- Vary attribution. Do NOT use "According to" more than twice per article. Rotate:
  "Data from [X] shows...", "[X]'s 2025 analysis found...", "(Forrester, 2025)", "[X] reports that...".
`;

// ── CTA Placement Rules (revenue-critical) ────────────────────
// Affiliate conversion paths. Previously only present in the deprecated
// buildContentPrompt; now shared so the live path enforces CTAs too.
export const CTA_RULES = `
CTA PLACEMENT (this is an affiliate platform — conversion paths are mandatory):
- Reviews & listicles: at least 2 CTAs — one in the verdict/top-pick, one mid-article.
- Comparisons: 1 CTA in the winner section.
- How-tos: 1 CTA after the most complex step ("Stuck here? [Tool] handles this for you").
- All other types: 1 soft CTA mid-article, 1 direct CTA before the conclusion.
- Format: <div class="cta-box"><strong>[Action]</strong><p>[value in one line]</p><a href="[URL]" class="cta-button">[Button]</a></div>
- Frame as solving the reader's problem, never as a sales pitch.
`;

// ── Article-type → section body rules ─────────────────────────
// Maps the article-level content type to body-writing instructions for
// individual sections. The live path's section enum (explanation/list/etc.)
// is too coarse to carry verdict/winner/CTA semantics — this restores them.
export const ARTICLE_TYPE_BODY_RULES: Record<string, string> = {
    review: 'If this is the verdict section: include a score out of 10, a pros/cons list, and an affiliate CTA.',
    listicle: 'If this section is a ranked item: number it (#N), add a "Best for [use case]" line, and pros/cons.',
    comparison: 'Declare a WINNER for this feature with a specific, data-backed reason.',
    how_to: 'Number each step. Add a time estimate. Keep readability easy (Flesch-Kincaid grade 8 or below).',
    beginner_guide: 'Assume ZERO prior knowledge. Define every term on first use. Keep Flesch-Kincaid grade 8 or below.',
    problem_solution: 'Rank solutions by effectiveness. Include a "what does NOT work" note where relevant.',
    case_study: 'Use ONLY real supplied data. Do not invent personal testing or fabricated timelines.',
    news: 'Lead with what changed. Include specific dates. Add a "what this means for you" angle.',
    alternatives: "Lead with the original tool's pain points. Build toward a clear \"my top pick\".",
    article: '',
};

// ── #32: Anti-Commodity Content Instruction ────────────────────
export const ANTI_COMMODITY_INSTRUCTION = `
ANTI-COMMODITY CONTENT RULE:
- Include at least 1 unique insight that NO competitor article mentions — a contrarian take, an overlooked factor, or a novel connection between concepts
- Add at least 1 "what most guides get wrong" callout that challenges conventional advice with evidence
- Include a proprietary framework, model, or classification system unique to this article
`;

// ── Content Formatting Diversity Rules ────────────────────────
// Ensures rich visual variety in generated content
export const CONTENT_FORMAT_RULES = `
CONTENT FORMAT DIVERSITY (MANDATORY — articles score low without visual variety):

1. CALLOUT BOXES — Include at least 2 callout boxes using this exact HTML:
   - Pro Tip: <div class="callout-tip"><div class="callout-icon">💡</div><div class="callout-content"><strong class="callout-title">Pro Tip</strong><p>[tip content]</p></div></div>
   - Warning: <div class="callout-warning"><div class="callout-icon">⚠️</div><div class="callout-content"><strong class="callout-title">Warning</strong><p>[warning content]</p></div></div>
   - Note: <div class="callout-note"><div class="callout-icon">📌</div><div class="callout-content"><strong class="callout-title">Note</strong><p>[note content]</p></div></div>
   - Info: <div class="callout-info"><div class="callout-icon">ℹ️</div><div class="callout-content"><strong class="callout-title">Did You Know?</strong><p>[info content]</p></div></div>

2. PULL QUOTES — Include 1 expert pull quote using:
   <figure class="pull-quote"><blockquote>[important quote or insight]</blockquote><figcaption>— [Source Name], [Title/Org]</figcaption></figure>

3. STAT HIGHLIGHTS — Include 1-2 standout statistics using:
   <div class="stat-highlight"><span class="stat-number">[number]%</span><span class="stat-label">[what it measures]</span><span class="stat-source">[Source, Year]</span></div>

4. DEFINITION LISTS — For glossary/terminology sections, use:
   <dl><dt>[Term]</dt><dd>[Definition]</dd></dl>

5. NESTED LISTS — Use nested <ul> or <ol> when listing items with sub-items

6. CODE BLOCKS — For technical content, wrap code in:
   <pre><code class="language-[lang]">[code]</code></pre>
`;

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
    // MI-2: Enhanced with explicit PAA answer formatting guidance
    const paaSection = opts.paaQuestions && opts.paaQuestions.length > 0
        ? `\n\nPEOPLE ALSO ASK (use these as FAQ seeds and inspiration for H2/H3 headings):
${opts.paaQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
PAA ANSWER FORMATTING: For each PAA question used in FAQ or headings:
- Answer in the FIRST sentence — direct, no hedging, no preamble
- Keep answers 2-3 sentences (40-60 words total) — concise enough for Google to extract
- Start with a definitive statement: "[X] is..." or "The best way to [Y] is..."
- Do NOT start with "Great question!" or "That depends" — be specific immediately`
        : '';

    // Author data — use real data or generic editorial (#3 EEAT fix)
    // MG-3: Structured EEAT credential template for author boxes
    const authorName = opts.authorName || 'Editorial Team';
    const authorBio = opts.authorBio || '';
    const authorBoxPosition = variation.authorBoxPosition === 'top_after_h1' ? 'top (after H1)' : 'bottom (before Sources)';
    const authorInstruction = authorBio
        ? `Add this author box at the ${authorBoxPosition}:
    <div class="author-box"><strong>${authorName}</strong><p>${authorBio}</p></div>
    EEAT CREDENTIAL FORMAT: If the bio includes credentials, format them as:
    - Years of experience: "[N]+ years in [field]"
    - Certifications: "Certified [credential] by [authority]"
    - Publications: "Published in [journal/outlet]"
    - Domain expertise: "Specializing in [specific area]"
    These credential signals directly impact E-E-A-T scoring for search rankings.`
        : `Add a "Written by ${authorName}" byline. Place it ${authorBoxPosition}.
    Include a brief credential line: "[Role] with [N] years covering [topic area]" — even generic editorial teams need authority signals.`;

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

    // MG-1: Content type flow-through — inject type-specific writing rules
    const contentTypeWritingRules = opts.contentType && opts.contentType !== 'article'
        ? `\nCONTENT TYPE: ${opts.contentType.toUpperCase().replace('_', ' ')}
Follow the outline structure EXACTLY — this is a ${opts.contentType.replace(/_/g, ' ')} article, NOT a generic article.
${opts.contentType === 'review' ? 'Include a verdict score (X/10), pros/cons lists, and affiliate CTA in Final Verdict.' : ''}
${opts.contentType === 'listicle' ? 'Number each item clearly (#1, #2...). Include "Our Pick" or "Best Overall" badge for top item. Each item needs its own H2.' : ''}
${opts.contentType === 'comparison' ? 'Declare a WINNER for every feature comparison. Use comparison tables with real data. Each feature gets its own H2.' : ''}
${opts.contentType === 'how_to' ? 'Number every step. Include time estimates. Add a "What You\'ll Need" checklist at the top. Follow the readability target specified by the complexity setting above.' : ''}
${opts.contentType === 'beginner_guide' ? 'Assume ZERO prior knowledge. Define every term on first use. Target Flesch 60-75 for general topics, 50-65 for technical topics. Progress from basic to intermediate.' : ''}
${opts.contentType === 'problem_solution' ? 'Include a "What DOESN\'T Work" section to build trust. Rank solutions by effectiveness.' : ''}
${opts.contentType === 'case_study' ? 'Use timeline structure. Include specific before/after metrics. Emphasize personal experience.' : ''}
${opts.contentType === 'news' ? 'Lead with the news. Include specific dates. Add "What This Means For You" analysis. Keep under 1500 words.' : ''}
${opts.contentType === 'alternatives' ? 'Lead with pain points of the original. Include a quick comparison table. Declare "My Top Pick" clearly.' : ''}`
        : '';

    // Content layer instructions for pillar/cluster/micro differentiation
    let contentLayerWritingRules = '';
    if (opts.contentLayer === 'pillar') {
        contentLayerWritingRules = `\nCONTENT TIER: PILLAR — This is the definitive hub article. Cover the topic from every angle. Link OUT to cluster articles using "[See our detailed guide on X]" placeholders.`;
    } else if (opts.contentLayer === 'supporting') {
        contentLayerWritingRules = `\nCONTENT TIER: SUPPORTING / CLUSTER ARTICLE
- Focus NARROWLY on one subtopic
- Link BACK to the pillar article at least 2 times (intro + conclusion)
- Go DEEPER than the pillar on this specific subtopic
- Reference sibling cluster articles where relevant`;
    } else if (opts.contentLayer === 'micro') {
        contentLayerWritingRules = `\nCONTENT TIER: MICRO — Answer ONE specific question in 600-800 words. Optimize for Featured Snippet capture. Link to the pillar article for readers wanting more depth.`;
    }

    const prompt = `Write an SEO-optimized article targeting the keyword: "${opts.keyword}"
${contentTypeWritingRules}${contentLayerWritingRules}

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
${opts.lsiKeywords && opts.lsiKeywords.length > 0 
    ? `\n6b. LSI / SEMANTIC KEYWORDS (integrate naturally — aim for 60%+ coverage):
    ${opts.lsiKeywords.map(k => `• ${k}`).join('\n    ')}
    These must appear naturally in body text, headings, or FAQ answers — NOT keyword-stuffed.`
    : ''}

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
    - DATA RECENCY RULES:
      • Prefer 2025-2026 data when available
      • If citing older research (2020-2024), explicitly label it with year: "A 2023 Stanford study found..."
      • NEVER present older data as if it's current — always include the year
      • For rapidly-changing fields (AI, crypto, social media), data older than 12 months needs a freshness caveat: "While 2023 data showed X, current estimates suggest Y"
      • For evergreen topics (health fundamentals, established practices), older landmark studies are acceptable when properly dated
    - Reference 3+ authoritative sources with full HTTPS URLs
    - ${authorInstruction}
    - Practical observations suggesting real-world familiarity

10. VOICE/TONE: ${opts.tone || 'intelligent, calm, conversational, and credible'}.

${HUMAN_STYLE_CONTENT_RULES}

${GEO_CONTENT_RULES}

${AEO_NLP_RULES}

${PASSAGE_RANKING_RULES}

${ORIGINAL_RESEARCH_SIGNALS}

${ANTI_COMMODITY_INSTRUCTION}

${CONTENT_FORMAT_RULES}

11. ATTRIBUTION VARIETY - Do NOT repeat "According to" more than 2 times. Use alternatives:
    - "Gartner's 2025 analysis shows..."
    - "Data from McKinsey reveals..."
    - "A 2026 IBM study found..."
    - "Research published by [source] indicates..."
    - "[Source] reports that..."
    - "The latest data from [source] suggests..."
    - "[Specific number]% of [group] - [Source], 2025"
    - Inline parenthetical: "...saw a 40% increase (Forrester, 2025)"

12. CTA PLACEMENT (every article needs a conversion path):
    - Place at least 1 contextual CTA within the body content (not just at the end)
    - For reviews/listicles: affiliate CTA in verdict section + 1 mid-article CTA
    - For how-tos: CTA after the most complex step ("Need help? [Tool] makes this easier")
    - For comparisons: CTA in the winner section with a clear action
    - For all other types: 1 soft CTA near the middle, 1 direct CTA before the conclusion
    - CTA format: <div class="cta-box"><strong>[Action phrase]</strong><p>[Brief value proposition]</p><a href="[URL]" class="cta-button">[Button text]</a></div>
    - CTAs must feel helpful, not salesy — frame as solving the reader's problem

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
/**
 * @deprecated SP-1: This function is NOT called anywhere in the codebase. The streaming route
 * uses `generateFromOutline()` (section-by-section) instead. This prompt is missing 6 major
 * instruction blocks vs buildContentPrompt: content type rules, content layer rules, author
 * EEAT, CTA placement, attribution variety, and LSI keywords. Do NOT re-enable without
 * achieving full parity with buildContentPrompt.
 */
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

FORMAT: Valid HTML ONLY. No markdown. Use h1, h2, h3, p, ul, ol, li, table, strong, a, dl, dt, dd, pre, code, figure, figcaption, div.callout-*, div.pull-quote, div.stat-highlight.
SEO: keyword density 0.8-1.5%, AEO (Q&A/TL;DRs), GEO (entities), E-E-A-T (real 2025/26 data, Author byline).
IMAGE SEO: Add ${variation.imageCount} <!-- IMAGE: [desc] | alt: "[alt]" -->.
${HUMAN_STYLE_CONTENT_RULES}
${GEO_CONTENT_RULES}
${AEO_NLP_RULES}
${PASSAGE_RANKING_RULES}
${ORIGINAL_RESEARCH_SIGNALS}
${ANTI_COMMODITY_INSTRUCTION}
${CONTENT_FORMAT_RULES}

Return ONLY the HTML content. Do not wrap in JSON or code blocks.`;

    // MG-5: Streaming system prompt upgraded to full role definition parity
    const systemPrompt = `${HUMAN_STYLE_SYSTEM_PROMPT}

You are an investigative journalist, research analyst, and SEO strategist creating authoritative editorial content.
Your goal: produce an article that could rank #1 and be cited by AI search engines.
Rules:
- Data-driven: every claim backed by a real, verifiable source with year
- Structurally optimized for Featured Snippets, AI Overviews, and Answer Engines
- NEVER fabricate statistics, quotes, or credentials — use "research suggests" if no specific source
- Write as a knowledgeable human, not an AI — conversational, specific, opinionated
Always output valid HTML only.`;

    return { prompt, systemPrompt };
}
