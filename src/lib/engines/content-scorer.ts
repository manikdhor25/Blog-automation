// ============================================================
// RankMaster Pro - 10-Dimension Content Scoring Engine
// ============================================================

import { ContentScore, ScoreDetail } from '../types';
import { getAIRouter } from '../ai/router';
import { createSingleton } from '../singleton';

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
            topicCoverage: (serpCorrelation as unknown as { topicCoverage?: number }).topicCoverage || 0,
            missingTopics: (serpCorrelation as unknown as { missingTopics?: string[] }).missingTopics || [],
            overall: 0,
            details,
        };

        // Weighted average — 12 dimensions (SERP correlation added)
        scores.overall = Math.round(
            scores.seo * 0.09 +
            scores.aeo * 0.10 +
            scores.eeat * 0.12 +
            scores.readability * 0.06 +
            scores.snippet * 0.08 +
            scores.schema * 0.08 +
            scores.links * 0.08 +
            scores.freshness * 0.05 +
            scores.depth * 0.06 +
            scores.intent * 0.05 +
            scores.geo * 0.10 +
            scores.serpCorrelation * 0.13
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

        // Keyword density (0.5-1.5% ideal — above 1.5% risks over-optimization penalties)
        // Use plain text (HTML stripped) for accurate density calculation
        const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;
        const keywordCount = (plainLower.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        const density = (keywordCount / wordCount) * 100;

        if (density >= 0.5 && density <= 1.5) {
            score += 15;
        } else if (density < 0.5) {
            issues.push(`Keyword density too low (${density.toFixed(1)}%)`);
            suggestions.push('Use keyword more naturally throughout the content');
        } else if (density <= 2.5) {
            score += 8; // Slightly above ideal — not penalized but not optimal
            suggestions.push(`Keyword density (${density.toFixed(1)}%) is slightly high — aim for 0.5-1.5%`);
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

        const avgSentenceLength = words.length / Math.max(sentences.length, 1);
        const avgSyllablesPerWord = syllables / Math.max(words.length, 1);

        // Flesch Reading Ease
        const fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

        // Detect intent type from keyword for target calibration
        const lowerKeyword = (keyword || '').toLowerCase();
        const isCommercial = /best|top|review|vs|compare|alternative/i.test(lowerKeyword);
        const isTechnical = /api|code|algorithm|implementation|architecture|config/i.test(lowerKeyword);

        let targetMin: number, targetMax: number, audienceLabel: string;
        if (isTechnical) {
            targetMin = 40; targetMax = 55; audienceLabel = 'technical audience (Flesch 40-55)';
        } else if (isCommercial) {
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
        const transitions = (text.match(/\b(however|therefore|furthermore|moreover|additionally|meanwhile|consequently|alternatively|specifically|for example|in contrast|as a result)\b/gi) || []).length;
        if (transitions >= 5) score = Math.min(score + 5, maxScore);

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

        const lowerKeyword = keyword.toLowerCase();

        // Detect intent type
        const isInformational = /^(what|how|why|when|where|who|guide|tutorial|tips|learn)/i.test(lowerKeyword);
        const isCommercial = /best|top|review|vs|compare|alternative/i.test(lowerKeyword);
        const isTransactional = /buy|price|deal|discount|coupon|cheap|order/i.test(lowerKeyword);

        if (isInformational) {
            // Should have educational content, definitions, examples
            if (content.toLowerCase().includes('example') || content.toLowerCase().includes('for instance')) score += 15;
            if (content.match(/<h[2-3][^>]*>[^<]*\?[^<]*<\/h[2-3]>/gi)) score += 15;
            if (content.includes('<ol') || content.includes('<ul')) score += 10;
            if ((content.match(/<h[2-6][^>]*>/gi) || []).length >= 5) score += 10;
        } else if (isCommercial) {
            // Should have comparisons, pros/cons, ratings
            if (content.includes('<table')) score += 15;
            if (content.toLowerCase().includes('pros') || content.toLowerCase().includes('cons')) score += 15;
            if (content.toLowerCase().includes('recommend') || content.toLowerCase().includes('winner')) score += 10;
            if (content.toLowerCase().includes('price') || content.toLowerCase().includes('cost')) score += 10;
        } else if (isTransactional) {
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
${content.substring(0, 3000)}

Top competitor content summaries:
${competitorContents.map((c, i) => `Competitor ${i + 1}: ${c.substring(0, 500)}`).join('\n\n')}

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
            const textSample = content.replace(/<[^>]*>/g, ' ').slice(0, 3000);

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
}

export const getContentScorer = createSingleton(() => new ContentScorer());
