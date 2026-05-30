// ============================================================
// RankMaster Pro - HTML sanitizer
// Wrap any value passed to dangerouslySetInnerHTML. The content rendered
// in the dashboard comes from AI generation, scraped pages, and WordPress,
// any of which can carry <script>/onerror/javascript: payloads.
// ============================================================

import DOMPurify from 'dompurify';

/**
 * Sanitize an HTML string for safe use with dangerouslySetInnerHTML.
 *
 * Only runs in the browser (DOMPurify needs a DOM). All call sites are
 * client components whose dangerous content is fetched client-side, so the
 * server pass renders empty/static markup; returning '' there avoids
 * shipping unsanitized HTML in the SSR payload.
 */
export function sanitizeHtml(html: string | null | undefined): string {
    if (!html) return '';
    if (typeof window === 'undefined') return '';
    // DOMPurify defaults already strip <script>, on* handlers, and
    // javascript:/data: script URLs while preserving the formatting, tables,
    // links, and inline styles these views legitimately render. Also drop
    // embedding tags that have no place in article/preview HTML.
    return DOMPurify.sanitize(html, {
        FORBID_TAGS: ['iframe', 'object', 'embed', 'form'],
    });
}
