// ============================================================
// Content Writer — Schema Markup Generation & Validation
// Extracted from ContentWriter class for modularity
// ============================================================

import { GeneratedContent } from './content-utils';
import { VideoMeta } from './media-engine';

// Generate comprehensive schema markup (7+ types including Product/Review + VideoObject)
export function generateSchemaMarkup(
    content: GeneratedContent,
    keyword: string,
    videoMetas?: VideoMeta[]
): Record<string, unknown> {
    const schemas: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    const htmlContent = content.content || '';

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
        dateModified: now,
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': '#article',
        },
        author: {
            '@type': 'Person',
            name: 'Editorial Team',
        },
        publisher: {
            '@type': 'Organization',
            name: 'RankMaster Pro',
        },
        image: heroImageUrl
            ? { '@type': 'ImageObject', url: heroImageUrl }
            : undefined,
        wordCount: htmlContent.replace(/<[^>]+>/g, '').split(/\s+/).length,
        articleSection: keyword,
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

    // 5. BreadcrumbList schema
    schemas.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: '/blog' },
            { '@type': 'ListItem', position: 3, name: content.title },
        ],
    });

    // 6. SpeakableSpecification — for voice/AI assistant extraction
    const firstParagraph = htmlContent.match(/<p[^>]*>(.*?)<\/p>/i);
    const speakableTexts: string[] = [];
    if (firstParagraph) {
        speakableTexts.push(firstParagraph[1].replace(/<[^>]+>/g, '').trim());
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
                cssSelector: ['.article-intro', '.faq-answer'],
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
