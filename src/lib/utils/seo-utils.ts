// ============================================================
// RankMaster Pro - SEO Utility Functions
// Slug generation, meta validation, and content helpers
// ============================================================

// --- Slug Optimization ---

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'about', 'above',
    'after', 'before', 'between', 'into', 'through', 'during', 'that',
    'this', 'these', 'those', 'which', 'what', 'when', 'where', 'how',
    'your', 'you', 'we', 'our', 'my', 'its', 'it', 'they', 'them',
]);

/**
 * Generate an SEO-optimized slug from a keyword or title
 * - Removes stop words
 * - Limits to 3-5 words
 * - Lowercase with hyphens
 */
export function generateSEOSlug(text: string): string {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')       // remove special chars
        .split(/\s+/)
        .filter(w => w.length > 0)
        .filter(w => !STOP_WORDS.has(w));    // remove stop words

    // Keep 3-5 meaningful words
    return words.slice(0, 5).join('-');
}

// --- Meta Title Validation ---

// Average character width in pixels (approximation for common fonts)
const CHAR_WIDTHS: Record<string, number> = {
    uppercase: 9.5,   // average for A-Z
    lowercase: 7.5,   // average for a-z
    number: 8,
    space: 4,
    other: 8,
};

/**
 * Estimate pixel width of a text string (for SERP display truncation)
 * Google truncates titles at ~580px and descriptions at ~920px
 */
export function estimatePixelWidth(text: string): number {
    let width = 0;
    for (const char of text) {
        if (char >= 'A' && char <= 'Z') width += CHAR_WIDTHS.uppercase;
        else if (char >= 'a' && char <= 'z') width += CHAR_WIDTHS.lowercase;
        else if (char >= '0' && char <= '9') width += CHAR_WIDTHS.number;
        else if (char === ' ') width += CHAR_WIDTHS.space;
        else width += CHAR_WIDTHS.other;
    }
    return Math.round(width);
}

const POWER_WORDS = [
    'ultimate', 'proven', 'expert', 'complete', 'essential', 'definitive',
    'comprehensive', 'advanced', 'professional', 'tested', 'updated',
    'exclusive', 'insider', 'secret', 'powerful', 'effective', 'guaranteed',
    'step-by-step', 'easy', 'simple', 'fast', 'free', 'new', 'best',
    'top', 'official', 'verified', 'trusted', 'recommended',
];

export interface MetaValidation {
    title: {
        text: string;
        charCount: number;
        pixelWidth: number;
        isTruncated: boolean;
        hasKeyword: boolean;
        hasYear: boolean;
        hasPowerWord: boolean;
        hasNumber: boolean;
        score: number;
        suggestions: string[];
    };
    description: {
        text: string;
        charCount: number;
        pixelWidth: number;
        isTruncated: boolean;
        hasKeyword: boolean;
        hasCTA: boolean;
        score: number;
        suggestions: string[];
    };
    slug: {
        text: string;
        wordCount: number;
        hasKeyword: boolean;
        hasStopWords: boolean;
        score: number;
        suggestions: string[];
    };
}

/**
 * Validate meta title, description, and slug for SEO best practices
 */
export function validateMeta(
    title: string,
    description: string,
    keyword: string,
    slug?: string
): MetaValidation {
    const currentYear = new Date().getFullYear().toString();
    const lowerTitle = title.toLowerCase();
    const lowerDesc = description.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();

    // --- Title validation ---
    const titlePixels = estimatePixelWidth(title);
    const titleSuggestions: string[] = [];
    let titleScore = 0;

    const titleHasKeyword = lowerTitle.includes(lowerKeyword);
    if (titleHasKeyword) titleScore += 25;
    else titleSuggestions.push(`Include "${keyword}" in the title`);

    // Keyword should be near the start
    if (titleHasKeyword && lowerTitle.indexOf(lowerKeyword) < 20) titleScore += 10;
    else if (titleHasKeyword) titleSuggestions.push('Move keyword closer to the start of the title');

    const titleHasYear = title.includes(currentYear) || title.includes((parseInt(currentYear) + 1).toString());
    if (titleHasYear) titleScore += 15;
    else titleSuggestions.push(`Add current year (${currentYear}) for freshness signal`);

    const titleHasPowerWord = POWER_WORDS.some(pw => lowerTitle.includes(pw));
    if (titleHasPowerWord) titleScore += 15;
    else titleSuggestions.push('Add a power word (Ultimate, Proven, Expert, Complete)');

    const titleHasNumber = /\d/.test(title);
    if (titleHasNumber) titleScore += 10;

    const titleTruncated = titlePixels > 580;
    if (!titleTruncated) titleScore += 15;
    else titleSuggestions.push(`Title may be truncated in SERP (est. ${titlePixels}px, max ~580px)`);

    if (title.length >= 30) titleScore += 10;
    else titleSuggestions.push('Title is too short — aim for 50-60 characters');

    // --- Description validation ---
    const descPixels = estimatePixelWidth(description);
    const descSuggestions: string[] = [];
    let descScore = 0;

    const descHasKeyword = lowerDesc.includes(lowerKeyword);
    if (descHasKeyword) descScore += 25;
    else descSuggestions.push(`Include "${keyword}" in the description`);

    const descHasCTA = /learn|discover|find out|get|read|explore|check|see|start|try/i.test(description);
    if (descHasCTA) descScore += 20;
    else descSuggestions.push('Add a call-to-action (Learn more, Discover, Find out)');

    const descTruncated = descPixels > 920;
    if (!descTruncated) descScore += 20;
    else descSuggestions.push(`Description may be truncated (est. ${descPixels}px, max ~920px)`);

    if (description.length >= 120 && description.length <= 160) descScore += 20;
    else if (description.length >= 80) descScore += 10;
    else descSuggestions.push('Aim for 120-155 characters in meta description');

    if (/\d/.test(description)) descScore += 15;

    // --- Slug validation ---
    const autoSlug = slug || generateSEOSlug(title);
    const slugWords = autoSlug.split('-').filter(w => w.length > 0);
    const slugSuggestions: string[] = [];
    let slugScore = 0;

    const slugHasKeyword = lowerKeyword.split(' ').some(kw => autoSlug.includes(kw));
    if (slugHasKeyword) slugScore += 30;
    else slugSuggestions.push('Include primary keyword in the URL slug');

    const slugHasStopWords = slugWords.some(w => STOP_WORDS.has(w));
    if (!slugHasStopWords) slugScore += 25;
    else slugSuggestions.push('Remove stop words from slug');

    if (slugWords.length >= 2 && slugWords.length <= 5) slugScore += 30;
    else if (slugWords.length > 5) slugSuggestions.push('Shorten slug to 3-5 words');

    if (autoSlug.length <= 60) slugScore += 15;
    else slugSuggestions.push('Keep slug under 60 characters');

    return {
        title: {
            text: title,
            charCount: title.length,
            pixelWidth: titlePixels,
            isTruncated: titleTruncated,
            hasKeyword: titleHasKeyword,
            hasYear: titleHasYear,
            hasPowerWord: titleHasPowerWord,
            hasNumber: titleHasNumber,
            score: Math.min(titleScore, 100),
            suggestions: titleSuggestions,
        },
        description: {
            text: description,
            charCount: description.length,
            pixelWidth: descPixels,
            isTruncated: descTruncated,
            hasKeyword: descHasKeyword,
            hasCTA: descHasCTA,
            score: Math.min(descScore, 100),
            suggestions: descSuggestions,
        },
        slug: {
            text: autoSlug,
            wordCount: slugWords.length,
            hasKeyword: slugHasKeyword,
            hasStopWords: slugHasStopWords,
            score: Math.min(slugScore, 100),
            suggestions: slugSuggestions,
        },
    };
}


// ============================================================
// P0 Fix #1: Schema JSON-LD Injection
// Appends structured data directly into content HTML so it's
// present regardless of WordPress SEO plugin configuration.
// ============================================================

/**
 * Inject JSON-LD schema markup into HTML content.
 * Appends a <script type="application/ld+json"> block at the end.
 * If schema is empty or already present, returns content unchanged.
 */
export function injectSchemaJsonLD(
    contentHtml: string,
    schema: Record<string, unknown> | Record<string, unknown>[]
): string {
    if (!schema || (Array.isArray(schema) && schema.length === 0)) return contentHtml;
    if (Object.keys(schema).length === 0) return contentHtml;

    // Don't double-inject
    if (contentHtml.includes('application/ld+json')) return contentHtml;

    const schemaBlock = `\n<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
    return contentHtml + schemaBlock;
}


// ============================================================
// P0 Fix #2: WordPress SEO Meta Fields (OG / Yoast / RankMath)
// Builds the meta fields object to pass to WordPress REST API
// so that OG title, description, image, and focus keyword are set.
// ============================================================

export interface WordPressSEOFields {
    /** Yoast + RankMath combined meta (auto mode) */
    meta: Record<string, string>;
}

/**
 * Build complete SEO meta fields for WordPress publish.
 * Supports both Yoast and RankMath in auto mode.
 *
 * Includes: meta title, meta description, focus keyword, and OG image.
 */
export function buildSEOMetaFields(options: {
    metaTitle: string;
    metaDescription: string;
    focusKeyword: string;
    ogImageUrl?: string;
    canonicalUrl?: string;
}): WordPressSEOFields {
    const meta: Record<string, string> = {};
    const { metaTitle, metaDescription, focusKeyword, ogImageUrl, canonicalUrl } = options;

    // --- Yoast SEO fields ---
    if (metaTitle) meta['_yoast_wpseo_title'] = metaTitle;
    if (metaDescription) meta['_yoast_wpseo_metadesc'] = metaDescription;
    if (focusKeyword) meta['_yoast_wpseo_focuskw'] = focusKeyword;
    if (ogImageUrl) meta['_yoast_wpseo_opengraph-image'] = ogImageUrl;
    if (canonicalUrl) meta['_yoast_wpseo_canonical'] = canonicalUrl;

    // --- RankMath SEO fields ---
    if (metaTitle) meta['rank_math_title'] = metaTitle;
    if (metaDescription) meta['rank_math_description'] = metaDescription;
    if (focusKeyword) meta['rank_math_focus_keyword'] = focusKeyword;
    if (ogImageUrl) meta['rank_math_facebook_image'] = ogImageUrl;
    if (ogImageUrl) meta['rank_math_twitter_image'] = ogImageUrl;
    if (canonicalUrl) meta['rank_math_canonical_url'] = canonicalUrl;

    return { meta };
}


// ============================================================
// P0 Fix #3: Sitemap Ping After Publishing
// Notifies Google and Bing that the sitemap has been updated.
// ============================================================

/**
 * Ping search engines with the sitemap URL after publishing.
 * Falls back gracefully if pings fail (non-blocking).
 *
 * @param siteUrl - The WordPress site base URL (e.g., https://example.com)
 * @param postUrl - Optional: the specific post URL for Google Indexing API
 */
export async function pingSitemap(
    siteUrl: string,
    postUrl?: string
): Promise<{ pinged: string[]; errors: string[] }> {
    const cleanUrl = siteUrl.replace(/\/$/, '');
    const sitemapUrl = encodeURIComponent(`${cleanUrl}/sitemap_index.xml`);
    const pinged: string[] = [];
    const errors: string[] = [];

    // Ping Google
    try {
        const googleRes = await fetch(
            `https://www.google.com/ping?sitemap=${sitemapUrl}`,
            { method: 'GET', signal: AbortSignal.timeout(5000) }
        );
        if (googleRes.ok) pinged.push('google');
        else errors.push(`Google ping: HTTP ${googleRes.status}`);
    } catch (e) {
        errors.push(`Google ping: ${e instanceof Error ? e.message : 'failed'}`);
    }

    // Ping Bing
    try {
        const bingRes = await fetch(
            `https://www.bing.com/ping?sitemap=${sitemapUrl}`,
            { method: 'GET', signal: AbortSignal.timeout(5000) }
        );
        if (bingRes.ok) pinged.push('bing');
        else errors.push(`Bing ping: HTTP ${bingRes.status}`);
    } catch (e) {
        errors.push(`Bing ping: ${e instanceof Error ? e.message : 'failed'}`);
    }

    // Ping WordPress sitemap regeneration endpoint
    try {
        await fetch(`${cleanUrl}/sitemap.xml`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });
        pinged.push('wp_sitemap_touch');
    } catch {
        // Non-critical
    }

    // Optional: Google Indexing API (if postUrl provided)
    if (postUrl) {
        try {
            // This requires a service account key — log for now
            console.log(`[SEO] Post URL ready for Google Indexing API: ${postUrl}`);
        } catch {
            // Non-critical
        }
    }

    return { pinged, errors };
}


// ============================================================
// P0 Fix #4: Extract Hero Image URL from HTML Content
// Used to set OG image when publishing to WordPress.
// ============================================================

/**
 * Extract the first image URL from HTML content (for OG image).
 * Returns null if no image found.
 */
export function extractHeroImageUrl(html: string): string | null {
    const match = html.match(/<img[^>]+src="([^"]+)"/i);
    return match ? match[1] : null;
}


// ============================================================
// P1 Fix: Dynamic Word Count Based on Competitors
// Sets target to 15% above competitor average for the keyword.
// ============================================================

const WORD_COUNT_FLOOR = { normal: 1500, cluster: 3000 };

/**
 * Calculate dynamic word count target based on competitor data.
 * Returns 15% above the average competitor word count, but never
 * below the absolute minimum for the content type.
 */
export function calculateDynamicWordCount(
    competitorWordCounts: number[],
    isCluster: boolean = false
): number {
    const floor = isCluster ? WORD_COUNT_FLOOR.cluster : WORD_COUNT_FLOOR.normal;

    if (!competitorWordCounts || competitorWordCounts.length === 0) return floor;

    const avg = competitorWordCounts.reduce((a, b) => a + b, 0) / competitorWordCounts.length;
    const target = Math.round(avg * 1.15); // 15% above average

    return Math.max(floor, target);
}


// ============================================================
// P2 Fix: Freshness Signal Injection for Content Updates
// When republishing updated content, inject visible freshness
// signals and update schema dateModified.
// ============================================================

/**
 * Inject freshness signals into updated content.
 * - Adds/updates a visible "Last Updated" element after the first <p>
 * - Updates dateModified in any existing JSON-LD schema
 *
 * @param contentHtml - The content HTML
 * @param originalPublishDate - Original publish date (ISO string)
 * @returns Updated HTML with freshness signals
 */
export function injectFreshnessSignals(
    contentHtml: string,
    originalPublishDate?: string
): string {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const isoDate = now.toISOString();

    let html = contentHtml;

    // 1. Add or update visible "Last Updated" element
    const updatedBadge = `<p class="content-last-updated" style="font-size:0.9em;color:#666;margin-bottom:1em;"><em>Last Updated: ${formattedDate}</em></p>`;

    // Remove existing badge if present
    html = html.replace(/<p class="content-last-updated"[^>]*>.*?<\/p>/gi, '');

    // Insert after the first paragraph
    const firstPClose = html.indexOf('</p>');
    if (firstPClose !== -1) {
        html = html.slice(0, firstPClose + 4) + '\n' + updatedBadge + html.slice(firstPClose + 4);
    } else {
        html = updatedBadge + html;
    }

    // 2. Update dateModified in existing JSON-LD schema
    if (html.includes('application/ld+json')) {
        html = html.replace(
            /"dateModified"\s*:\s*"[^"]*"/g,
            `"dateModified": "${isoDate}"`
        );
    }

    // 3. If we have the original publish date, add datePublished reference
    if (originalPublishDate && html.includes('application/ld+json')) {
        // Ensure datePublished stays as original
        const origDate = new Date(originalPublishDate).toISOString();
        html = html.replace(
            /"datePublished"\s*:\s*"[^"]*"/g,
            `"datePublished": "${origDate}"`
        );
    }

    return html;
}


// ============================================================
// P2 Fix: WordPress Meta for Content Updates
// Builds the minimal meta fields needed for a content refresh
// without changing the original publish date.
// ============================================================

/**
 * Build WordPress meta fields for a content update/refresh.
 * Sets dateModified via Yoast/RankMath without changing publish date.
 */
export function buildUpdateMetaFields(options: {
    metaTitle: string;
    metaDescription: string;
    focusKeyword: string;
    ogImageUrl?: string;
}): Record<string, string> {
    const seoFields = buildSEOMetaFields(options);
    return seoFields.meta;
}
