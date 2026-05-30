// ============================================================
// RankMaster Pro - Content Writer Engine
// AI-powered content generation optimized for SEO/AEO/Snippets
// Fixes applied: #3 EEAT de-fabrication, #5 structure validation,
// #6 PAA integration, #7 competitor expansion, #8 Product schema,
// #9 shared prompt builder, #11 template variation
//
// DECOMPOSED: Types, constants, prompts, schema, and quality gate
// are now in separate modules. This file keeps the ContentWriter
// class and barrel-exports everything for backward compatibility.
// ============================================================

import { getAIRouter } from '../ai/router';
import { createSingleton } from '../singleton';
import { ArticleOutline, OutlineSection } from './outline-generator';
import { HUMAN_STYLE_SYSTEM_PROMPT, HUMAN_STYLE_CONTENT_RULES, cleanAIPatterns } from './human-writing-rules';
import { getLinkingEngine } from './linking-engine';
import { getSERPIntelligence } from './serp-intelligence';
import { getImageResolver, getYouTubeEmbedder, VideoMeta } from './media-engine';
import { createServiceRoleClient } from '../supabase';
import { logger } from '../logger';

// ── Import from decomposed modules ────────────────────────────
import {
    QUALITY_GATE,
    WORD_COUNT_MINIMUMS,
    pickTemperature,
    countWordsInHTML,
    type ContentQualityMetrics,
    type GeneratedContent,
    type CompetitorInsight,
    type ContentPromptOptions,
} from './content-utils';

import {
    buildContentPrompt,
    SECTION_SEO_RULES,
    CTA_RULES,
    EXPERTISE_SIGNALS,
    ARTICLE_TYPE_BODY_RULES,
} from './content-prompts';
import { generateSchemaMarkup } from './content-schema';
import { runQualityGate } from './content-quality-gate';
import { moderateContent, injectDisclaimers } from './content-moderation';

// ── Barrel re-exports for backward compatibility ──────────────
// Existing imports like `import { countWordsInHTML } from './content-writer'`
// continue to work without changes.
export { countWordsInHTML, WORD_COUNT_MINIMUMS, pickTemperature } from './content-utils';
export type { ContentQualityMetrics, GeneratedContent, CompetitorInsight, ContentPromptOptions } from './content-utils';
export { buildContentPrompt, buildStreamingPrompt } from './content-prompts';
export { generateSchemaMarkup, validateSchemaMarkup } from './content-schema';
export { runQualityGate, findWeakestSection } from './content-quality-gate';

// ============================================================
// ContentWriter Class
// Core orchestration: article generation, optimization, sections
// ============================================================

export class ContentWriter {
    // Analyze competitors and generate insights (#7: expanded content)
    async analyzeCompetitors(
        competitorContents: { title: string; content: string; wordCount: number; headings: string[] }[]
    ): Promise<CompetitorInsight> {
        const ai = getAIRouter();

        // #7: Expanded from 800 → 3000 chars per competitor for deeper analysis
        const summaries = competitorContents.map((c, i) =>
            `### Competitor ${i + 1}: ${c.title} \nWord Count: ${c.wordCount} \nHeadings: ${c.headings.join(', ')} \nContent excerpt: ${c.content.substring(0, 3000)} `
        ).join('\n\n');

        const prompt = `Analyze these top - ranking competitor articles and extract insights:

${summaries}

Provide a JSON response with:
    {
        "avgWordCount": <number>,
            "commonHeadings": ["heading topics all competitors cover"],
                "commonTopics": ["key topics/subtopics covered by most"],
                    "contentGaps": ["topics NOT well covered that we can exploit"],
                        "snippetOpportunities": ["specific answer/list/table opportunities for featured snippets"],
                            "keyEntities": ["important people, products, brands, concepts, and statistics mentioned across competitors"]
    } `;

        const result = await ai.generate('competitor_analysis', prompt, {
            systemPrompt: 'You are an SEO content strategist. Analyze competitor content and find opportunities. Always respond in valid JSON.',
            jsonMode: true,
            temperature: 0.3,
        });

        try {
            return JSON.parse(result);
        } catch {
            return {
                avgWordCount: competitorContents.reduce((sum, c) => sum + c.wordCount, 0) / competitorContents.length,
                commonHeadings: [],
                commonTopics: [],
                contentGaps: [],
                snippetOpportunities: [],
                keyEntities: [],
            };
        }
    }

    // Generate a full SEO-optimized article (using shared prompt builder)
    // @deprecated Use generateFromOutline() for better quality — section-by-section generation
    // with competitor context produces significantly higher-quality, more rankable content.
    async generateArticle(
        keyword: string,
        competitorInsight: CompetitorInsight,
        options?: {
            niche?: string;
            tone?: 'professional' | 'casual' | 'authoritative';
            targetWordCount?: number;
            existingPosts?: string[];
            language?: string;
            paaQuestions?: string[];
            authorName?: string;
            authorBio?: string;
            isCluster?: boolean;
        }
    ): Promise<GeneratedContent> {
        const ai = getAIRouter();
        const isCluster = options?.isCluster || false;
        const minWords = isCluster ? WORD_COUNT_MINIMUMS.cluster : WORD_COUNT_MINIMUMS.normal;
        const targetWords = Math.max(
            options?.targetWordCount || Math.round(competitorInsight.avgWordCount * 1.3),
            minWords
        );

        // Use shared prompt builder (#9)
        const { prompt, systemPrompt } = buildContentPrompt({
            keyword,
            competitorInsight,
            targetWordCount: targetWords,
            niche: options?.niche,
            tone: options?.tone,
            existingPosts: options?.existingPosts,
            language: options?.language,
            paaQuestions: options?.paaQuestions,
            authorName: options?.authorName,
            authorBio: options?.authorBio,
            isCluster,
            minWordCount: minWords,
        });

        const result = await ai.generate('content_writing', prompt, {
            systemPrompt,
            jsonMode: true,
            temperature: pickTemperature(keyword),
            maxTokens: 16384,
        });

        try {
            const parsed = JSON.parse(result);
            // Add schema markup
            parsed.schemaMarkup = generateSchemaMarkup(parsed, keyword);

            // #5: Post-generation structure validation
            const missing = this.validateStructure(parsed.content);
            if (missing.length > 0) {
                parsed.content = await this.patchMissingSections(parsed.content, keyword, missing);
            }

            // ── STRICT WORD COUNT ENFORCEMENT ──────────────────────
            parsed.content = await this.enforceMinimumWordCount(
                parsed.content, keyword, minWords, options?.language || 'en', isCluster
            );

            // ── POST-GENERATION CLEANUP ─────────────────────────────
            parsed.content = cleanAIPatterns(parsed.content);

            // ── QUALITY GATE ────────────────────────────────────────
            const qualityResult = await runQualityGate(
                parsed.content, keyword, options?.language || 'en'
            );
            parsed.content = qualityResult.content;
            parsed.qualityMetrics = qualityResult.metrics;

            // ── CONTENT MODERATION ──────────────────────────────────
            const modResult = moderateContent(parsed.content, options?.niche);
            if (modResult.disclaimers.length > 0) {
                parsed.content = injectDisclaimers(parsed.content, modResult.disclaimers);
            }
            if (!modResult.safe) {
                logger.warn('Content moderation flagged critical issues', { action: 'generateArticle', keyword, summary: modResult.summary });
            }

            return parsed;
        } catch {
            return {
                title: keyword,
                metaTitle: keyword,
                metaDescription: '',
                content: result,
                faqSection: [],
                schemaMarkup: {},
                suggestedInternalLinks: [],
                suggestedExternalLinks: [],
            };
        }
    }

    // #5: Validate required structural sections exist in generated content
    validateStructure(htmlContent: string): string[] {
        const missing: string[] = [];
        const lower = htmlContent.toLowerCase();

        if (!/<h1[^>]*>/i.test(htmlContent)) missing.push('H1_TITLE');
        if (!lower.includes('key takeaway') && !lower.includes('takeaways') && !lower.includes('tldr') && !lower.includes('tl;dr'))
            missing.push('KEY_TAKEAWAYS');
        if (!htmlContent.includes('<table')) missing.push('COMPARISON_TABLE');
        if (!lower.includes('faq') && !lower.includes('frequently asked'))
            missing.push('FAQ_SECTION');
        if (!lower.includes('sources') && !lower.includes('references'))
            missing.push('SOURCES_SECTION');

        const h2Count = (htmlContent.match(/<h2[^>]*>/gi) || []).length;
        if (h2Count < 4) missing.push('MORE_H2_SECTIONS');

        return missing;
    }

    // #5: Patch missing sections by generating them individually
    private async patchMissingSections(content: string, keyword: string, missing: string[]): Promise<string> {
        const ai = getAIRouter();

        for (const section of missing) {
            let sectionPrompt = '';
            switch (section) {
                case 'KEY_TAKEAWAYS':
                    sectionPrompt = `Generate a "Key Takeaways" HTML section for an article about "${keyword}".Use 4 - 6 bullet points summarizing the most important points.Return ONLY the HTML.`;
                    break;
                case 'COMPARISON_TABLE':
                    sectionPrompt = `Generate a comparison HTML < table > relevant to "${keyword}".Include 4 - 6 rows and clear column headers.Return ONLY the HTML table.`;
                    break;
                case 'FAQ_SECTION':
                    sectionPrompt = `Generate an FAQ HTML section with 5 questions and 40 - 60 word answers about "${keyword}".Use<h3> for questions.Return ONLY the HTML.`;
                    break;
                case 'SOURCES_SECTION':
                    sectionPrompt = `Generate a "Sources & References" HTML section with 3 - 5 authoritative references(.gov, .edu, industry reports) relevant to "${keyword}".Return ONLY the HTML.`;
                    break;
                default:
                    continue;
            }

            try {
                let sectionHTML = await ai.generate('content_writing', sectionPrompt, {
                    systemPrompt: `${HUMAN_STYLE_SYSTEM_PROMPT} Generate only the requested HTML section. No JSON, no code blocks, no code fences.`,
                    temperature: 0.5,
                    maxTokens: 1024,
                });

                // Clean AI patterns from patched sections
                sectionHTML = cleanAIPatterns(sectionHTML);

                // Insert before closing content or before </body> or at the end
                if (section === 'KEY_TAKEAWAYS') {
                    // Insert after the first paragraph
                    const firstPEnd = content.indexOf('</p>');
                    if (firstPEnd > -1) {
                        content = content.slice(0, firstPEnd + 4) + '\n' + sectionHTML + '\n' + content.slice(firstPEnd + 4);
                    } else {
                        content = sectionHTML + '\n' + content;
                    }
                } else {
                    // Append before conclusion or at end
                    const conclusionIdx = content.toLowerCase().lastIndexOf('<h2');
                    if (conclusionIdx > 0) {
                        content = content.slice(0, conclusionIdx) + '\n' + sectionHTML + '\n' + content.slice(conclusionIdx);
                    } else {
                        content += '\n' + sectionHTML;
                    }
                }
            } catch {
                // Silent fail — don't break generation for a missing section
            }
        }

        return content;
    }

    // ── WORD COUNT EXPANSION (GENTLE) ──────────────────────────────────────
    // Single expansion round if section-by-section generation fell short.
    // Prefer increasing per-section targets in outline generator.
    async enforceMinimumWordCount(
        content: string,
        keyword: string,
        minWords: number,
        language: string,
        isCluster: boolean
    ): Promise<string> {
        const MAX_EXPANSION_ROUNDS = 1; // Single pass only — plan word counts in outline instead
        const ai = getAIRouter();

        for (let round = 0; round < MAX_EXPANSION_ROUNDS; round++) {
            const currentWords = countWordsInHTML(content);

            if (currentWords >= minWords) {
                // Minimum met — done
                return content;
            }

            const wordsNeeded = minWords - currentWords;
            const sectionsToAdd = isCluster
                ? Math.max(3, Math.ceil(wordsNeeded / 400))
                : Math.max(2, Math.ceil(wordsNeeded / 350));

            const langInstruction = language !== 'en'
                ? `Write ALL content in ${language} language.`
                : '';

            const expansionPrompt = `The following article about "${keyword}" currently has ${currentWords} words but MUST have at least ${minWords} words(${wordsNeeded} more words needed).

Generate ${sectionsToAdd} NEW, substantive H2 sections with H3 subsections to add to this article.Each section should be 300 - 500 words.

EXISTING HEADINGS(do NOT repeat these topics):
${(content.match(/<h2[^>]*>(.*?)<\/h2>/gi) || []).map(h => h.replace(/<[^>]+>/g, '')).join('\n')}

RULES:
- Each new section MUST cover a genuinely different subtopic related to "${keyword}"
- Include specific data points, examples, and actionable insights
- DO NOT repeat information already in the article
- DO NOT use filler phrases or padding
- Every paragraph must add unique, valuable information
${HUMAN_STYLE_CONTENT_RULES}
${langInstruction}

Return ONLY the HTML sections(H2s with content).No JSON, no code blocks, no preamble.`;

            try {
                const expansion = await ai.generate('content_writing', expansionPrompt, {
                    systemPrompt: `${HUMAN_STYLE_SYSTEM_PROMPT} You are expanding an article with substantive new sections. Every word must add value — no filler. Return raw HTML only, no code fences.`,
                    temperature: pickTemperature(keyword, 'section'),
                    maxTokens: 4096,
                });

                if (expansion && expansion.trim().length > 100) {
                    // Insert new sections before the conclusion/last H2 or FAQ
                    const conclusionPatterns = [
                        /(<h2[^>]*>(?:.*?conclusion|.*?final\s+thoughts|.*?wrapping\s+up|.*?summary))/i,
                        /(<h2[^>]*>(?:.*?faq|.*?frequently\s+asked))/i,
                        /(<h2[^>]*>(?:.*?sources|.*?references))/i,
                    ];

                    let inserted = false;
                    for (const pattern of conclusionPatterns) {
                        const match = content.match(pattern);
                        if (match && match.index !== undefined) {
                            content = content.slice(0, match.index) + '\n\n' + expansion.trim() + '\n\n' + content.slice(match.index);
                            inserted = true;
                            break;
                        }
                    }

                    if (!inserted) {
                        // Fallback: insert before the last H2
                        const lastH2 = content.lastIndexOf('<h2');
                        if (lastH2 > 0) {
                            content = content.slice(0, lastH2) + '\n\n' + expansion.trim() + '\n\n' + content.slice(lastH2);
                        } else {
                            content += '\n\n' + expansion.trim();
                        }
                    }
                }
            } catch {
                // If expansion fails, continue to next round
            }
        }

        // Final check — log if still below minimum
        const finalWords = countWordsInHTML(content);
        if (finalWords < minWords) {
            logger.warn('Word count enforcement fell short', { action: 'word_count_enforcement', currentWords: finalWords, targetWords: minWords, keyword });
        }

        return content;
    }

    // ── SECTION-BY-SECTION ARTICLE GENERATION ──────────────────
    // Generates each section individually using the outline + competitor data
    // for dramatically better content quality vs monolithic prompts.
    async generateFromOutline(
        keyword: string,
        outline: ArticleOutline,
        options?: {
            language?: string;
            niche?: string;
            isCluster?: boolean;
            authorName?: string;
            authorBio?: string;
            siteId?: string;
            /** Article-level content type — drives body-level type rules (verdict/winner/CTA) */
            contentType?: 'article' | 'review' | 'how_to' | 'listicle' | 'comparison' | 'alternatives' | 'beginner_guide' | 'problem_solution' | 'case_study' | 'news';
        }
    ): Promise<GeneratedContent> {
        const pipelineStart = Date.now();
        const requestId = `cw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const log = logger.child({
            action: 'generateFromOutline',
            keyword,
            siteId: options?.siteId,
            requestId,
        });
        log.info('Pipeline started', { sectionCount: outline.sections.length, language: options?.language });

        const ai = getAIRouter();
        const lang = options?.language || 'en';
        const langNote = lang !== 'en' ? ` Write entirely in ${lang}.` : '';
        const articleType = options?.contentType || 'article';
        const sections: string[] = [];

        // ── 1. Introduction ────────────────────────────────────
        const introHook = outline.introHook || `A comprehensive look at ${keyword} with expert insights and practical recommendations`;
        const introPrompt = `Write the introduction for an article titled "${outline.title}" targeting the keyword "${keyword}".

STRUCTURE (follow this exact 4-part pattern):

1. HOOK (1 sentence): Start with this direct-answer opening: "${introHook}"
   - This sentence MUST contain "${keyword}" and a specific claim, number, or finding.

2. SNIPPET PARAGRAPH (2-3 sentences, 40-60 words total):
   - Write a concise, self-contained answer to the query "${keyword}" that Google can pull as a featured snippet.
   - Include a specific statistic or data point with year and source.
   - Wrap this in a single <p> tag with <strong> on the key fact.

3. CONTEXT (2-3 sentences):
   - Frame WHY this topic matters right now (cite a trend, shift, or recent event).
   - Include the keyword "${keyword}" or a close variation naturally.
   - Build credibility with a data reference or expert framing.

4. PREVIEW + HOOK (1-2 sentences):
   - End with a transitional phrase that creates curiosity to keep reading.
   - USE one of these engagement hooks: "Here's the thing:", "But there's a catch:", "The data tells a different story.", "What most guides miss:", "Here's what actually matters:"
   - Do NOT end with "In this article, we will explore..." or "Let's dive in."

KEYWORD DENSITY: Include "${keyword}" 2-3 times in the introduction, plus 1-2 semantic variations.

BANNED OPENERS (NEVER start with any of these — instant disqualification):
- "In today's fast-paced world / digital landscape / competitive market..."
- "Have you ever wondered..."
- "In this article / guide / post, we'll explore / discuss / cover..."
- "When it comes to..."
- "Let's dive in / Let's get started..."
- "Are you looking for / struggling with..."
- "Welcome to our guide / comprehensive guide..."
- "${keyword} is a topic that..."
- "It's no secret that..."

TARGET: 150-250 words. Return HTML only (use <p> tags, <strong> for key facts).${langNote}
${HUMAN_STYLE_CONTENT_RULES}
Write with personality — as if a knowledgeable colleague is sharing insider insight, not a textbook.`;

        const introStart = Date.now();
        let introResult = await ai.generate('section_writing', introPrompt, {
            systemPrompt: `${HUMAN_STYLE_SYSTEM_PROMPT} Return valid HTML only — no markdown syntax, no code fences (no \`\`\`html blocks). Output raw HTML tags directly.`,
            temperature: pickTemperature(keyword, 'section'),
            maxTokens: 1024,
        });
        introResult = cleanAIPatterns(introResult);
        sections.push(introResult);
        log.info('Stage: Introduction written', { stage: 'introduction', contentLength: introResult.length, duration: Date.now() - introStart });

        // ── 2. Key Takeaways ───────────────────────────────────
        if (outline.keyTakeaways && outline.keyTakeaways.length > 0) {
            const takeawaysHtml = `<div class="callout-box key-takeaways">
<h2>Key Takeaways</h2>
<ul>
${outline.keyTakeaways.map(t => `<li><strong>${t}</strong></li>`).join('\n')}
</ul>
</div>`;
            sections.push(takeawaysHtml);
        }


        // ── 3. Main Body Sections (sequential-first, then parallel) ─
        // First 5 sections: generate sequentially with context of previous
        // sections to prevent repetition of examples, stats, and talking points.
        // Remaining sections: generate in parallel batches for speed.
        const bodyStart = Date.now();
        const SEQUENTIAL_COUNT = Math.min(5, outline.sections.length);
        const previousSectionSummaries: string[] = [];

        // Sequential phase: context-aware generation
        for (let i = 0; i < SEQUENTIAL_COUNT; i++) {
            const section = outline.sections[i];
            const contextNote = previousSectionSummaries.length > 0
                ? `\n\nALREADY COVERED (do NOT repeat these points, examples, or statistics):\n${previousSectionSummaries.map(s => `- ${s}`).join('\n')}`
                : '';
            const result = await this.generateSection(ai, keyword, section, i, lang, langNote, contextNote, articleType);
            sections.push(result);

            // Extract a brief summary of what this section covered
            const sectionText = result.replace(/<[^>]+>/g, ' ').substring(0, 200).trim();
            previousSectionSummaries.push(
                `Section "${section.h2}": ${sectionText.substring(0, 120)}`
            );
        }

        // Parallel phase: remaining sections with accumulated context
        const remainingSections = outline.sections.slice(SEQUENTIAL_COUNT);
        if (remainingSections.length > 0) {
            const contextNote = `\n\nALREADY COVERED (do NOT repeat these points, examples, or statistics):\n${previousSectionSummaries.map(s => `- ${s}`).join('\n')}`;
            const BATCH_SIZE = 3;
            for (let batchStart = 0; batchStart < remainingSections.length; batchStart += BATCH_SIZE) {
                const batch = remainingSections.slice(batchStart, batchStart + BATCH_SIZE);
                const batchPromises = batch.map((section, batchIdx) => {
                    const sectionIdx = SEQUENTIAL_COUNT + batchStart + batchIdx;
                    return this.generateSection(ai, keyword, section, sectionIdx, lang, langNote, contextNote, articleType);
                });
                const batchResults = await Promise.all(batchPromises);
                sections.push(...batchResults);
            }
        }
        const bodyWordCount = sections.reduce((sum, s) => sum + countWordsInHTML(s), 0);
        log.info('Stage: Body sections complete', { stage: 'body_sections', sectionCount: outline.sections.length, wordCount: bodyWordCount, duration: Date.now() - bodyStart });

        // ── 5. Comparison Table ────────────────────────────────
        if (outline.comparisonTable) {
            const tablePrompt = `Create a detailed comparison table for "${outline.comparisonTable.topic}" related to "${keyword}".

COLUMNS: ${outline.comparisonTable.columns.join(', ')}
ROWS to cover: ${outline.comparisonTable.rowDescriptions.join(', ')}

REQUIREMENTS:
- Use real, specific data (features, prices, ratings) — do NOT use generic placeholders
- Each cell must contain specific, differentiated information
- Add a brief 2-sentence paragraph before the table explaining what is being compared
- Add a 2-sentence recommendation paragraph after the table
- Return HTML only: <h2>, <p>, <table>, <thead>, <tbody>, <tr>, <th>, <td>
${langNote}`;

            const tableResult = await ai.generate('section_writing', tablePrompt, {
                systemPrompt: 'You are a product analyst creating detailed comparison tables with real data. Return valid HTML only — no code fences, no markdown.',
                temperature: 0.5,
                maxTokens: 2048,
            });
            sections.push(`<div id="comparison-table">${tableResult}</div>`);
        }

        // ── 6 + 7: FAQ + Conclusion (PARALLELIZED — independent AI calls) ──
        const faqPromise = (outline.faqQuestions && outline.faqQuestions.length > 0)
            ? (async () => {
                const faqPrompt = `Write the FAQ section for an article about "${keyword}".

QUESTIONS TO ANSWER:
${outline.faqQuestions.map((faq, i) => `${i + 1}. ${faq.question} (target: ${faq.targetWords} words)`).join('\n')}

REQUIREMENTS:
- Each answer must be 40-60 words — hard ceiling 60 words (single FAQ standard for snippet extraction)
- Structure each answer: Claim (the snippet) → Evidence (specific stat/example) → Takeaway
- Start each answer with a DIRECT statement, not "Yes," or "No," followed by nothing useful
- Include at least one specific fact, number, or example per answer
- Include "${keyword}" or a variation in at least 40% of answers
- Wrap questions in <h3> using the exact question text (Google uses these for FAQ rich results)
- Wrap each Q&A pair in a <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question"> for FAQ schema
- Format answers inside <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer"><div itemprop="text"><p>answer</p></div></div>
- Return HTML only${langNote}
${HUMAN_STYLE_CONTENT_RULES}`;

                let faqResult = await ai.generate('section_writing', faqPrompt, {
                    systemPrompt: `${HUMAN_STYLE_SYSTEM_PROMPT} You answer questions concisely with specific data. Format for FAQ schema. Return valid HTML only — no code fences.`,
                    temperature: 0.5,
                    maxTokens: 2048,
                });
                faqResult = cleanAIPatterns(faqResult);
                return `<div id="faq-section" itemscope itemtype="https://schema.org/FAQPage">${faqResult}</div>`;
            })()
            : Promise.resolve(null);

        const conclusionPromise = (async () => {
            const conclusionPrompt = `Write a conclusion for an article titled "${outline.title}" about "${keyword}".

STRUCTURE (follow this 4-part pattern):

1. RECAP (2-3 sentences): Summarize the 3 most important findings. Mention "${keyword}" in the first sentence.

2. KEY INSIGHT (1-2 sentences): What's the ONE non-obvious takeaway that sets this article apart from competitors?

3. FORWARD-LOOKING (1-2 sentences): What's changing in this space? Cite a specific trend, shift, or upcoming development relevant to "${keyword}".

4. CALL TO ACTION (1-2 sentences): End with a specific, actionable next step.
   GOOD CTA: "Start by auditing your current ${keyword} setup using the checklist in Section 3, then prioritize the two changes with the highest ROI."
   BAD CTA: "Stay informed and keep up with the latest trends."

RULES:
- 150-250 words total
- Include "${keyword}" 2-3 times naturally
- Use an H2 heading that's NOT "Conclusion" — use something specific like "What This Means for Your ${keyword.replace(/\b\w/g, l => l.toUpperCase())} Strategy" or "The Bottom Line on ${keyword.replace(/\b\w/g, l => l.toUpperCase())}"
- BANNED openers: "In conclusion", "To sum up", "In summary", "Overall", "To wrap up", "Final thoughts" — start with a substantive sentence
- Return HTML only (<h2>, <p> tags)${langNote}
${HUMAN_STYLE_CONTENT_RULES}`;

            let conclusionResult = await ai.generate('section_writing', conclusionPrompt, {
                systemPrompt: `${HUMAN_STYLE_SYSTEM_PROMPT} You craft compelling, actionable conclusions. Return valid HTML only — no code fences.`,
                temperature: 0.6,
                maxTokens: 1024,
            });
            conclusionResult = cleanAIPatterns(conclusionResult);
            return conclusionResult;
        })();

        // Wait for both FAQ + Conclusion to finish
        const [faqHtml, rawConclusion] = await Promise.all([faqPromise, conclusionPromise]);

        if (faqHtml) {
            sections.push(faqHtml);
        }

        // #29: Verify keyword presence in conclusion (quality check preserved)
        let conclusionResult = rawConclusion;
        const conclusionText = conclusionResult.replace(/<[^>]+>/g, '').toLowerCase();
        const keywordLower = keyword.toLowerCase();
        const keywordCount = (conclusionText.match(new RegExp(keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (keywordCount < 1) {
            log.warn('Conclusion missing target keyword — attempting inline injection', { stage: 'conclusion', keywordCount });
            const kwTitle = keyword.charAt(0).toUpperCase() + keyword.slice(1);
            conclusionResult = conclusionResult.replace(
                /(<p[^>]*>)([^<]+)/i,
                `$1${kwTitle} matters here: $2`
            );
        } else if (keywordCount < 2) {
            log.info('Conclusion keyword density below target', { stage: 'conclusion', keywordCount, target: '2-3' });
        }

        sections.push(conclusionResult);

        // ── 8. AI-generated Sources & References ──────────────────
        const sourcesSection = await this.generateSourcesSection(
            keyword, sections.join('\n'), options?.language || 'en'
        );
        sections.push(sourcesSection);

        // ── 9. Author byline ──────────────────────────────────
        const authorName = options?.authorName || 'Editorial Team';
        const authorBio = options?.authorBio || '';
        if (authorBio) {
            sections.push(`<div class="author-box"><strong>${authorName}</strong><p>${authorBio}</p></div>`);
        } else {
            sections.push(`<div class="author-box"><p>Written by <strong>${authorName}</strong></p></div>`);
        }

        // ── Assemble full article ──────────────────────────────
        const dateStr = new Date().toISOString().split('T')[0];
        let fullContent = `<h1>${outline.title}</h1>
<div class="last-updated"><strong>Last Updated:</strong> ${dateStr}</div>
${sections.join('\n\n')}`;

        // ── Strip markdown code fences the AI may have wrapped around sections ──
        fullContent = fullContent.replace(/```(?:html|HTML)?\s*\n?/g, '');
        fullContent = fullContent.replace(/\n?```\s*$/gm, '');

        // ── #30: Question-Based H2 Validation ────────────────────
        const h2Headings = fullContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
        const h2Texts = h2Headings.map(h => h.replace(/<[^>]+>/g, '').trim());

        // ── Deduplicate H2 headings ──────────────────────────────
        // When sections are generated independently, the AI sometimes reuses
        // the same heading (e.g., "What is the best CRM for small business?").
        // Keep the FIRST occurrence and remove subsequent duplicates along with
        // their content up to the next H2.
        const seenH2s = new Set<string>();
        for (const h2Text of h2Texts) {
            const normalized = h2Text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            if (seenH2s.has(normalized)) {
                // Find and remove this duplicate H2 + its content until next H2
                const escapedH2 = h2Text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const dupePattern = new RegExp(
                    `<h2[^>]*>${escapedH2}</h2>[\\s\\S]*?(?=<h2[^>]*>|$)`,
                    'i'
                );
                // Only remove the SECOND occurrence (skip the first match)
                let matchCount = 0;
                fullContent = fullContent.replace(dupePattern, (match) => {
                    matchCount++;
                    return matchCount > 1 ? '' : match;
                });
                log.warn('Removed duplicate H2', { stage: 'h2_dedup', heading: h2Text });
            }
            seenH2s.add(normalized);
        }

        const questionH2s = h2Texts.filter(t => t.endsWith('?'));
        const questionRatio = h2Texts.length > 0 ? questionH2s.length / h2Texts.length : 0;
        if (questionRatio < 0.3 && h2Texts.length >= 5) {
            log.warn('Low H2 question ratio', { stage: 'h2_validation', questionRatio: +(questionRatio * 100).toFixed(0), questionH2s: questionH2s.length, totalH2s: h2Texts.length });
        } else {
            log.info('H2 question ratio', { stage: 'h2_validation', questionRatio: +(questionRatio * 100).toFixed(0), questionH2s: questionH2s.length, totalH2s: h2Texts.length });
        }

        // ── #54: Content Format Diversity Check ──────────────────
        const formatTypes = {
            paragraphs: (fullContent.match(/<p/gi) || []).length,
            lists: (fullContent.match(/<[ou]l/gi) || []).length,
            tables: (fullContent.match(/<table/gi) || []).length,
            blockquotes: (fullContent.match(/<blockquote/gi) || []).length,
            images: (fullContent.match(/<img/gi) || []).length,
            headings: (fullContent.match(/<h[23]/gi) || []).length,
            callouts: (fullContent.match(/class="callout/gi) || []).length,
            pullQuotes: (fullContent.match(/class="pull-quote/gi) || []).length,
            statHighlights: (fullContent.match(/class="stat-highlight/gi) || []).length,
            definitionLists: (fullContent.match(/<dl/gi) || []).length,
            codeBlocks: (fullContent.match(/<pre/gi) || []).length,
            accordions: (fullContent.match(/class="accordion/gi) || []).length,
            footnotes: (fullContent.match(/class="footnote/gi) || []).length,
        };
        const activeFormats = Object.values(formatTypes).filter(count => count > 0).length;
        if (activeFormats < 5) {
            log.warn('Low content format diversity', { stage: 'format_diversity', activeFormats, target: 5, formatTypes });
        } else {
            log.info('Content format diversity', { stage: 'format_diversity', activeFormats, formatTypes });
        }

        // ── CTA Enforcement (revenue-critical) ────────────────────
        // Affiliate platform: monetizable types MUST carry conversion paths.
        // The model is instructed to add CTAs, but we verify and inject if short.
        const ctaMinByType: Record<string, number> = {
            review: 2, listicle: 2, comparison: 1, alternatives: 1,
        };
        const ctaMin = ctaMinByType[articleType] || 0;
        if (ctaMin > 0) {
            const ctaCount = (fullContent.match(/class="cta-box"/gi) || []).length;
            if (ctaCount < ctaMin) {
                const ctaTemplate = `<div class="cta-box"><strong>Ready to take the next step with ${keyword}?</strong><p>Compare your best options and pick what fits your needs.</p><a href="#" class="cta-button">See Top Picks</a></div>`;
                const needed = ctaMin - ctaCount;
                const ctaBlock = Array(needed).fill(ctaTemplate).join('\n');
                // Insert before FAQ, else before Sources, else before conclusion-ish last H2
                const anchor = fullContent.search(/<div[^>]*id="faq-section"|<div[^>]*class="sources-references"/i);
                if (anchor > -1) {
                    fullContent = fullContent.slice(0, anchor) + ctaBlock + '\n' + fullContent.slice(anchor);
                } else {
                    const lastH2 = fullContent.lastIndexOf('<h2');
                    fullContent = lastH2 > 0
                        ? fullContent.slice(0, lastH2) + ctaBlock + '\n' + fullContent.slice(lastH2)
                        : fullContent + '\n' + ctaBlock;
                }
                log.info('CTA enforcement injected missing CTAs', { stage: 'cta_enforcement', articleType, had: ctaCount, min: ctaMin, injected: needed });
            }
        }

        // ── #62: Image SEO Optimization ───────────────────────────
        try {
            const { optimizeImageSEO } = await import('./media-engine');
            fullContent = optimizeImageSEO(fullContent, keyword);
        } catch {}


        // ── Content Enhancement Pipeline (#21, #22, #39) ─────────
        const enhanceStart = Date.now();
        const preEnhanceLength = fullContent.length;
        try {
            const { injectTableOfContents, autoInjectComparisonTable, enforceSemanticHTML, enhanceContentFormatting } = await import('./content-enhancer');
            // #21: Auto-generate Table of Contents
            fullContent = injectTableOfContents(fullContent, 4);
            // #22: Auto-inject comparison tables for vs/best keywords
            fullContent = autoInjectComparisonTable(fullContent, keyword);
            // #39: Enforce semantic HTML5 structure
            fullContent = enforceSemanticHTML(fullContent);
            // #NEW: Enhanced content formatting (callouts, pull quotes, accordion FAQ, footnotes, code blocks, reading time, progress bar, responsive images)
            fullContent = enhanceContentFormatting(fullContent, keyword);
            log.info('Stage: Enhancement complete', { stage: 'enhancement', contentLengthBefore: preEnhanceLength, contentLengthAfter: fullContent.length, contentLengthChange: fullContent.length - preEnhanceLength, duration: Date.now() - enhanceStart });
        } catch (enhanceErr) {
            log.warn('Content enhancement skipped', { stage: 'enhancement', duration: Date.now() - enhanceStart, error: String(enhanceErr) });
        }

        // ── OA-1: Entity & GEO Optimization ─────────────────────
        // Connects previously-orphaned EntityOptimizer and GEOOptimizer
        // to fill entity coverage and GEO attribution gaps.

        // Stage: Entity Analysis (independent try/catch — Patch #3)
        const entityStart = Date.now();
        try {
            const { getEntityOptimizer } = await import('./entity-optimizer');
            const entityOpt = getEntityOptimizer();

            const entityAnalysis = await entityOpt.analyzeEntities(fullContent, keyword);
            const missingNames = entityAnalysis.missingEntities.slice(0, 5).map((e: { name: string }) => e.name);
            log.info('Stage: Entity analysis', {
                stage: 'entity_analysis',
                saturationScore: entityAnalysis.saturationScore,
                entityCount: entityAnalysis.missingEntities.length,
                missingEntities: missingNames,
                duration: Date.now() - entityStart,
            });
            if (entityAnalysis.saturationScore < 70) {
                log.warn('Entity saturation below threshold', {
                    stage: 'entity_analysis',
                    saturationScore: entityAnalysis.saturationScore,
                    missingEntities: missingNames,
                });
            }
        } catch (entityErr) {
            log.warn('Entity analysis failed (non-fatal)', { stage: 'entity_analysis', duration: Date.now() - entityStart, error: String(entityErr) });
        }

        // Stage: GEO Optimization (independent try/catch — Patch #3)
        const geoStart = Date.now();
        try {
            const { getGEOOptimizer } = await import('./geo-optimizer');
            const geoOpt = getGEOOptimizer();

            const geoAnalysis = geoOpt.analyzeGEOReadiness(fullContent);
            if (geoAnalysis.score < 60) {
                const geoResult = await geoOpt.injectAttributions(fullContent, keyword);
                if (geoResult.changes.length > 0 && geoResult.afterScore > geoResult.beforeScore) {
                    fullContent = geoResult.content;
                    log.info('Stage: GEO optimization applied', {
                        stage: 'geo_optimization',
                        beforeScore: geoResult.beforeScore,
                        afterScore: geoResult.afterScore,
                        changesApplied: geoResult.changes.length,
                        duration: Date.now() - geoStart,
                    });
                } else {
                    log.info('Stage: GEO optimization skipped (no improvement)', {
                        stage: 'geo_optimization',
                        score: geoAnalysis.score,
                        duration: Date.now() - geoStart,
                    });
                }
            } else {
                log.info('Stage: GEO readiness sufficient', { stage: 'geo_optimization', score: geoAnalysis.score, duration: Date.now() - geoStart });
            }
        } catch (geoErr) {
            log.warn('GEO optimization failed (non-fatal)', { stage: 'geo_optimization', duration: Date.now() - geoStart, error: String(geoErr) });
        }

        // ── 10. Internal Link Injection ─────────────────────────
        if (options?.siteId) {
            const linkStart = Date.now();
            try {
                const linking = getLinkingEngine();
                // Use buildSiteLinkGraph for keyword-aware post matching
                const linkGraph = await linking.buildSiteLinkGraph(options.siteId);
                if (linkGraph.posts.length > 0) {
                    const supabase = createServiceRoleClient();
                    const { data: site } = await supabase
                        .from('sites')
                        .select('url')
                        .eq('id', options.siteId)
                        .single();
                    const siteUrl = site?.url || '';
                    const suggestions = await linking.suggestInternalLinks(
                        fullContent, outline.title, linkGraph.posts, siteUrl
                    );
                    if (suggestions.length > 0) {
                        fullContent = linking.insertLinksIntoContent(fullContent, suggestions);
                        log.info('Stage: Internal linking', { stage: 'internal_linking', linksInjected: suggestions.length, duration: Date.now() - linkStart });
                    }
                }
            } catch (linkErr) {
                log.warn('Internal link injection failed', { stage: 'internal_linking', duration: Date.now() - linkStart, error: String(linkErr) });
            }
        }

        // ── 11. Media Resolution — Images & YouTube ─────────────
        let videoMetas: VideoMeta[] = [];
        try {
            // Replace <!-- IMAGE: --> placeholders with real stock photos
            const imageResolver = getImageResolver();
            fullContent = await imageResolver.resolveImagePlaceholders(fullContent, keyword);

            // Embed AI-selected YouTube videos
            const youtubeEmbedder = getYouTubeEmbedder();
            const videoResult = await youtubeEmbedder.embedYouTubeVideos(
                fullContent, keyword, { maxVideos: 2, articleContent: fullContent }
            );
            fullContent = videoResult.html;
            videoMetas = videoResult.videos;
        } catch (mediaErr) {
            log.warn('Media resolution failed (non-fatal)', { stage: 'media_resolution', error: String(mediaErr) });
        }

        // ── QUALITY GATE ────────────────────────────────────────
        const qgStart = Date.now();
        const qualityResult = await runQualityGate(
            fullContent, keyword, options?.language || 'en'
        );
        fullContent = qualityResult.content;
        log.info('Stage: Quality gate', {
            stage: 'quality_gate',
            naturalnessScore: qualityResult.metrics?.naturalnessScore,
            factualityScore: qualityResult.metrics?.factualityScore,
            qualityGatePasses: qualityResult.metrics?.qualityGatePasses,
            contentLength: fullContent.length,
            duration: Date.now() - qgStart,
        });

        // ── CONTENT MODERATION ──────────────────────────────────
        const modResult = moderateContent(fullContent, options?.niche);
        if (modResult.disclaimers.length > 0) {
            fullContent = injectDisclaimers(fullContent, modResult.disclaimers);
            log.info('YMYL disclaimers injected', { stage: 'content_moderation', ymylCategory: modResult.ymylCategory });
        }
        if (!modResult.safe) {
            log.warn('Content moderation flagged critical issues', { stage: 'content_moderation', summary: modResult.summary });
        }

        // ── Populate FAQ answers from generated HTML ─────────
        const faqSection = this.extractFAQFromHTML(fullContent, outline.faqQuestions || []);

        // Generate schema markup
        const generated: GeneratedContent = {
            title: outline.title,
            metaTitle: outline.metaTitle || outline.title || keyword,
            metaDescription: outline.metaDescription || `Comprehensive guide to ${keyword}. Expert insights, data-driven analysis, and actionable recommendations.`,
            content: fullContent,
            faqSection,
            schemaMarkup: generateSchemaMarkup({
                title: outline.title,
                metaTitle: outline.metaTitle || outline.title || keyword,
                metaDescription: outline.metaDescription || `Comprehensive guide to ${keyword}.`,
                content: fullContent,
                faqSection,
                schemaMarkup: {},
                suggestedInternalLinks: [],
                suggestedExternalLinks: [],
            }, keyword, videoMetas),
            suggestedInternalLinks: [],
            suggestedExternalLinks: [],
            qualityMetrics: qualityResult.metrics,
            videoMetas,
        };

        const totalWordCount = countWordsInHTML(fullContent);
        log.info('Stage: Final — pipeline complete', {
            stage: 'final',
            totalWordCount,
            contentLength: fullContent.length,
            totalDuration: Date.now() - pipelineStart,
            sectionCount: outline.sections.length,
        });

        return generated;
    }

    // ── Generate a single H2 section ───────────────────────────
    private async generateSection(
        ai: ReturnType<typeof getAIRouter>,
        keyword: string,
        section: OutlineSection,
        sectionIndex: number,
        lang: string,
        langNote: string,
        contextNote: string = '',
        articleType: string = 'article'
    ): Promise<string> {
        // Safe defaults for properties that may be missing when outline comes from frontend
        const h2 = section.h2 || (section as unknown as Record<string, string>).heading || `Section ${sectionIndex + 1}`;
        const h3s = section.h3s || [];
        const targetWords = section.targetWords || (section as unknown as Record<string, number>).estimatedWords || 400;
        const contentType = section.contentType || 'explanation';
        const snippetTarget = section.snippetTarget || (section as unknown as Record<string, string>).snippetType || 'none';
        const competitorExcerpts = section.competitorExcerpts || [];
        const keyDataPoints = section.keyDataPoints || [];
        const writingAngle = section.writingAngle || 'Cover this topic thoroughly with specific examples and actionable insights';

        const contentTypeInstructions: Record<string, string> = {
            explanation: 'Explain the concept clearly with specific examples and real-world context. Use analogies where helpful.',
            comparison: 'Compare options with specific metrics, features, and trade-offs. Be opinionated about which is better and why.',
            list: 'Present as a structured list with detailed explanations for each item. Include practical tips.',
            case_study: 'Present a real-world example or scenario that illustrates the point. Include specific outcomes and lessons learned.',
            stats: 'Lead with data and statistics. Explain what the numbers mean and why they matter. Cite sources.',
            how_to: 'Provide step-by-step instructions with specific details. Include tips, common mistakes, and expected outcomes.',
        };

        const snippetInstructions: Record<string, string> = {
            paragraph: 'The first paragraph under the H2 MUST be a concise 40-60 word definition/answer that could be extracted as a featured snippet.',
            list: 'Include a numbered or bulleted list of 5-8 items right after the H2 heading for featured snippet targeting.',
            table: 'Include a comparison or data table right after the H2 heading for featured snippet targeting.',
            none: '',
        };

        const competitorContext = competitorExcerpts.length > 0
            ? `\nCOMPETITOR REFERENCE (your section must be MORE detailed and specific than these):\n${competitorExcerpts.join('\n---\n')}`
            : '';

        const dataPoints = keyDataPoints.length > 0
            ? `\nKEY DATA POINTS to include: ${keyDataPoints.join('; ')}`
            : '';

        // Article-level type rule (verdict/winner/CTA semantics the coarse
        // section enum can't carry) + CTA rules for monetizable types.
        const typeRule = ARTICLE_TYPE_BODY_RULES[articleType] || '';
        const articleTypeRule = typeRule ? `\nCONTENT-TYPE RULE: ${typeRule}` : '';
        const monetizableTypes = ['review', 'listicle', 'comparison', 'alternatives'];
        const ctaRuleIfApplicable = monetizableTypes.includes(articleType) ? `\n${CTA_RULES}` : '';

        const sectionPrompt = `Write section ${sectionIndex + 1} of an article about "${keyword}".

HEADING: <h2 id="section-${sectionIndex + 1}">${h2}</h2>
SUB-HEADINGS: ${h3s.map(h => `<h3>${h}</h3>`).join(', ')}

TARGET WORD COUNT: ${targetWords} words
WRITING APPROACH: ${contentTypeInstructions[contentType] || contentTypeInstructions.explanation}
WRITING ANGLE: ${writingAngle}
${snippetInstructions[snippetTarget] || ''}
${competitorContext}
${dataPoints}${contextNote}${articleTypeRule}

RULES:
- Start with the H2 heading tag (include id="section-${sectionIndex + 1}")
- Include ALL the H3 sub-headings listed above
- Each H3 section should have 100-180 words of substantive content (NOT 1-2 sentences — develop each point fully with examples, data, or practical advice)
- The H2 heading should feel specific and clickable — if it sounds generic (e.g. "Understanding X"), rewrite it to be more specific (e.g. "3 ${keyword} Patterns That Top Performers Use")
- Include "${keyword}" or a semantic variation at least once in this section's content
- Use <strong> for key terms, <a> for citations, <ul>/<ol> for lists
- Write with personality and specific opinions where appropriate
- Include 1 callout box (tip, warning, or note) if this section has actionable advice or important warnings. Use: <div class="callout-{type}"><div class="callout-icon">{emoji}</div><div class="callout-content"><strong class="callout-title">{Title}</strong><p>{content}</p></div></div>
- Return HTML ONLY (h2, h3, p, ul, ol, li, strong, a, table, blockquote, dl, dt, dd, pre, code, figure, figcaption, div.callout-tip, div.callout-warning, div.callout-note, div.callout-info, div.pull-quote, div.stat-highlight, div.cta-box)${langNote}
- Do NOT reuse the H2 heading as a question that other sections already answer. Each section must have a UNIQUE heading.
- Return ONLY raw HTML tags. Do NOT wrap output in markdown code fences (no \`\`\`html or \`\`\`). Just the HTML tags directly.
${HUMAN_STYLE_CONTENT_RULES}
${SECTION_SEO_RULES}
${EXPERTISE_SIGNALS}${ctaRuleIfApplicable}`;

        const MAX_SECTION_RETRIES = 2;
        for (let attempt = 0; attempt <= MAX_SECTION_RETRIES; attempt++) {
            try {
                let result = await ai.generate('section_writing', sectionPrompt, {
                    systemPrompt: `${HUMAN_STYLE_SYSTEM_PROMPT} You are creating ONE section of a long-form article. Include specific data, examples, and actionable insights. Return valid HTML only — no markdown syntax, no code fences (no \`\`\`html blocks). Output raw HTML tags directly.`,
                    temperature: pickTemperature(keyword, 'section') + (attempt * 0.05),
                    maxTokens: 4096,
                });
                result = cleanAIPatterns(result);
                if (result && result.trim().length > 50) {
                    return result;
                }
                logger.warn('Section returned empty', { action: 'generateSection', section: section.h2, attempt: attempt + 1 });
            } catch (error) {
                logger.error('Section generation failed', { action: 'generateSection', section: section.h2, attempt: attempt + 1, maxAttempts: MAX_SECTION_RETRIES + 1 }, error);
                if (attempt < MAX_SECTION_RETRIES) {
                    // Wait before retry (1s, 2s)
                    await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
                }
            }
        }

        // Final fallback after all retries exhausted
        logger.error('All retries exhausted for section — using placeholder', { action: 'generateSection', section: h2 });
        return `<h2 id="section-${sectionIndex + 1}">${h2}</h2>
<p>This section covers ${h2.toLowerCase()} in detail. ${h3s.map(h => h).join(', ')} are key aspects to consider.</p>`;
    }

    // ── Extract FAQ answers from generated HTML ────────────────────
    // Parses the FAQ HTML to populate the faqSection with real answers
    // instead of empty strings (fixes invalid FAQPage schema).
    extractFAQFromHTML(
        content: string,
        outlineFAQs: { question: string; targetWords: number }[]
    ): { question: string; answer: string }[] {
        // Try to find FAQ section in content
        const faqMatch = content.match(/<div[^>]*id="faq-section"[^>]*>([\s\S]*?)<\/div>/i)
            || content.match(/<div[^>]*class="faq-section"[^>]*>([\s\S]*?)<\/div>/i);

        const faqHtml = faqMatch ? faqMatch[1] : content;
        const results: { question: string; answer: string }[] = [];

        // Pattern: <h3>Question?</h3> followed by <p>Answer</p>
        const qaRegex = /<h3[^>]*>(.*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
        let qaMatch;
        while ((qaMatch = qaRegex.exec(faqHtml)) !== null) {
            const question = qaMatch[1].replace(/<[^>]+>/g, '').trim();
            const answer = qaMatch[2].replace(/<[^>]+>/g, '').trim();
            if (question && answer) {
                results.push({ question, answer });
            }
        }

        // If we found FAQ answers from HTML, return those
        if (results.length > 0) return results;

        // Fallback: return outline questions with empty answers (original behavior)
        return outlineFAQs.map(faq => ({
            question: faq.question,
            answer: '',
        }));
    }

    // ── AI-generated Sources & References ───────────────────────
    // Two modes:
    //   1. SERP configured → use ONLY verified URLs from Google search
    //   2. No SERP → generate plain-text citations (no href) to avoid hallucinated 404s
    private async generateSourcesSection(
        keyword: string,
        articleContent: string,
        language: string
    ): Promise<string> {
        try {
            const ai = getAIRouter();
            const plainText = articleContent.replace(/<[^>]+>/g, ' ').substring(0, 3000);
            const langNote = language !== 'en' ? `Write descriptions in ${language}.` : 'Write in English.';

            const serp = getSERPIntelligence();
            const serpConfigured = serp.isConfigured();

            // ── Mode 1: SERP available — build sources from verified URLs ──
            if (serpConfigured) {
                try {
                    const { results } = await serp.searchGoogle(
                        `${keyword} research statistics site:.gov OR site:.edu OR site:.org`,
                        { num: 8 }
                    );

                    if (results.length > 0) {
                        // Verify URLs are reachable before including them
                        const verified = await this.verifySourceUrls(results.map(r => ({
                            url: r.url,
                            title: r.title || r.url,
                        })));

                        if (verified.length > 0) {
                            // Ask AI to match verified URLs to article claims
                            const matchPrompt = `Match these verified reference sources to specific claims in the article about "${keyword}".

ARTICLE EXCERPT:
${plainText}

VERIFIED SOURCES (use ONLY these URLs — do NOT invent new ones):
${verified.map((v, i) => `${i + 1}. ${v.title}: ${v.url}`).join('\n')}

For each source, write one sentence explaining what data it provides that supports the article.
Format each as: <li><a href="URL" target="_blank" rel="noopener noreferrer">Source Title</a> — What it supports</li>
${langNote}

Return ONLY the HTML list items for sources that are relevant. Skip irrelevant ones.`;

                            const matchResult = await ai.generate('section_writing', matchPrompt, {
                                systemPrompt: 'You are a research librarian matching real verified sources to article claims. Use ONLY the provided URLs. Return valid HTML list items only.',
                                temperature: 0.2,
                                maxTokens: 1024,
                            });

                            if (matchResult.trim().includes('<li')) {
                                return `<div class="sources-references">
<h2>Sources and References</h2>
<ol>${matchResult.trim()}</ol>
</div>`;
                            }
                        }
                    }
                } catch (serpErr) {
                    logger.warn('SERP source search failed', { action: 'generateSourcesSection' }, serpErr);
                }
            }

            // ── Mode 2: No SERP — generate plain-text citations (NO href links) ──
            // This avoids hallucinated URLs that return 404 and destroy E-E-A-T trust.
            const citationPrompt = `Generate a "Sources and References" section for an article about "${keyword}".

ARTICLE EXCERPT:
${plainText}

CRITICAL RULES:
1. List 4-6 authoritative reference sources
2. DO NOT include any URLs or hyperlinks — use plain-text citations only
3. Format: Organization Name, "Report/Page Title," Year (if known)
4. Only cite real, well-known organizations and publications
5. Each citation must relate to a specific claim in the article
6. ${langNote}

Format each as: <li><strong>Source Name</strong> — "Report Title," Year. Brief description of what data it provides.</li>

Return ONLY the HTML list items, nothing else.`;

            let result = await ai.generate('section_writing', citationPrompt, {
                systemPrompt: 'You are a research librarian creating a reference list. Use ONLY real, well-known organizations. DO NOT include any URLs. Return valid HTML list items only.',
                temperature: 0.3,
                maxTokens: 1024,
            });

            result = result.trim();
            if (result && result.includes('<li')) {
                return `<div class="sources-references">
<h2>Sources and References</h2>
<ol>${result}</ol>
</div>`;
            }
        } catch (error) {
            logger.error('Sources generation failed', { action: 'generateSourcesSection' }, error);
        }

        // Fallback: honest disclosure instead of vague platitude
        return `<div class="sources-references">
<h2>Sources and References</h2>
<p>This article draws on publicly available data from government agencies, industry research firms, and peer-reviewed publications. Specific sources are cited inline where data is referenced.</p>
</div>`;
    }

    /**
     * Verify source URLs by performing GET requests.
     * Returns only URLs that respond with 200-399 status.
     * Uses GET instead of HEAD because many servers block HEAD requests.
     * Limited to max 10 URLs with a 5-second timeout each.
     */
    private async verifySourceUrls(
        sources: { url: string; title: string }[]
    ): Promise<{ url: string; title: string }[]> {
        const verified: { url: string; title: string }[] = [];

        for (const source of sources.slice(0, 10)) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(source.url, {
                    method: 'GET',
                    signal: controller.signal,
                    redirect: 'follow',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml',
                    },
                });

                clearTimeout(timeout);

                // Accept 200-399 (OK + redirects that landed successfully)
                if (response.status >= 200 && response.status < 400) {
                    verified.push(source);
                } else {
                    logger.warn('Source URL returned non-OK status', { action: 'verifySourceUrls', url: source.url, status: response.status });
                }
            } catch {
                logger.warn('Source URL unreachable', { action: 'verifySourceUrls', url: source.url });
            }
        }

        logger.info('Source URL verification complete', { action: 'verifySourceUrls', verified: verified.length, total: sources.slice(0, 10).length });
        return verified;
    }

    // Optimize existing content
    async optimizeContent(
        existingContent: string,
        keyword: string,
        competitorInsight: CompetitorInsight,
        currentScore: { seo: number; aeo: number; snippet: number; overall: number }
    ): Promise<GeneratedContent> {
        const ai = getAIRouter();

        const prompt = `You are optimizing an existing article for better Google rankings.

TARGET KEYWORD: "${keyword}"

CURRENT SCORES:
- SEO: ${currentScore.seo}/100
- AEO: ${currentScore.aeo}/100  
- Featured Snippet: ${currentScore.snippet}/100
- Overall: ${currentScore.overall}/100

CURRENT CONTENT:
${existingContent.substring(0, 5000)}

COMPETITOR INSIGHTS:
- Topics they cover: ${competitorInsight.commonTopics.join(', ')}
- Our content gaps: ${competitorInsight.contentGaps.join(', ')}
- Snippet opportunities: ${competitorInsight.snippetOpportunities.join(', ')}

OPTIMIZATION INSTRUCTIONS:
1. Keep the existing good content - don't remove valuable information
2. Add missing topics that competitors cover
3. Fill content gaps to differentiate from competitors
4. Improve heading structure for featured snippets
5. Add FAQ section if missing (5+ questions)
6. Add comparison tables if relevant
7. Optimize first paragraph for direct answer (40-60 words)
8. Improve keyword placement and density (0.8-1.5% — NEVER exceed 1.5%)
9. Add "Key Takeaways" section
10. Ensure E-E-A-T signals (real data with attributions, expert vocabulary — DO NOT fabricate stats)
11. Format for voice search / AI Overviews
${HUMAN_STYLE_CONTENT_RULES}

Respond with JSON:
{
  "title": "optimized title",
  "metaTitle": "60-char meta title",
  "metaDescription": "155-char meta description",
  "content": "<full optimized HTML content>",
  "faqSection": [{"question": "...", "answer": "..."}],
  "suggestedInternalLinks": ["..."],
  "suggestedExternalLinks": ["..."]
}`;

        const result = await ai.generate('content_optimization', prompt, {
            systemPrompt: `${HUMAN_STYLE_SYSTEM_PROMPT} You are also an SEO optimization expert. Improve existing content while preserving its strengths. Never fabricate data or credentials. Always respond with valid JSON.`,
            jsonMode: true,
            temperature: 0.5,
            maxTokens: 16384,
        });

        try {
            const parsed = JSON.parse(result);
            parsed.schemaMarkup = generateSchemaMarkup(parsed, keyword);
            parsed.content = cleanAIPatterns(parsed.content);
            return parsed;
        } catch {
            return {
                title: keyword,
                metaTitle: keyword,
                metaDescription: '',
                content: result,
                faqSection: [],
                schemaMarkup: {},
                suggestedInternalLinks: [],
                suggestedExternalLinks: [],
            };
        }
    }

    // Generate meta tags
    async generateMetaTags(
        content: string,
        keyword: string
    ): Promise<{ metaTitle: string; metaDescription: string }> {
        const ai = getAIRouter();
        const year = new Date().getFullYear();

        const prompt = `Generate SEO meta tags for this content targeting "${keyword}":

Content excerpt: ${content.substring(0, 1000)}

META TITLE RULES (this appears in Google search results — CTR is everything):
- MUST be ≤ 60 characters (Google truncates longer titles)
- Put "${keyword}" within the first 5 words
- Include a click trigger: year (${year}), a number, [brackets], (parenthetical), or a power word (proven, best, tested, essential, surprising)
- Use a proven CTR formula: "${keyword} Guide (${year}) — X Proven Tips" or "Best ${keyword} [Tested & Ranked]" or "X ${keyword} Strategies That Actually Work"
- NEVER use generic patterns: "Ultimate Guide", "Complete Guide", "Everything You Need to Know", "Comprehensive Overview"

META DESCRIPTION RULES:
- MUST be ≤ 155 characters
- Include "${keyword}" naturally in the first sentence
- End with a CTA: "Learn how", "Discover why", "Find out", "See our picks"
- Include a specific benefit or number

Respond with JSON:
{
  "metaTitle": "≤60-char title following rules above",
  "metaDescription": "≤155-char description with keyword, benefit, and CTA"
}`;

        const result = await ai.generate('meta_generation', prompt, {
            systemPrompt: 'Generate SEO meta tags optimized for click-through rate. Be concise, specific, and compelling. Always respond with valid JSON.',
            jsonMode: true,
            temperature: 0.5,
        });

        try {
            const parsed = JSON.parse(result);
            // Post-generation validation
            let metaTitle = typeof parsed.metaTitle === 'string' ? parsed.metaTitle : keyword;
            if (metaTitle.length > 60) metaTitle = metaTitle.substring(0, 57) + '...';
            let metaDescription = typeof parsed.metaDescription === 'string' ? parsed.metaDescription : '';
            if (metaDescription.length > 155) metaDescription = metaDescription.substring(0, 152) + '...';
            return { metaTitle, metaDescription };
        } catch {
            return { metaTitle: keyword, metaDescription: '' };
        }
    }
}

export const getContentWriter = createSingleton(() => new ContentWriter());
