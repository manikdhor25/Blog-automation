// ============================================================
// Content Writer — Schema Markup Generation & Validation
// Extracted from ContentWriter class for modularity
// ============================================================

import { GeneratedContent } from './content-utils';
import { VideoMeta } from './media-engine';
import type { EntitySchemaItem } from './entity-optimizer';

// ── Extended Schema Options ────────────────────────────────────
export interface SchemaOptions {
    /** ISO date string for when content was last modified (#31) */
    lastModified?: string;
    /** Site URL for canonical/breadcrumb links */
    siteUrl?: string;
    /** Article slug for breadcrumb generation (#66) */
    slug?: string;
    /** Site/publisher name */
    siteName?: string;
    /** Category for breadcrumb (#66) */
    category?: string;
    /** Author name override */
    authorName?: string;
    /** Author URL for sameAs */
    authorUrl?: string;
    /** Entity mentions for SameAs schema (#47) */
    entityMentions?: EntitySchemaItem[];
}

// Generate comprehensive schema markup (7+ types including Product/Review + VideoObject)
export function generateSchemaMarkup(
    content: GeneratedContent,
    keyword: string,
    videoMetas?: VideoMeta[],
    options?: SchemaOptions
): Record<string, unknown> {
    const schemas: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    // #31: Use provided lastModified date or fall back to current time
    const dateModified = options?.lastModified || now;
    const htmlContent = content.content || '';
    const siteUrl = options?.siteUrl || '';
    const siteName = options?.siteName || 'RankMaster Pro';
    const authorName = options?.authorName || 'Editorial Team';

    // Extract hero image URL from resolved content (if available)
    const heroImageMatch = htmlContent.match(/<figure class="article-image article-hero-image">\s*<img src="([^"]+)"/);
    const heroImageUrl = heroImageMatch ? heroImageMatch[1] : '';

    // 1. BlogPosting schema (fully specified for rich results eligibility)
    schemas.push({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: content.title,
        description: content.metaDescription,
        keywords: keyword,
        datePublished: now,
        dateModified: dateModified,  // #31: actual edit time
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': options?.slug ? `${siteUrl}/${options.slug}` : '#article',
        },
        author: {
            '@type': 'Person',
            name: authorName,
            ...(options?.authorUrl ? { url: options.authorUrl } : {}),
        },
        publisher: {
            '@type': 'Organization',
            name: siteName,
        },
        image: heroImageUrl
            ? {
                '@type': 'ImageObject',
                url: heroImageUrl,
                // #62: Enhanced image schema
                caption: `${keyword} - featured image`,
              }
            : undefined,
        wordCount: htmlContent.replace(/<[^>]+>/g, '').split(/\s+/).length,
        articleSection: keyword,
        // #47: Entity mentions with SameAs links
        ...(options?.entityMentions && options.entityMentions.length > 0 ? {
            mentions: options.entityMentions.map(e => ({
                '@type': e['@type'],
                name: e.name,
                ...(e.sameAs ? { sameAs: e.sameAs } : {}),
                ...(e.description ? { description: e.description } : {}),
            })),
        } : {}),
    });

    // 2. FAQPage schema
    if (content.faqSection && content.faqSection.length > 0) {
        schemas.push({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: content.faqSection.map(faq => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: faq.answer,
                },
            })),
        });
    }

    // 3. HowTo schema — auto-detect from ordered lists with step-like headings
    const hasHowToSignals = /how to|step.by.step|steps to|guide to/i.test(content.title) ||
        (htmlContent.includes('<ol') && /step\s*\d|step\s*:/i.test(htmlContent));
    if (hasHowToSignals) {
        const steps: { '@type': string; name: string; text: string }[] = [];
        const stepRegex = /<li[^>]*>(.*?)<\/li>/gi;
        const olContent = htmlContent.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
        if (olContent) {
            let match;
            let position = 1;
            while ((match = stepRegex.exec(olContent[1])) !== null && position <= 10) {
                const stepText = match[1].replace(/<[^>]+>/g, '').trim();
                if (stepText.length > 10) {
                    steps.push({
                        '@type': 'HowToStep',
                        name: `Step ${position}`,
                        text: stepText,
                    });
                    position++;
                }
            }
        }
        if (steps.length >= 2) {
            schemas.push({
                '@context': 'https://schema.org',
                '@type': 'HowTo',
                name: content.title,
                description: content.metaDescription,
                step: steps,
            });
        }
    }

    // 4. ItemList schema — auto-detect listicle articles
    const isListicle = /\b(top|best|\d+)\s+/i.test(content.title) &&
        (htmlContent.match(/<h[23][^>]*>/gi) || []).length >= 5;
    if (isListicle) {
        const headings = htmlContent.match(/<h[23][^>]*>(.*?)<\/h[23]>/gi) || [];
        const items = headings.slice(0, 15).map((h, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: h.replace(/<[^>]+>/g, '').trim(),
        }));
        if (items.length >= 3) {
            schemas.push({
                '@context': 'https://schema.org',
                '@type': 'ItemList',
                name: content.title,
                itemListElement: items,
            });
        }
    }

    // 5. BreadcrumbList schema (#66 — dynamic from slug/category)
    const breadcrumbItems: { '@type': string; position: number; name: string; item?: string }[] = [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl || '/' },
    ];
    if (options?.category) {
        breadcrumbItems.push({
            '@type': 'ListItem',
            position: 2,
            name: options.category,
            item: `${siteUrl}/${options.category.toLowerCase().replace(/\s+/g, '-')}`,
        });
        breadcrumbItems.push({
            '@type': 'ListItem',
            position: 3,
            name: content.title,
        });
    } else {
        breadcrumbItems.push(
            { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl}/blog` },
            { '@type': 'ListItem', position: 3, name: content.title },
        );
    }
    schemas.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems,
    });

    // 6. SpeakableSpecification — for voice/AI assistant extraction (#19 enhanced)
    const firstParagraph = htmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const speakableTexts: string[] = [];
    if (firstParagraph) {
        speakableTexts.push(firstParagraph[1].replace(/<[^>]+>/g, '').trim());
    }
    // Also grab key-takeaways text if present
    const keyTakeaways = htmlContent.match(/<div class="key-takeaways">([\s\S]*?)<\/div>/i);
    if (keyTakeaways) {
        speakableTexts.push(keyTakeaways[1].replace(/<[^>]+>/g, '').trim().substring(0, 500));
    }
    if (content.faqSection && content.faqSection.length > 0) {
        speakableTexts.push(
            ...content.faqSection.slice(0, 3).map(f => `${f.question} ${f.answer}`)
        );
    }
    if (speakableTexts.length > 0) {
        schemas.push({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            speakable: {
                '@type': 'SpeakableSpecification',
                // #19: Updated selectors to match actual generated HTML structure
                cssSelector: [
                    '.article-intro',
                    '.key-takeaways',
                    '.faq-answer',
                    'h2 + p',           // First paragraph after each H2 (direct answer)
                    '.table-of-contents',
                ],
            },
        });
    }

    // 7. Product/Review schema — auto-detect commercial/review content (#8)
    const isCommercial = /best|top|review|vs|compare|alternative|price|buy/i.test(keyword);
    const lowerContent = htmlContent.toLowerCase();
    const hasProsConsSignals = lowerContent.includes('pros') && lowerContent.includes('cons');
    const hasRatingSignals = lowerContent.includes('rating') || lowerContent.includes('score') || lowerContent.includes('out of');

    if (isCommercial && (hasProsConsSignals || hasRatingSignals)) {
        schemas.push({
            '@context': 'https://schema.org',
            '@type': 'Review',
            name: content.title,
            reviewBody: content.metaDescription,
            author: { '@type': 'Person', name: 'Editorial Team' },
            datePublished: now,
            itemReviewed: {
                '@type': 'Thing',
                name: keyword,
            },
        });
    }

    // 8. VideoObject schema — from embedded YouTube videos
    if (videoMetas && videoMetas.length > 0) {
        for (const video of videoMetas) {
            schemas.push({
                '@context': 'https://schema.org',
                '@type': 'VideoObject',
                name: video.title,
                description: video.description,
                thumbnailUrl: video.thumbnailUrl,
                uploadDate: video.publishedAt,
                duration: video.duration,
                embedUrl: video.embedUrl,
                contentUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
                publisher: {
                    '@type': 'Organization',
                    name: video.channelName,
                    url: video.channelUrl,
                },
            });
        }
    }

    // 9. DefinedTerm schema — auto-detect definition content (#17)
    const isDefinitionArticle = /\b(what is|what are|definition of|meaning of)\b/i.test(keyword);
    const definitionMatch = htmlContent.match(/<p[^>]*>([^<]*?\bis\b[^<]*?(?:a|an|the)\s[^<]{20,200})\.?<\/p>/i);
    if (isDefinitionArticle && definitionMatch) {
        schemas.push({
            '@context': 'https://schema.org',
            '@type': 'DefinedTerm',
            name: keyword.replace(/\b(what is|what are|definition of|meaning of)\b/i, '').trim(),
            description: definitionMatch[1].replace(/<[^>]+>/g, '').trim(),
            inDefinedTermSet: {
                '@type': 'DefinedTermSet',
                name: options?.category || 'General Knowledge',
            },
        });
    }

    // 10. ClaimReview schema — for fact-check / myth-busting content (#18)
    const isFactCheck = /\b(myth|fact.check|debunk|is it true|truth about)\b/i.test(keyword)
        || /\b(myth|fact|debunk|truth)\b/i.test(content.title);
    if (isFactCheck) {
        // Extract the first claim-like pattern from content
        const claimMatch = htmlContent.match(/<h[23][^>]*>([^<]*(?:myth|claim|fact)[^<]*)<\/h[23]>/i);
        if (claimMatch) {
            schemas.push({
                '@context': 'https://schema.org',
                '@type': 'ClaimReview',
                claimReviewed: claimMatch[1].replace(/<[^>]+>/g, '').trim(),
                reviewRating: {
                    '@type': 'Rating',
                    ratingValue: 'mixed',
                    bestRating: 'true',
                    worstRating: 'false',
                    alternateName: 'Partly true',
                },
                author: {
                    '@type': 'Organization',
                    name: siteName,
                },
                datePublished: now,
            });
        }
    }

    return validateSchemaMarkup({ '@graph': schemas });
}

// ── Schema Validation ──────────────────────────────────────────
// Validates and sanitizes JSON-LD schema before publishing.
// Removes invalid entries, fixes empty fields, and logs warnings.
export function validateSchemaMarkup(
    schema: Record<string, unknown>
): Record<string, unknown> {
    const graph = schema['@graph'] as Record<string, unknown>[];
    if (!Array.isArray(graph)) return schema;

    const validated: Record<string, unknown>[] = [];
    const warnings: string[] = [];

    for (const entry of graph) {
        const type = entry['@type'] as string;
        if (!type) {
            warnings.push('Schema entry missing @type — removed');
            continue;
        }

        // Validate FAQPage: remove entries with empty answers
        if (type === 'FAQPage') {
            const mainEntity = entry.mainEntity as Record<string, unknown>[];
            if (Array.isArray(mainEntity)) {
                const validFAQs = mainEntity.filter(q => {
                    const answer = (q.acceptedAnswer as Record<string, unknown>)?.text;
                    return answer && String(answer).trim().length > 0;
                });
                if (validFAQs.length === 0) {
                    warnings.push('FAQPage: all answers empty — removed schema');
                    continue;
                }
                entry.mainEntity = validFAQs;
            }
        }

        // Validate BlogPosting: must have headline
        if (type === 'BlogPosting') {
            if (!entry.headline || String(entry.headline).trim().length === 0) {
                warnings.push('BlogPosting: missing headline — removed');
                continue;
            }
            // Ensure wordCount is a positive number
            if (typeof entry.wordCount === 'number' && entry.wordCount < 50) {
                warnings.push(`BlogPosting: suspiciously low wordCount (${entry.wordCount})`);
            }
        }

        // Validate HowTo: must have at least 2 steps
        if (type === 'HowTo') {
            const steps = entry.step as unknown[];
            if (!Array.isArray(steps) || steps.length < 2) {
                warnings.push('HowTo: fewer than 2 steps — removed');
                continue;
            }
        }

        // Validate ItemList: must have at least 3 items
        if (type === 'ItemList') {
            const items = entry.itemListElement as unknown[];
            if (!Array.isArray(items) || items.length < 3) {
                warnings.push('ItemList: fewer than 3 items — removed');
                continue;
            }
        }

        // Validate Review: must have itemReviewed
        if (type === 'Review') {
            if (!entry.itemReviewed) {
                warnings.push('Review: missing itemReviewed — removed');
                continue;
            }
        }

        validated.push(entry);
    }

    if (warnings.length > 0) {
        console.warn(`[SchemaValidation] ${warnings.length} issue(s):\n  ${warnings.join('\n  ')}`);
    }

    return { '@graph': validated };
}
