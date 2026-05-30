// ============================================================
// RankMaster Pro - FTC Disclosure Auto-Injector
// Injects compliant affiliate disclosure at top of content
// ============================================================

export type DisclosureStyle = 'banner' | 'inline' | 'sticky' | 'minimal';
export type DisclosurePosition = 'top' | 'after_intro' | 'before_first_link';

export interface DisclosureConfig {
    style: DisclosureStyle;
    position: DisclosurePosition;
    custom_text?: string;
    site_name?: string;
    networks?: string[];
}

const TEMPLATES: Record<DisclosureStyle, (config: DisclosureConfig) => string> = {
    banner: (c) => `<div class="affiliate-disclosure affiliate-disclosure--banner" style="background:#fffbeb;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:24px;font-size:0.875rem;color:#92400e;">
<strong>Disclosure:</strong> ${c.site_name || 'This site'} participates in affiliate programs${c.networks?.length ? ` including ${c.networks.join(', ')}` : ''}. If you purchase through links on this page, we may earn a commission at no extra cost to you. <a href="/affiliate-disclosure" style="color:#d97706;text-decoration:underline;">Learn more</a>.
</div>`,

    inline: (c) => `<p class="affiliate-disclosure affiliate-disclosure--inline" style="font-size:0.8rem;color:#6b7280;font-style:italic;margin-bottom:16px;"><em><strong>Affiliate Disclosure:</strong> ${c.site_name || 'This page'} contains affiliate links. We may earn a commission if you buy through our links — this doesn't affect our recommendations.</em></p>`,

    sticky: (c) => `<aside class="affiliate-disclosure affiliate-disclosure--sticky" style="position:sticky;top:0;background:#f0f9ff;border-bottom:1px solid #bae6fd;padding:8px 16px;font-size:0.8rem;color:#0369a1;z-index:10;">
📢 <strong>Disclosure:</strong> Links marked with * are affiliate links. ${c.site_name ? `${c.site_name} earns` : 'We earn'} a commission if you purchase.
</aside>`,

    minimal: (c) => `<!-- Affiliate Disclosure --><p class="affiliate-disclosure" style="font-size:0.75rem;color:#9ca3af;margin-bottom:12px;">*Affiliate links. ${c.site_name || 'Site'} earns commission on purchases.</p>`,
};

export function generateDisclosure(config: DisclosureConfig): string {
    if (config.custom_text) {
        return `<div class="affiliate-disclosure">${config.custom_text}</div>`;
    }
    const template = TEMPLATES[config.style] || TEMPLATES.banner;
    return template(config);
}

export function injectDisclosure(html: string, config: DisclosureConfig): string {
    if (!html) return html;
    const disclosure = generateDisclosure(config);

    switch (config.position) {
        case 'top':
            return disclosure + html;

        case 'after_intro': {
            // After first </p>
            const firstPEnd = html.indexOf('</p>');
            if (firstPEnd === -1) return disclosure + html;
            return html.slice(0, firstPEnd + 4) + '\n' + disclosure + html.slice(firstPEnd + 4);
        }

        case 'before_first_link': {
            // Before first <a href with affiliate indicator
            const affiliatePattern = /<a[^>]+(?:amzn|shareasale|cj\.com|go\/|affiliate)[^>]*>/i;
            const match = affiliatePattern.exec(html);
            if (!match || match.index === undefined) return disclosure + html;
            const idx = match.index;
            // Insert before the paragraph containing the first link
            const beforeLink = html.lastIndexOf('<p', idx);
            const insertAt = beforeLink !== -1 ? beforeLink : idx;
            return html.slice(0, insertAt) + disclosure + '\n' + html.slice(insertAt);
        }

        default:
            return disclosure + html;
    }
}

export function hasDisclosure(html: string): boolean {
    return html.includes('affiliate-disclosure') ||
        /affiliate\s+disclosure/i.test(html) ||
        /we may earn/i.test(html) ||
        /commission/i.test(html);
}
