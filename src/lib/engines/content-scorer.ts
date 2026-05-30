// ============================================================
// RankMaster Pro - 15-Dimension Content Scoring Engine
// ============================================================

import { ContentScore, ScoreDetail } from '../types';
import { getAIRouter } from '../ai/router';
import { createSingleton } from '../singleton';
import { detectSearchIntent } from './content-utils';

export class ContentScorer {
    // Main scoring function - analyzes content across 10 dimensions
    async scoreContent(
        content: string,
        targetKeyword: string,
        options?: {
            competitorWordCounts?: number[];
            competitorContents?: string[];
            hasSchema?: boolean;
            internalLinkCount?: number;
            externalLinkCount?: number;
            publishedDate?: string;
        }
    ): Promise<ContentScore> {
        const details: ScoreDetail[] = [];

        const seo = this.scoreSEO(content, targetKeyword);
        details.push(seo);

        const aeo = this.scoreAEO(content, targetKeyword);
        details.push(aeo);

        const eeat = this.scoreEEAT(content);
        details.push(eeat);

        const readability = this.scoreReadability(content, targetKeyword);
        details.push(readability);

        const snippet = this.scoreSnippetReadiness(content, targetKeyword);
        details.push(snippet);

        const schema = this.scoreSchema(content, options?.hasSchema || false);
        details.push(schema);

        const links = this.scoreLinks(
            content,
            options?.internalLinkCount || 0,
            options?.externalLinkCount || 0
        );
        details.push(links);

        const freshness = this.scoreFreshness(options?.publishedDate);
        details.push(freshness);

        const depth = this.scoreDepth(content, options?.competitorWordCounts || []);
        details.push(depth);

        const intent = this.scoreIntentMatch(content, targetKeyword);
        details.push(intent);

        const geo = this.scoreGEO(content, targetKeyword, options?.hasSchema || false);
        details.push(geo);

        // 12. SERP Correlation — compare against real competitor content
        const serpCorrelation = this.scoreSERPCorrelated(content, targetKeyword, options?.competitorContents || []);
        details.push(serpCorrelation);

        // 13. Passage-Level Scoring (#50) — are individual passages independently rankable?
        const passage = this.scorePassageQuality(content);
        details.push(passage);

        // 14. Entity Saturation (#51) — are key entities present and properly referenced?
        const entity = this.scoreEntitySaturation(content, targetKeyword);
        details.push(entity);

        // 15. GEO Citation Density (#52) — are claims properly attributed for AI extraction?
        const citation = this.scoreCitationDensity(content);  
        details.push(citation);

        // 16. Format Diversity — visual variety of content elements
        const formatDiv = this.scoreFormatDiversity(content);
        details.push(formatDiv);

        const scores: ContentScore = {
            seo: seo.score,
            aeo: aeo.score,
            eeat: eeat.score,
            readability: readability.score,
            snippet: snippet.score,
            schema: schema.score,
            links: links.score,
            freshness: freshness.score,
            depth: depth.score,
            intent: intent.score,
            geo: geo.score,
            serpCorrelation: serpCorrelation.score,
            passage: passage.score,
            entitySaturation: entity.score,
            citationDensity: citation.score,
            formatDiversity: formatDiv.score,
            topicCoverage: (serpCorrelation as unknown as { topicCoverage?: number }).topicCoverage || 0,
            missingTopics: (serpCorrelation as unknown as { missingTopics?: string[] }).missingTopics || [],
            overall: 0,
            details,
        };

        // Weighted average — 16 dimensions (rebalanced from 15)
        scores.overall = Math.round(
            scores.seo * 0.07 +
            scores.aeo * 0.08 +
            scores.eeat * 0.09 +
            scores.readability * 0.05 +
            scores.snippet * 0.07 +
            scores.schema * 0.05 +
            scores.links * 0.05 +
            scores.freshness * 0.04 +
            scores.depth * 0.05 +
            scores.intent * 0.05 +
            scores.geo * 0.09 +
            scores.serpCorrelation * 0.09 +
            scores.passage * 0.07 +
            scores.entitySaturation * 0.05 +
            scores.citationDensity * 0.05 +
            scores.formatDiversity * 0.05
        );

        return scores;
    }

    // 1. SEO Score - keyword placement, density, meta optimization
    private scoreSEO(content: string, keyword: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const maxScore = 100;
        const lowerContent = content.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        // Strip HTML for text-only analysis (keyword density, word count, first-100 check)
        const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const plainLower = plainText.toLowerCase();

        // Title/H1 contains keyword
        const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match && h1Match[1].toLowerCase().includes(lowerKeyword)) {
            score += 20;
        } else {
            issues.push('Target keyword not found in H1/Title');
            suggestions.push('Add target keyword to your H1 heading');
        }

        // First 100 words contain keyword (use plain text, not HTML)
        const first100 = plainLower.split(/\s+/).slice(0, 100).join(' ');
        if (first100.includes(lowerKeyword)) {
            score += 15;
        } else {
            issues.push('Keyword not in first 100 words');
            suggestions.push('Include keyword naturally in your introduction');
        }

        // PA-2 FIX: Keyword density (0.8-1.5% ideal — aligned with prompt instruction)
        // Below 0.8% gets partial credit, below 0.5% is too low
        // Use plain text (HTML stripped) for accurate density calculation
        const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;
        const keywordCount = (plainLower.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        const density = (keywordCount / wordCount) * 100;

        if (density >= 0.8 && density <= 1.5) {
            score += 15;
        } else if (density >= 0.5 && density < 0.8) {
            score += 10; // Partial credit — slightly under ideal
            suggestions.push(`Keyword density (${density.toFixed(1)}%) is below ideal — aim for 0.8-1.5%`);
        } else if (density < 0.5) {
            issues.push(`Keyword density too low (${density.toFixed(1)}%)`);
            suggestions.push('Use keyword more naturally throughout the content');
        } else if (density <= 2.5) {
            score += 8; // Slightly above ideal — not penalized but not optimal
            suggestions.push(`Keyword density (${density.toFixed(1)}%) is slightly high — aim for 0.8-1.5%`);
        } else {
            issues.push(`Keyword density too high (${density.toFixed(1)}%) — over-optimization risk`);
            suggestions.push('Reduce keyword usage and use synonyms/LSI terms instead');
        }

        // H2/H3 headings contain keyword or variations
        const subheadings = content.match(/<h[2-3][^>]*>(.*?)<\/h[2-3]>/gi) || [];
        const headingsWithKeyword = subheadings.filter(h =>
            h.toLowerCase().includes(lowerKeyword)
        );
        if (headingsWithKeyword.length > 0) {
            score += 15;
        } else {
            suggestions.push('Include keyword in at least one H2 subheading');
        }

        // Has meta description length content
        if (wordCount > 300) score += 10;
        if (wordCount > 1000) score += 10;

        // Has images with alt text — comprehensive image SEO analysis
        const images = content.match(/<img[^>]+>/gi) || [];
        const imgComments = content.match(/<!-- IMAGE:.*?-->/gi) || []; // Unresolved AI placeholders
        const realImageCount = images.length;
        const totalImgSignals = images.length + imgComments.length;

        if (realImageCount >= 3) {
            score += 5; // Full points for real images
        } else if (totalImgSignals >= 3) {
            score += 3; // Partial for mix of real + placeholder
            suggestions.push('Some image placeholders were not resolved — configure an image API in Settings');
        } else if (totalImgSignals >= 1) {
            score += 2;
            suggestions.push('Add 2-3 more images/infographics for richer visual content');
        } else {
            issues.push('No images found in content');
            suggestions.push('Add at least 3 images with descriptive alt text including your keyword');
        }

        // Check lazy loading on images (Core Web Vitals signal)
        if (realImageCount > 0) {
            const lazyImages = images.filter(img => /loading=["']lazy["']/i.test(img)).length;
            if (lazyImages >= realImageCount - 1) {
                score += 2; // Allow hero image to not be lazy
            } else {
                suggestions.push('Add loading="lazy" to non-hero images for better Core Web Vitals');
            }
        }

        // Check alt text quality
        const altTexts = images.map(img => {
            const altMatch = img.match(/alt="([^"]*)"/i);
            return altMatch ? altMatch[1] : '';
        });
        const hasAltText = altTexts.filter(a => a.trim().length > 0);
        const hasKeywordInAlt = altTexts.filter(a => a.toLowerCase().includes(lowerKeyword));

        if (images.length > 0 && hasAltText.length === images.length) {
            score += 3;
        } else if (images.length > 0) {
            issues.push(`${images.length - hasAltText.length} image(s) missing alt text`);
            suggestions.push('Add descriptive alt text to every image');
        }

        if (hasKeywordInAlt.length > 0) {
            score += 2;
        } else if (images.length > 0) {
            suggestions.push('Include target keyword naturally in at least one image alt attribute');
        }

        // URL-friendly slug check — validate actual slug quality
        const slugFromTitle = (h1Match?.[1] || keyword)
            .toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/)
            .filter((w: string) => w.length > 2).slice(0, 5).join('-');
        if (slugFromTitle.length > 0 && slugFromTitle.length <= 60) {
            score += 10;
        } else {
            suggestions.push('Optimize URL slug: 3-5 words, no stop words, under 60 characters');
        }

        return { dimension: 'SEO', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // 2. AEO Score - Answer Engine Optimization
    private scoreAEO(content: string, keyword: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const maxScore = 100;

        // Has direct answer in first paragraph (40-60 words)
        const paragraphs = content.match(/<p[^>]*>(.*?)<\/p>/gi) || [];
        if (paragraphs.length > 0) {
            const firstParaWords = paragraphs[0]!.replace(/<[^>]+>/g, '').split(/\s+/).length;
            if (firstParaWords >= 30 && firstParaWords <= 80) {
                score += 20;
            } else {
                suggestions.push('Make first paragraph a concise 40-60 word direct answer');
            }
        }

        // Has Q&A format (questions as headings)
        const questionHeadings = content.match(/<h[2-4][^>]*>[^<]*\?[^<]*<\/h[2-4]>/gi) || [];
        if (questionHeadings.length >= 3) {
            score += 25;
        } else if (questionHeadings.length >= 1) {
            score += 15;
            suggestions.push('Add more question-based subheadings (aim for 3+)');
        } else {
            issues.push('No question-based headings found');
            suggestions.push('Add FAQ-style questions as H2/H3 headings');
        }

        // Has FAQ section
        if (content.toLowerCase().includes('faq') || content.toLowerCase().includes('frequently asked')) {
            score += 20;
        } else {
            suggestions.push('Add a dedicated FAQ section');
        }

        // Has concise answers after question headings (validate actual answer length)
        if (questionHeadings.length > 0) {
            // Check if paragraphs following question headings are 30-80 words (concise answer range)
            const questionAnswerPattern = /<h[2-4][^>]*>[^<]*\?[^<]*<\/h[2-4]>\s*<p[^>]*>(.*?)<\/p>/gi;
            const answers = [...content.matchAll(questionAnswerPattern)];
            const conciseAnswers = answers.filter(a => {
                const wordCount = a[1].replace(/<[^>]+>/g, '').split(/\s+/).length;
                return wordCount >= 25 && wordCount <= 80;
            });
            if (conciseAnswers.length >= 2) score += 15;
            else if (conciseAnswers.length >= 1) score += 8;
            else suggestions.push('Add concise 30-60 word answers immediately after question headings');
        }

        // Has structured lists
        const hasList = content.includes('<ul') || content.includes('<ol');
        if (hasList) {
            score += 10;
        } else {
            suggestions.push('Add bullet points or numbered lists for key points');
        }

        // Has table
        if (content.includes('<table')) {
            score += 10;
        }

        return { dimension: 'AEO', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // 3. E-E-A-T Score — Deep signal analysis
    private scoreEEAT(content: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const maxScore = 100;
        const lowerContent = content.toLowerCase();

        // === EXPERIENCE signals (first-person, practical knowledge) ===
        const experiencePatterns = [
            /\b(in my experience|i['']ve tested|i['']ve used|from my testing|hands-on|first-hand|personally tried)\b/gi,
            /\b(our team found|we discovered|we tested|our research|our analysis)\b/gi,
        ];
        const hasExperience = experiencePatterns.some(p => p.test(content));
        if (hasExperience) {
            score += 10;
        } else {
            suggestions.push('Add first-person experience signals ("In my testing…", "I\'ve used X for Y years")');
        }

        // === EXPERTISE signals (credentials, depth, author box) ===
        // Author box / byline
        const hasAuthorBox = lowerContent.includes('author-box') || lowerContent.includes('written by') ||
            lowerContent.includes('reviewed by') || lowerContent.includes('medically reviewed') ||
            lowerContent.includes('fact-checked by') || /<div[^>]*class="[^"]*author/i.test(content);
        if (hasAuthorBox) {
            score += 12;
        } else {
            issues.push('No author box or byline detected');
            suggestions.push('Add an Author Box with name, photo, credentials, and bio');
        }

        // Expert language density
        const expertTerms = [
            'methodology', 'empirical', 'peer-reviewed', 'longitudinal', 'meta-analysis',
            'systematic review', 'clinical trial', 'evidence-based', 'benchmark', 'framework',
            'implementation', 'optimization', 'algorithm', 'architecture', 'protocol',
        ];
        const expertTermCount = expertTerms.filter(t => lowerContent.includes(t)).length;
        if (expertTermCount >= 3) score += 8;
        else if (expertTermCount >= 1) score += 4;

        // === AUTHORITATIVENESS signals (citations, external links quality) ===
        // Count outbound links
        const allLinks = content.match(/<a[^>]+href="([^"]+)"/gi) || [];
        const externalLinks = allLinks.filter(l => {
            const href = l.match(/href="([^"]+)"/)?.[1] || '';
            return href.startsWith('http') && !href.includes('javascript:');
        });

        // Check for authoritative domains
        const authoritativeDomains = ['.gov', '.edu', '.org', 'ncbi.nlm.nih', 'scholar.google',
            'pubmed', 'reuters', 'bbc', 'nytimes', 'harvard', 'stanford', 'mit.edu'];
        const authoritativeLinks = externalLinks.filter(l =>
            authoritativeDomains.some(d => l.toLowerCase().includes(d))
        );

        if (authoritativeLinks.length >= 3) score += 12;
        else if (authoritativeLinks.length >= 1) score += 6;
        else if (externalLinks.length >= 3) score += 4;

        if (externalLinks.length === 0) {
            issues.push('No external citations found');
            suggestions.push('Add 3-5 links to authoritative sources (.gov, .edu, research papers)');
        } else if (authoritativeLinks.length === 0) {
            suggestions.push('Link to more authoritative domains (.gov, .edu, research publications)');
        }

        // Has structured references/sources section
        const hasSourcesSection = lowerContent.includes('sources') || lowerContent.includes('references') ||
            lowerContent.includes('bibliography') || lowerContent.includes('works cited');
        if (hasSourcesSection) {
            score += 8;
        } else {
            suggestions.push('Add a "Sources & References" section at the end of the article');
        }

        // === DATA & STATISTICS depth ===
        const percentages = (content.match(/\d+(\.\d+)?%/g) || []).length;
        const specificNumbers = (content.match(/\b\d{2,}(,\d{3})*(\.\d+)?\b/g) || []).length;
        const yearReferences = (content.match(/\b20[12]\d\b/g) || []).length;

        const dataScore = Math.min(percentages * 2 + specificNumbers + yearReferences, 15);
        score += dataScore;
        if (dataScore < 5) {
            suggestions.push('Include more specific statistics, data points, and recent year references');
        }

        // === TRUSTWORTHINESS signals ===
        // Last Updated / publication date
        const hasDateSignal = lowerContent.includes('updated') || lowerContent.includes('last modified') ||
            lowerContent.includes('published on') || lowerContent.includes('reviewed on') ||
            /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+20\d{2}/i.test(content);
        if (hasDateSignal) {
            score += 10;
        } else {
            suggestions.push('Add visible "Last Updated: [date]" near the title');
        }

        // Editorial review / fact-check signals
        const hasEditorialSignal = lowerContent.includes('fact-checked') || lowerContent.includes('editorially reviewed') ||
            lowerContent.includes('editorial policy') || lowerContent.includes('peer reviewed');
        if (hasEditorialSignal) score += 8;

        // Content comprehensiveness (depth as trust signal)
        const wordCount = content.replace(/<[^>]+>/g, '').split(/\s+/).length;
        if (wordCount > 2500) score += 10;
        else if (wordCount > 1500) score += 7;
        else if (wordCount > 800) score += 4;
        else {
            suggestions.push('Increase content depth — aim for 1500+ words for comprehensive coverage');
        }

        // Expert quotes with attribution
        const quotePatterns = /according to|as\s+\w+\s+(noted|stated|explained|reported)|research (shows|suggests|indicates|reveals)|study (found|published|conducted)/gi;
        const quoteCount = (content.match(quotePatterns) || []).length;
        if (quoteCount >= 3) score += 7;
        else if (quoteCount >= 1) score += 4;
        else suggestions.push('Add expert quotes with attribution ("According to Dr. X…")');

        return { dimension: 'E-E-A-T', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // 4. Readability Score — intent-aware targets
    private scoreReadability(content: string, keyword?: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        const maxScore = 100;

        const text = content.replace(/<[^>]+>/g, '');
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);
        const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).filter(w => w.length > 0).length);

        const avgSentenceLength = words.length / Math.max(sentences.length, 1);
        const avgSyllablesPerWord = syllables / Math.max(words.length, 1);

        // Flesch Reading Ease
        const fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

        // Detect intent type from keyword for target calibration
        const lowerKeyword = (keyword || '').toLowerCase();
        const searchIntent = detectSearchIntent(keyword || '');
        // isTechnical is orthogonal to search intent — it's a topic complexity signal
        const isTechnical = /api|code|algorithm|implementation|architecture|config/i.test(lowerKeyword);

        let targetMin: number, targetMax: number, audienceLabel: string;
        if (isTechnical) {
            targetMin = 40; targetMax = 55; audienceLabel = 'technical audience (Flesch 40-55)';
        } else if (searchIntent === 'commercial') {
            targetMin = 50; targetMax = 65; audienceLabel = 'commercial intent (Flesch 50-65)';
        } else {
            targetMin = 55; targetMax = 75; audienceLabel = 'general audience (Flesch 55-75)';
        }

        let score: number;
        if (fleschScore >= targetMin && fleschScore <= targetMax) {
            score = 90; // Perfect range for this intent
        } else if (fleschScore > targetMax) {
            // Too simple for the intent
            score = Math.max(60, 90 - (fleschScore - targetMax) * 1.5);
            if (fleschScore > targetMax + 15) {
                suggestions.push(`Content may be too basic for ${audienceLabel} — consider adding more depth`);
            }
        } else {
            // Too complex for the intent
            score = Math.max(30, 90 - (targetMin - fleschScore) * 2);
            suggestions.push(`Content is too complex for ${audienceLabel} — simplify sentences and word choices`);
        }

        if (avgSentenceLength > 25) {
            issues.push(`Average sentence length is ${avgSentenceLength.toFixed(0)} words (too long)`);
            suggestions.push('Break long sentences into shorter ones (aim for 15-20 words)');
            score = Math.max(score - 10, 0);
        }

        // Check for short paragraphs
        const paragraphs = content.match(/<p[^>]*>(.*?)<\/p>/gi) || [];
        const longParas = paragraphs.filter(p => p.replace(/<[^>]+>/g, '').split(/\s+/).length > 100);
        if (longParas.length > 0) {
            suggestions.push('Break long paragraphs into 2-3 sentence blocks');
            score = Math.max(score - 5, 0);
        }

        // Bonus for transition words (improves readability flow)
        // NOTE: excluded "furthermore", "moreover", "additionally" — they're banned by the humanizer
        const transitions = (text.match(/\b(however|therefore|meanwhile|specifically|for example|in contrast|as a result|on the other hand|that said|in other words|for instance|to illustrate|put simply|here's the thing|the key point is)\b/gi) || []).length;
        if (transitions >= 5) score = Math.min(score + 5, maxScore);

        // MI-5: Sentence length variation metric — high variation = more natural writing
        if (sentenceLengths.length >= 5) {
            const mean = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
            const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / sentenceLengths.length;
            const stdDev = Math.sqrt(variance);
            const coeffOfVariation = mean > 0 ? stdDev / mean : 0;

            if (coeffOfVariation >= 0.4) {
                // Good variation — sentences feel naturally diverse
                score = Math.min(score + 5, maxScore);
            } else if (coeffOfVariation < 0.2) {
                // Very monotone — all sentences roughly same length (AI pattern)
                issues.push(`Sentence length variation is too low (CV: ${coeffOfVariation.toFixed(2)}) — feels robotic`);
                suggestions.push('Mix short punchy sentences (5-8 words) with medium sentences (15-20 words) for natural rhythm');
                score = Math.max(score - 5, 0);
            }
        }

        return { dimension: 'Readability', score: Math.round(Math.min(score, maxScore)), maxScore, issues, suggestions };
    }

    // 5. Featured Snippet Score
    private scoreSnippetReadiness(content: string, keyword: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const maxScore = 100;

        // Paragraph snippet: Direct answer in 40-60 words
        const paragraphs = content.match(/<p[^>]*>(.*?)<\/p>/gi) || [];
        const conciseParagraphs = paragraphs.filter(p => {
            const wordCount = p.replace(/<[^>]+>/g, '').split(/\s+/).length;
            return wordCount >= 30 && wordCount <= 60;
        });
        if (conciseParagraphs.length > 0) {
            score += 20;
        } else {
            suggestions.push('Add a 40-60 word paragraph that directly defines/answers the keyword');
        }

        // List snippet: Has ordered/unordered lists
        if (content.includes('<ol')) {
            score += 20;
        } else if (content.includes('<ul')) {
            score += 15;
        } else {
            suggestions.push('Add a numbered or bulleted list for step-by-step or feature content');
        }

        // Table snippet: Has comparison/data table
        if (content.includes('<table')) {
            score += 20;
        } else {
            suggestions.push('Add a comparison or data table');
        }

        // Has "What is" or "How to" heading format
        const definitionHeadings = content.match(/<h[2-3][^>]*>[^<]*(what is|how to|definition|meaning|overview)[^<]*<\/h[2-3]>/gi);
        if (definitionHeadings) {
            score += 15;
        }

        // Key Takeaways / Summary box
        if (content.toLowerCase().includes('key takeaway') || content.toLowerCase().includes('summary') || content.toLowerCase().includes('tldr')) {
            score += 15;
        } else {
            suggestions.push('Add a "Key Takeaways" or "Summary" section');
        }

        // Proper heading hierarchy
        const headings = content.match(/<h[1-6][^>]*>/gi) || [];
        if (headings.length >= 5) {
            score += 10;
        }

        return { dimension: 'Featured Snippet', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // 6. Schema Score — checks for 6 schema types
    private scoreSchema(content: string, hasSchema: boolean): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const maxScore = 100;
        const lowerContent = content.toLowerCase();

        if (!hasSchema) {
            issues.push('No schema markup detected');
            suggestions.push('Add BlogPosting schema markup (minimum requirement)');
            return { dimension: 'Schema', score: 0, maxScore, issues, suggestions };
        }

        // Base: has any schema
        score += 20;

        // Check for BlogPosting/Article schema signals in content
        const hasBlogPostSignals = content.includes('BlogPosting') || content.includes('Article');
        if (hasBlogPostSignals) {
            score += 10;
        }

        // FAQPage schema check
        const hasFAQContent = lowerContent.includes('faq') || lowerContent.includes('frequently asked');
        if (hasFAQContent) {
            score += 15;
        } else {
            suggestions.push('Add FAQ section to enable FAQPage schema');
        }

        // HowTo schema check
        const hasHowToContent = (lowerContent.includes('step') || lowerContent.includes('how to')) && content.includes('<ol');
        if (hasHowToContent) {
            score += 15;
        }

        // BreadcrumbList — only score if actually included in schema
        const hasBreadcrumb = content.includes('BreadcrumbList');
        if (hasBreadcrumb) score += 10;

        // SpeakableSpecification — score only if present
        const hasSpeakable = content.includes('SpeakableSpecification');
        if (hasSpeakable) score += 10;

        // ItemList for listicle content
        const isListicle = /\b(top|best|\d+)\s+/i.test(content.substring(0, 200));
        if (isListicle) {
            score += 10;
        }

        // Bonus: multiple schema types detected
        if (score >= 60) {
            score += 10; // comprehensive schema bonus
        }

        return { dimension: 'Schema', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // 7. Links Score
    private scoreLinks(content: string, internalCount: number, externalCount: number): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const maxScore = 100;

        // Internal links
        if (internalCount >= 5) score += 40;
        else if (internalCount >= 3) score += 30;
        else if (internalCount >= 1) score += 15;
        else {
            issues.push('No internal links found');
            suggestions.push('Add 3-5 internal links to related posts');
        }

        // External links
        if (externalCount >= 3) score += 40;
        else if (externalCount >= 1) score += 25;
        else {
            issues.push('No external links found');
            suggestions.push('Add 2-3 links to authoritative external sources');
        }

        // Link diversity
        if (internalCount > 0 && externalCount > 0) score += 20;

        return { dimension: 'Links', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // 8. Freshness Score
    private scoreFreshness(publishedDate?: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 100;
        const maxScore = 100;

        if (!publishedDate) {
            // C3 FIX: no date available — don't assume fresh, award modest baseline
            return { dimension: 'Freshness', score: 30, maxScore, issues: ['No publish date available'], suggestions: ['Publish date helps search engines assess freshness'] };
        }

        const daysSince = (Date.now() - new Date(publishedDate).getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince > 365) {
            score = 20;
            issues.push('Content is over 1 year old');
            suggestions.push('Update with current data and re-publish');
        } else if (daysSince > 180) {
            score = 50;
            suggestions.push('Consider refreshing this content');
        } else if (daysSince > 90) {
            score = 70;
        }

        return { dimension: 'Freshness', score, maxScore, issues, suggestions };
    }

    // 9. Depth Score
    private scoreDepth(content: string, competitorWordCounts: number[]): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        const maxScore = 100;

        const text = content.replace(/<[^>]+>/g, '');
        const wordCount = text.split(/\s+/).length;
        const headingCount = (content.match(/<h[2-6][^>]*>/gi) || []).length;

        let score = 0;

        // Word count relative to competitors
        if (competitorWordCounts.length > 0) {
            const avgCompetitor = competitorWordCounts.reduce((a, b) => a + b, 0) / competitorWordCounts.length;
            const ratio = wordCount / avgCompetitor;

            if (ratio >= 1.2) score += 40;
            else if (ratio >= 0.8) score += 25;
            else {
                issues.push(`Content (${wordCount} words) is shorter than competitor average (${Math.round(avgCompetitor)} words)`);
                suggestions.push(`Aim for at least ${Math.round(avgCompetitor * 1.2)} words`);
                score += 10;
            }
        } else {
            if (wordCount >= 2000) score += 40;
            else if (wordCount >= 1000) score += 25;
            else score += 10;
        }

        // Heading structure depth
        if (headingCount >= 8) score += 30;
        else if (headingCount >= 5) score += 20;
        else if (headingCount >= 3) score += 10;
        else suggestions.push('Add more subheadings to break up content (aim for 5+)');

        // Has multiple content types
        if (content.includes('<table')) score += 10;
        if (content.includes('<ul') || content.includes('<ol')) score += 10;
        if (content.includes('<img')) score += 10;

        return { dimension: 'Depth', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // 10. Intent Match Score
    private scoreIntentMatch(content: string, keyword: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 30; // C3 FIX: base lowered from 50 — score should be earned
        const maxScore = 100;

        // Use unified intent detection
        const intent = detectSearchIntent(keyword);

        if (intent === 'informational') {
            // Should have educational content, definitions, examples
            if (content.toLowerCase().includes('example') || content.toLowerCase().includes('for instance')) score += 15;
            if (content.match(/<h[2-3][^>]*>[^<]*\?[^<]*<\/h[2-3]>/gi)) score += 15;
            if (content.includes('<ol') || content.includes('<ul')) score += 10;
            if ((content.match(/<h[2-6][^>]*>/gi) || []).length >= 5) score += 10;
        } else if (intent === 'commercial') {
            // Should have comparisons, pros/cons, ratings
            if (content.includes('<table')) score += 15;
            if (content.toLowerCase().includes('pros') || content.toLowerCase().includes('cons')) score += 15;
            if (content.toLowerCase().includes('recommend') || content.toLowerCase().includes('winner')) score += 10;
            if (content.toLowerCase().includes('price') || content.toLowerCase().includes('cost')) score += 10;
        } else if (intent === 'transactional') {
            // Should have CTA, pricing, links to buy
            if (content.toLowerCase().includes('buy') || content.toLowerCase().includes('get started')) score += 15;
            if (content.toLowerCase().includes('price')) score += 15;
            // C3 FIX: removed unconditional +20 — transactional intent must earn score too
            if (content.toLowerCase().includes('free trial') || content.toLowerCase().includes('sign up')) score += 10;
        }

        return { dimension: 'Intent Match', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // 11. GEO Score — Generative Engine Optimization (AI Overview readiness)
    private scoreGEO(content: string, keyword: string, hasSchema: boolean): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const maxScore = 100;
        const lowerContent = content.toLowerCase();
        const plainText = content.replace(/<[^>]+>/g, '');

        // 1. Definitive answer in first 50 words
        const firstParagraph = content.match(/<p[^>]*>(.*?)<\/p>/i);
        if (firstParagraph) {
            const firstWords = firstParagraph[1].replace(/<[^>]+>/g, '').split(/\s+/).slice(0, 50).join(' ').toLowerCase();
            if (firstWords.includes(keyword.toLowerCase().split(' ')[0])) {
                score += 15;
            } else {
                issues.push('Keyword not found in first 50 words');
                suggestions.push('Start with a direct, keyword-rich answer in the first paragraph (40-60 words)');
            }
        } else {
            issues.push('No introductory paragraph detected');
        }

        // 2. Concise definition blocks (<strong> TL;DR after headings)
        const strongAfterH2 = content.match(/<\/h2>[\s\S]{0,100}<strong>/gi) || [];
        if (strongAfterH2.length >= 3) score += 15;
        else if (strongAfterH2.length >= 1) score += 8;
        else suggestions.push('Add 1-2 sentence <strong> TL;DR definitions after each H2 heading');

        // 3. Citation density (source attributions per 500 words)
        const wordCount = plainText.split(/\s+/).length;
        const citations = (content.match(/\([^)]*source[^)]*\)|\([^)]*\d{4}\)|\[\d+\]|according to|research (shows|suggests|found)/gi) || []).length;
        const citationPer500 = wordCount > 0 ? (citations / wordCount) * 500 : 0;
        if (citationPer500 >= 2) score += 15;
        else if (citationPer500 >= 1) score += 8;
        else suggestions.push('Add source citations — aim for at least 1 per 500 words for AI engine trust');

        // 4. Q&A heading structure (question-based headings)
        const questionHeadings = (content.match(/<h[2-3][^>]*>[^<]*\?[^<]*<\/h[2-3]>/gi) || []).length;
        if (questionHeadings >= 4) score += 12;
        else if (questionHeadings >= 2) score += 7;
        else suggestions.push('Use question-based headings ("What is..?", "How does..?") — AI engines prefer Q&A format');

        // 5. Schema completeness (multi-type = better AI extraction)
        if (hasSchema) score += 12;
        else suggestions.push('Schema markup helps AI engines understand and cite your content');

        // 6. Entity coverage — check for proper nouns, brand names, technical terms
        const entities = (plainText.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g) || []);
        const uniqueEntities = new Set(entities.filter(e => e.length > 3));
        if (uniqueEntities.size >= 15) score += 12;
        else if (uniqueEntities.size >= 8) score += 7;
        else suggestions.push('Include more named entities (people, products, organizations) for AI entity matching');

        // 7. Structured data diversity (lists, tables, steps)
        const hasList = content.includes('<ul') || content.includes('<ol');
        const hasTable = content.includes('<table');
        const hasFAQ = lowerContent.includes('faq') || lowerContent.includes('frequently asked');
        const structureCount = [hasList, hasTable, hasFAQ].filter(Boolean).length;
        if (structureCount >= 3) score += 12;
        else if (structureCount >= 2) score += 8;
        else if (structureCount >= 1) score += 4;
        else suggestions.push('Add structured content (lists, tables, FAQ) for better AI extraction');

        // 8. Speakable content markers
        const hasShortAnswers = (content.match(/<p[^>]*>[^<]{40,180}<\/p>/gi) || []).length;
        if (hasShortAnswers >= 5) score += 7;
        else if (hasShortAnswers >= 2) score += 4;

        // 9. Video embeds — AI Overviews frequently cite video content
        const hasVideoEmbed = content.includes('youtube.com/embed') || content.includes('<video');
        const videoEmbedCount = (content.match(/youtube\.com\/embed/gi) || []).length;
        if (videoEmbedCount >= 2) {
            score += 8;
        } else if (hasVideoEmbed) {
            score += 5;
        } else {
            suggestions.push('Embed a relevant YouTube video — AI engines often cite video sources');
        }

        return { dimension: 'GEO', score: Math.min(score, maxScore), maxScore, issues, suggestions };
    }

    // AI-powered deep analysis (uses LLM for nuanced scoring)
    async deepAnalysis(
        content: string,
        keyword: string,
        competitorContents: string[]
    ): Promise<{ analysis: string; suggestions: string[] }> {
        const ai = getAIRouter();

        const prompt = `You are an expert SEO analyst. Analyze this content targeting the keyword "${keyword}".

Content to analyze:
${content.substring(0, 6000)}

Top competitor content summaries:
${competitorContents.map((c, i) => `Competitor ${i + 1}: ${c.substring(0, 800)}`).join('\n\n')}

Provide:
1. A brief analysis of strengths and weaknesses vs competitors
2. 5 specific actionable suggestions to improve rankings
3. Featured snippet optimization opportunities
4. AEO/AI Overview optimization opportunities

Format as JSON: { "analysis": "...", "suggestions": ["...", "..."] }`;

        const result = await ai.generate('content_scoring', prompt, {
            systemPrompt: 'You are an SEO expert. Always respond in valid JSON.',
            jsonMode: true,
            temperature: 0.3,
        });

        try {
            return JSON.parse(result);
        } catch {
            return { analysis: result, suggestions: [] };
        }
    }

    private countSyllables(word: string): number {
        word = word.toLowerCase().replace(/[^a-z]/g, '');
        if (word.length <= 3) return 1;
        const vowels = word.match(/[aeiouy]+/g);
        let count = vowels ? vowels.length : 1;
        if (word.endsWith('e')) count--;
        return Math.max(count, 1);
    }

    // ==========================================
    // 12. SERP-Correlated Scoring (TF-IDF + Topic Coverage)
    // ==========================================

    scoreSERPCorrelated(
        content: string,
        keyword: string,
        competitorContents: string[]
    ): ScoreDetail & { topicCoverage: number; missingTopics: string[]; serpTerms: string[] } {
        const maxScore = 100;
        const issues: string[] = [];
        const suggestions: string[] = [];

        // If no competitor content, return neutral score
        if (!competitorContents.length || competitorContents.every(c => !c || c.length < 100)) {
            return {
                dimension: 'SERP Correlation',
                score: 65, // Neutral when no competitor data
                maxScore,
                issues: ['No competitor content available for SERP correlation'],
                suggestions: ['Add competitor analysis to improve scoring accuracy'],
                topicCoverage: 0,
                missingTopics: [],
                serpTerms: [],
            };
        }

        // Step 1: Extract TF-IDF terms from competitor content
        const competitorTerms = this.extractTFIDFTerms(competitorContents);

        // Step 2: Check which terms appear in our content
        const contentLower = content.toLowerCase().replace(/<[^>]+>/g, ' ');
        const keywordLower = keyword.toLowerCase();

        let coveredCount = 0;
        const missingTopics: string[] = [];
        const coveredTopics: string[] = [];

        for (const term of competitorTerms) {
            if (contentLower.includes(term.term.toLowerCase())) {
                coveredCount++;
                coveredTopics.push(term.term);
            } else {
                missingTopics.push(term.term);
            }
        }

        const topicCoverage = competitorTerms.length > 0
            ? Math.round((coveredCount / competitorTerms.length) * 100)
            : 0;

        // Step 3: Calculate score
        let score = 0;

        // Topic coverage (0-50 points)
        score += Math.round(topicCoverage * 0.5);

        // Keyword in content check (5 points)
        if (contentLower.includes(keywordLower)) score += 5;

        // Content length vs competitor avg (0-15 points)
        const ourWordCount = contentLower.split(/\s+/).length;
        const competitorWordCounts = competitorContents.map(c =>
            c.replace(/<[^>]+>/g, ' ').split(/\s+/).length
        );
        const avgCompetitorWords = competitorWordCounts.reduce((a, b) => a + b, 0) / competitorWordCounts.length;
        const lengthRatio = ourWordCount / avgCompetitorWords;
        if (lengthRatio >= 1.2) score += 15;
        else if (lengthRatio >= 1.0) score += 12;
        else if (lengthRatio >= 0.8) score += 8;
        else score += 4;

        // Heading coverage — check if we cover competitor headings (0-15 points)
        const competitorHeadings = this.extractHeadingsFromAll(competitorContents);
        const ourHeadings = (content.match(/<h[2-3][^>]*>(.*?)<\/h[2-3]>/gi) || []).map(h =>
            h.replace(/<[^>]+>/g, '').toLowerCase().trim()
        );
        let headingOverlap = 0;
        for (const ch of competitorHeadings.slice(0, 10)) {
            const words = ch.split(/\s+/).filter(w => w.length > 3);
            if (words.some(w => ourHeadings.some(oh => oh.includes(w)))) {
                headingOverlap++;
            }
        }
        const headingCoverage = competitorHeadings.length > 0
            ? headingOverlap / Math.min(competitorHeadings.length, 10)
            : 0;
        score += Math.round(headingCoverage * 15);

        // Entity coverage (0-15 points)
        const entities = this.extractEntities(competitorContents);
        let entityCovered = 0;
        for (const entity of entities) {
            if (contentLower.includes(entity.toLowerCase())) entityCovered++;
        }
        const entityCoverage = entities.length > 0 ? entityCovered / entities.length : 0;
        score += Math.round(entityCoverage * 15);

        // Issues and suggestions
        if (topicCoverage < 50) {
            issues.push(`Low topic coverage: ${topicCoverage}% of competitor topics covered`);
        }
        if (lengthRatio < 0.8) {
            issues.push(`Content is ${Math.round((1 - lengthRatio) * 100)}% shorter than competitor average`);
        }
        if (missingTopics.length > 0) {
            suggestions.push(`Add coverage for: ${missingTopics.slice(0, 8).join(', ')}`);
        }
        if (headingCoverage < 0.5) {
            suggestions.push('Add more H2/H3 headings covering competitor topics');
        }
        if (entityCoverage < 0.5 && entities.length > 0) {
            const missing = entities.filter(e => !contentLower.includes(e.toLowerCase()));
            suggestions.push(`Mention these entities: ${missing.slice(0, 5).join(', ')}`);
        }

        return {
            dimension: 'SERP Correlation',
            score: Math.min(score, maxScore),
            maxScore,
            issues,
            suggestions,
            topicCoverage,
            missingTopics: missingTopics.slice(0, 20),
            serpTerms: competitorTerms.map(t => t.term).slice(0, 30),
        };
    }

    // TF-IDF term extraction from competitor pages
    private extractTFIDFTerms(documents: string[]): { term: string; score: number }[] {
        const STOP_WORDS = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
            'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
            'as', 'into', 'through', 'during', 'before', 'after', 'above',
            'below', 'between', 'out', 'off', 'over', 'under', 'again',
            'further', 'then', 'once', 'here', 'there', 'when', 'where',
            'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most',
            'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
            'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but',
            'and', 'or', 'if', 'while', 'about', 'up', 'its', 'it', 'this',
            'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you',
            'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
            'what', 'which', 'who', 'whom', 'also', 'get', 'make', 'like',
            'one', 'two', 'new', 'way', 'use', 'said', 'know', 'time',
        ]);

        // Count term frequency across all documents
        const docTermFreqs: Map<string, number>[] = [];
        const globalTermDocs = new Map<string, number>();

        for (const doc of documents) {
            const text = doc.replace(/<[^>]+>/g, ' ').toLowerCase();
            const words = text.match(/\b[a-z]{3,}\b/g) || [];
            const termFreq = new Map<string, number>();

            for (const word of words) {
                if (STOP_WORDS.has(word)) continue;
                termFreq.set(word, (termFreq.get(word) || 0) + 1);
            }

            // Also extract bigrams (2-word phrases)
            for (let i = 0; i < words.length - 1; i++) {
                if (STOP_WORDS.has(words[i]) || STOP_WORDS.has(words[i + 1])) continue;
                const bigram = `${words[i]} ${words[i + 1]}`;
                termFreq.set(bigram, (termFreq.get(bigram) || 0) + 1);
            }

            docTermFreqs.push(termFreq);

            // Track how many docs each term appears in
            for (const term of termFreq.keys()) {
                globalTermDocs.set(term, (globalTermDocs.get(term) || 0) + 1);
            }
        }

        // Calculate TF-IDF scores
        const N = documents.length;
        const termScores = new Map<string, number>();

        for (const docFreq of docTermFreqs) {
            for (const [term, freq] of docFreq.entries()) {
                const tf = 1 + Math.log(freq); // Log-normalized TF
                const df = globalTermDocs.get(term) || 1;
                // Terms appearing in MOST competitor docs are topically important
                // but we also need distinctiveness — use BM25-inspired hybrid:
                // High DF = important topic (commonality boost)
                // But pure commonality over-weights stopwords, so combine with IDF for balance
                const commonality = df / N; // How many competitors cover this term
                const idf = Math.log((N + 1) / (df + 0.5)); // Inverse doc frequency
                // Hybrid: boost terms that are both common across competitors AND topically relevant
                const tfidf = tf * (commonality * 0.6 + idf * 0.4);
                termScores.set(term, (termScores.get(term) || 0) + tfidf);
            }
        }

        // Sort by score, return top terms
        return Array.from(termScores.entries())
            .map(([term, score]) => ({ term, score }))
            .filter(t => t.score > 1.5) // Filter noise
            .sort((a, b) => b.score - a.score)
            .slice(0, 50);
    }

    // Extract common headings from competitor pages
    private extractHeadingsFromAll(documents: string[]): string[] {
        const headings: string[] = [];
        for (const doc of documents) {
            const matches = doc.match(/<h[2-3][^>]*>(.*?)<\/h[2-3]>/gi) || [];
            for (const m of matches) {
                headings.push(m.replace(/<[^>]+>/g, '').toLowerCase().trim());
            }
        }
        // Deduplicate similar headings
        const unique: string[] = [];
        for (const h of headings) {
            if (!unique.some(u => u.includes(h) || h.includes(u))) {
                unique.push(h);
            }
        }
        return unique;
    }

    // Extract named entities (capitalized phrases) from competitor content
    private extractEntities(documents: string[]): string[] {
        const entityCounts = new Map<string, number>();
        for (const doc of documents) {
            const text = doc.replace(/<[^>]+>/g, ' ');
            // Match capitalized words/phrases (2+ chars, not at sentence start)
            const matches = text.match(/(?<=[.!?]\s+|,\s+|;\s+|:\s+|-\s+)[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
            for (const m of matches) {
                if (m.length > 2) {
                    entityCounts.set(m, (entityCounts.get(m) || 0) + 1);
                }
            }
        }
        return Array.from(entityCounts.entries())
            .filter(([, count]) => count >= 2) // Appears in multiple docs
            .sort((a, b) => b[1] - a[1])
            .map(([entity]) => entity)
            .slice(0, 15);
    }

    // ==========================================
    // AI-Powered NLP Entity Extraction (Gap 6)
    // Uses AI to extract named entities, topics, and concepts
    // ==========================================
    async extractEntitiesWithNLP(content: string, keyword: string): Promise<{
        entities: { name: string; type: string; relevance: number }[];
        topicCoverage: number;
        missingTopics: string[];
    }> {
        try {
            const ai = getAIRouter();
            const textSample = content.replace(/<[^>]*>/g, ' ').slice(0, 6000); // CT-1 FIX: increased from 3000

            const prompt = `Analyze this content for the keyword "${keyword}". Extract:
1. Named entities (people, organizations, products, locations, concepts)
2. Topic coverage score (0-100) — how well does the content cover the topic?
3. Missing topics that should be covered for comprehensive coverage

Content:
${textSample}

Respond with JSON:
{
  "entities": [{ "name": "entity name", "type": "person|org|product|concept|location|event", "relevance": 0.0-1.0 }],
  "topicCoverage": 75,
  "missingTopics": ["topic1", "topic2"]
}`;

            const result = await ai.generate('content_scoring', prompt, {
                systemPrompt: 'You are an NLP entity extraction expert. Extract entities accurately. Always respond with valid JSON.',
                jsonMode: true,
                temperature: 0.3,
            });

            const parsed = JSON.parse(result);
            return {
                entities: (parsed.entities || []).slice(0, 20),
                topicCoverage: parsed.topicCoverage || 0,
                missingTopics: (parsed.missingTopics || []).slice(0, 10),
            };
        } catch {
            return { entities: [], topicCoverage: 0, missingTopics: [] };
        }
    }

    // ── 13. Passage-Level Quality (#50) ────────────────────────────
    // Scores how well individual passages can rank independently
    private scorePassageQuality(content: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const plainContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        // Extract paragraphs
        const paragraphs = content.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
        const h2Sections = content.split(/<h2[^>]*>/gi);

        // Check: self-contained opening paragraphs after H2s
        let selfContainedCount = 0;
        let totalH2Paras = 0;

        for (let i = 1; i < h2Sections.length; i++) { // Skip content before first H2
            const firstPara = h2Sections[i].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
            if (!firstPara) continue;

            totalH2Paras++;
            const paraText = firstPara[1].replace(/<[^>]+>/g, '').trim();
            const words = paraText.split(/\s+/).length;
            const startsWithAnaphora = /^(this|these|that|those|it|they|such|as mentioned|as discussed)\b/i.test(paraText);

            if (words >= 30 && words <= 70 && !startsWithAnaphora) {
                selfContainedCount++;
            }
        }

        // Score self-contained paragraphs (0-40)
        if (totalH2Paras > 0) {
            const ratio = selfContainedCount / totalH2Paras;
            score += Math.round(ratio * 40);
            if (ratio < 0.5) {
                issues.push(`Only ${selfContainedCount}/${totalH2Paras} H2 sections have self-contained opening paragraphs`);
                suggestions.push('Rewrite opening paragraphs to be 40-60 words, self-contained, no anaphoric references');
            }
        } else {
            score += 20; // Default if no H2s found
        }

        // Check: No consecutive paragraphs starting with same word (0-20)
        let sameStartCount = 0;
        for (let i = 1; i < paragraphs.length; i++) {
            const prev = paragraphs[i - 1].replace(/<[^>]+>/g, '').trim().split(/\s+/)[0]?.toLowerCase();
            const curr = paragraphs[i].replace(/<[^>]+>/g, '').trim().split(/\s+/)[0]?.toLowerCase();
            if (prev && curr && prev === curr) sameStartCount++;
        }
        const uniqueStartsScore = Math.max(0, 20 - sameStartCount * 4);
        score += uniqueStartsScore;
        if (sameStartCount > 2) {
            issues.push(`${sameStartCount} consecutive paragraphs start with the same word`);
            suggestions.push('Vary paragraph openings for better passage diversity');
        }

        // Check: Active voice prevalence (0-20)
        const passivePatterns = plainContent.match(/\b(is|are|was|were|been|being)\s+(being\s+)?\w+ed\b/gi) || [];
        const passiveRatio = plainContent.split(/\s+/).length > 0
            ? passivePatterns.length / (plainContent.split(/\s+/).length / 100)
            : 0;
        const activeScore = Math.max(0, 20 - Math.round(passiveRatio * 5));
        score += activeScore;
        if (passiveRatio > 2) {
            issues.push(`High passive voice usage (${passivePatterns.length} instances)`);
            suggestions.push('Convert passive constructions to active voice for clearer passages');
        }

        // Check: Paragraph length variation (0-20)
        const paraLengths = paragraphs.map(p => p.replace(/<[^>]+>/g, '').split(/\s+/).length);
        if (paraLengths.length >= 3) {
            const stdDev = this.calculateStdDev(paraLengths);
            const variationScore = Math.min(20, Math.round(stdDev / 2));
            score += variationScore;
            if (stdDev < 5) {
                suggestions.push('Vary paragraph lengths more — mix short (2-3 sentences) with longer (4-5 sentences)');
            }
        } else {
            score += 10;
        }

        return {
            dimension: 'Passage Quality',
            score: Math.min(100, score),
            maxScore: 100,
            issues,
            suggestions,
        };
    }

    // ── 14. Entity Saturation (#51) ────────────────────────────────
    // Scores named entity coverage and proper references
    private scoreEntitySaturation(content: string, keyword: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const plainContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const wordCount = plainContent.split(/\s+/).length;

        // Count named entities (proper nouns, organization names, etc.)
        const namedEntities = plainContent.match(
            /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g
        ) || [];
        // De-duplicate
        const uniqueEntities = new Set(namedEntities.filter(e => e.length > 3));
        const entityDensity = wordCount > 0 ? (uniqueEntities.size / wordCount) * 1000 : 0;

        // Entity count score (0-30) — target: 5+ per 1000 words
        const entityCountScore = Math.min(30, Math.round(entityDensity * 6));
        score += entityCountScore;
        if (uniqueEntities.size < 5) {
            issues.push(`Only ${uniqueEntities.size} unique entities found`);
            suggestions.push('Add named references to people, organizations, products, and technologies');
        }

        // "Is-a" definition count (0-25) — target: 3+ definitions
        const definitionPatterns = plainContent.match(
            /\b[\w\s]+ (?:is|are|refers to|can be defined as) (?:a|an|the) [\w\s]+/gi
        ) || [];
        const defScore = Math.min(25, definitionPatterns.length * 8);
        score += defScore;
        if (definitionPatterns.length < 2) {
            issues.push(`Only ${definitionPatterns.length} "is-a" definitions found`);
            suggestions.push('Add clear definitions: "[Term] is [definition]" for key concepts');
        }

        // Expert/authority references (0-25) — target: 2+ expert quotes
        const expertPatterns = plainContent.match(
            /(?:CEO|CTO|Director|Professor|Dr\.|Head of|Chief|Founder|Analyst|Expert|Researcher)\s/gi
        ) || [];
        const expertScore = Math.min(25, expertPatterns.length * 8);
        score += expertScore;
        if (expertPatterns.length < 2) {
            suggestions.push('Add expert references with titles and organizations for EEAT signals');
        }

        // Keyword entity prominence (0-20) — keyword mentioned in entity context
        const keywordInEntity = plainContent.match(
            new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
        ) || [];
        const prominenceScore = Math.min(20, keywordInEntity.length * 3);
        score += prominenceScore;

        return {
            dimension: 'Entity Saturation',
            score: Math.min(100, score),
            maxScore: 100,
            issues,
            suggestions,
        };
    }

    // ── 15. GEO Citation Density (#52) ─────────────────────────────
    // Scores how well claims are attributed for AI engine extraction
    private scoreCitationDensity(content: string): ScoreDetail {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let score = 0;
        const plainContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const wordCount = plainContent.split(/\s+/).length;

        // Count attribution patterns
        const attributionPatterns = [
            /according to [\w\s]+/gi,
            /research (?:from|by|published in) [\w\s]+/gi,
            /(?:a|the) \d{4} (?:study|report|survey|analysis)/gi,
            /[\w\s]+ (?:found|shows?|reveals?|indicates?|suggests?|reports?) that/gi,
            /\([\w\s,]+,?\s*\d{4}\)/g,  // Inline citations
            /data from [\w\s]+/gi,
        ];

        let totalAttributions = 0;
        for (const pattern of attributionPatterns) {
            const matches = plainContent.match(pattern);
            if (matches) totalAttributions += matches.length;
        }

        // Citation density per 1000 words
        const densityPer1000 = wordCount > 0 ? (totalAttributions / wordCount) * 1000 : 0;

        // Density score (0-35) — target: 2.5+ per 1000 words
        const densityScore = Math.min(35, Math.round(densityPer1000 * 14));
        score += densityScore;
        if (densityPer1000 < 1.5) {
            issues.push(`Low citation density: ${densityPer1000.toFixed(1)} per 1000 words (target: 2.5+)`);
            suggestions.push('Add inline attributions: "Research from [Source] shows..."');
        }

        // Year recency in citations (0-20) — recent data preferred
        const currentYear = new Date().getFullYear();
        const recentYears = plainContent.match(
            new RegExp(`\\b(${currentYear}|${currentYear - 1})\\b`, 'g')
        ) || [];
        const recencyScore = Math.min(20, recentYears.length * 5);
        score += recencyScore;
        if (recentYears.length < 2) {
            suggestions.push(`Add recent ${currentYear}/${currentYear - 1} data references for freshness signals`);
        }

        // Diversity of attribution styles (0-20)
        let stylesUsed = 0;
        for (const pattern of attributionPatterns) {
            if (pattern.test(plainContent)) stylesUsed++;
        }
        const diversityScore = Math.min(20, stylesUsed * 5);
        score += diversityScore;
        if (stylesUsed < 3) {
            suggestions.push('Vary citation styles: parenthetical, inline, "according to", "data from"');
        }

        // Orphaned stats check (0-25) — statistics without attribution
        const statPatterns = plainContent.match(/\d+(?:\.\d+)?%/g) || [];
        const attributedStats = plainContent.match(/\d+(?:\.\d+)?%[^.]*(?:according|source|study|report|research|\(\w)/gi) || [];
        const orphanedStats = statPatterns.length - attributedStats.length;
        const orphanScore = Math.max(0, 25 - orphanedStats * 5);
        score += orphanScore;
        if (orphanedStats > 2) {
            issues.push(`${orphanedStats} statistics without attribution`);
            suggestions.push('Add source citations to all percentage/number claims');
        }

        return {
            dimension: 'Citation Density',
            score: Math.min(100, score),
            maxScore: 100,
            issues,
            suggestions,
        };
    }

    // Helper: Standard deviation for length variation scoring
    private calculateStdDev(values: number[]): number {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
    }

    // ── 16. Format Diversity Scoring ──────────────────────────────
    // Measures visual variety: callouts, pull quotes, stat highlights, etc.
    private scoreFormatDiversity(content: string): ScoreDetail {
        let score = 0;
        const issues: string[] = [];
        const suggestions: string[] = [];

        // Count each rich format type
        const formats: Record<string, number> = {
            callouts: (content.match(/class="callout-(?:tip|warning|info|note)/gi) || []).length,
            pullQuotes: (content.match(/class="pull-quote/gi) || []).length,
            statHighlights: (content.match(/class="stat-highlight/gi) || []).length,
            definitionLists: (content.match(/<dl/gi) || []).length,
            codeBlocks: (content.match(/class="code-block-wrapper/gi) || []).length,
            accordions: (content.match(/class="accordion-faq/gi) || []).length,
            footnotes: (content.match(/class="footnotes-section/gi) || []).length,
            responsiveTables: (content.match(/class="responsive-table-wrapper/gi) || []).length,
            nestedLists: (content.match(/<[ou]l[^>]*>\s*<li[^>]*>[\s\S]*?<[ou]l/gi) || []).length,
            semanticElements: (content.match(/<(?:figure|aside|abbr|time|mark)\b/gi) || []).length,
        };

        const activeTypes = Object.entries(formats).filter(([, count]) => count > 0);
        const activeCount = activeTypes.length;

        // Scoring: 10 points per active format type, up to 100
        // Bonus: callouts get extra weight (they're the highest-impact element)
        score += Math.min(activeCount * 12, 60); // Up to 60 for variety

        // Callouts (high impact)
        if (formats.callouts >= 2) score += 15;
        else if (formats.callouts >= 1) score += 8;
        else { issues.push('No callout boxes found'); suggestions.push('Add 2+ callout boxes (tip, warning, note, info) for visual breaks'); }

        // Pull quotes or stat highlights (engagement elements)
        if (formats.pullQuotes >= 1 || formats.statHighlights >= 1) score += 10;
        else { suggestions.push('Add a pull quote or stat highlight for visual engagement'); }

        // Accordion FAQ
        if (formats.accordions >= 1) score += 10;

        // Responsive tables
        if (formats.responsiveTables >= 1) score += 5;

        score = Math.min(score, 100);

        // Generate issues for missing elements
        if (activeCount < 3) {
            issues.push(`Only ${activeCount} format types used — articles look flat without visual variety`);
        }
        if (activeCount < 5) {
            suggestions.push(`Using ${activeCount}/10 format types. Target: 5+ for rich visual diversity.`);
        }

        return {
            dimension: 'Format Diversity',
            score: Math.min(score, 100),
            maxScore: 100,
            issues,
            suggestions,
        };
    }
}

export const getContentScorer = createSingleton(() => new ContentScorer());
