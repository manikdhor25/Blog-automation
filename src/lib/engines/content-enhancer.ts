// ============================================================
// RankMaster Pro - Content Enhancement Utilities
// #21 — Auto-generated Table of Contents injection
// #22 — Comparison table auto-injection for vs/comparison keywords
// #39 — Semantic HTML5 structure enforcement
// ============================================================

// ── #21: Table of Contents Generator ──────────────────────────
// Automatically generates a clickable TOC from H2/H3 headings

export function injectTableOfContents(html: string, minHeadings: number = 4): string {
    // Extract all H2 and H3 headings
    const headingRegex = /<(h[23])[^>]*>([\s\S]*?)<\/\1>/gi;
    const headings: { level: number; text: string; id: string }[] = [];
    let match;

    while ((match = headingRegex.exec(html)) !== null) {
        const level = parseInt(match[1].charAt(1));
        const text = match[2].replace(/<[^>]+>/g, '').trim();
        if (!text) continue;

        // Skip utility headings
        if (/table of contents|key takeaway|faq|frequently asked|sources|references/i.test(text)) continue;

        const id = text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 60);

        headings.push({ level, text, id });
    }

    // Only inject TOC if there are enough headings
    if (headings.length < minHeadings) return html;

    // Build TOC HTML
    const tocItems = headings.map(h => {
        const indent = h.level === 3 ? ' style="margin-left: 1.2em;"' : '';
        return `<li${indent}><a href="#${h.id}">${h.text}</a></li>`;
    }).join('\n    ');

    const tocHtml = `
<nav class="table-of-contents" aria-label="Table of Contents">
  <details open>
    <summary><strong>In This Article</strong></summary>
    <ol>
    ${tocItems}
    </ol>
  </details>
</nav>
`;

    // Add IDs to headings in the content
    let modifiedHtml = html;
    for (const h of headings) {
        const escapedText = h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const headingPattern = new RegExp(
            `(<h[23])([^>]*>)(\\s*${escapedText}\\s*)(<\\/h[23]>)`,
            'i'
        );
        modifiedHtml = modifiedHtml.replace(headingPattern, `$1 id="${h.id}"$2$3$4`);
    }

    // Insert TOC after the first paragraph (after intro)
    const firstParaEnd = modifiedHtml.indexOf('</p>');
    if (firstParaEnd !== -1) {
        modifiedHtml = modifiedHtml.slice(0, firstParaEnd + 4) + tocHtml + modifiedHtml.slice(firstParaEnd + 4);
    }

    return modifiedHtml;
}

// ── #22: Comparison Table Auto-Injection ──────────────────────
// For "vs", "compare", "best" keywords — generates a comparison summary table

export interface ComparisonItem {
    name: string;
    highlights: string[];
    score?: string;
}

export function generateComparisonTable(
    items: ComparisonItem[],
    columns: string[] = ['Feature', 'Score', 'Key Highlights']
): string {
    if (items.length < 2) return '';

    const hasScores = items.some(item => item.score !== undefined);
    const headers = hasScores ? columns : [columns[0], columns[2]];

    let tableHtml = '<div class="comparison-table-wrapper">\n';
    tableHtml += '<table class="comparison-table">\n';
    tableHtml += '  <caption>Quick Comparison Overview</caption>\n';
    tableHtml += '  <thead>\n    <tr>\n';
    for (const header of headers) {
        tableHtml += `      <th scope="col">${header}</th>\n`;
    }
    tableHtml += '    </tr>\n  </thead>\n';
    tableHtml += '  <tbody>\n';

    for (const item of items) {
        tableHtml += '    <tr>\n';
        tableHtml += `      <td><strong>${item.name}</strong></td>\n`;
        if (hasScores) {
            tableHtml += `      <td>${item.score || 'N/A'}</td>\n`;
        }
        tableHtml += `      <td>${item.highlights.join(', ')}</td>\n`;
        tableHtml += '    </tr>\n';
    }

    tableHtml += '  </tbody>\n</table>\n</div>';
    return tableHtml;
}

/**
 * Detect if content should have a comparison table and auto-inject one
 * from H2/H3 headings that look like product/option names
 */
export function autoInjectComparisonTable(html: string, keyword: string): string {
    const kwLower = keyword.toLowerCase();
    const isComparison = /\b(vs|versus|compare|comparison|best|top \d+|alternatives)\b/i.test(kwLower);
    if (!isComparison) return html;

    // Check if a table already exists
    if (/<table/i.test(html)) return html;

    // Extract comparison items from H2/H3 headings
    const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
    const items: ComparisonItem[] = [];
    let match;

    while ((match = headingRegex.exec(html)) !== null) {
        const text = match[1].replace(/<[^>]+>/g, '').trim();
        // Skip non-item headings
        if (/^(introduction|conclusion|faq|what is|how to|why|comparison|overview|summary|key takeaway)/i.test(text)) continue;
        if (text.length > 80) continue; // Too long to be an item name

        // Extract a brief description from the following paragraph
        const afterHeading = html.substring(match.index + match[0].length);
        const nextPara = afterHeading.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const highlight = nextPara
            ? nextPara[1].replace(/<[^>]+>/g, '').trim().substring(0, 100)
            : '';

        if (highlight) {
            items.push({
                name: text.replace(/^\d+[\.\)]\s*/, ''), // Remove numbering
                highlights: [highlight],
            });
        }
    }

    if (items.length < 3) return html; // Need at least 3 items for a useful table

    const table = generateComparisonTable(items.slice(0, 10));

    // Inject table after the second paragraph (after intro context)
    const paragraphs = [...html.matchAll(/<\/p>/gi)];
    if (paragraphs.length >= 2) {
        const insertPoint = paragraphs[1].index! + paragraphs[1][0].length;
        return html.slice(0, insertPoint) + '\n' + table + '\n' + html.slice(insertPoint);
    }

    return html;
}


// ── #39: Semantic HTML5 Structure Enforcer ─────────────────────
// Upgrades generic divs to semantic HTML5 elements

export function enforceSemanticHTML(html: string): string {
    let enhanced = html;

    // Wrap the main content in <article> if not already
    if (!/<article/i.test(enhanced)) {
        enhanced = `<article>\n${enhanced}\n</article>`;
    }

    // Wrap FAQ sections in <section> with aria-label
    enhanced = enhanced.replace(
        /(<h2[^>]*>(?:FAQ|Frequently Asked Questions)[^<]*<\/h2>)/gi,
        '<section aria-label="Frequently Asked Questions">\n$1'
    );

    // Wrap key takeaways in <aside> if using a div
    enhanced = enhanced.replace(
        /<div class="key-takeaways">/gi,
        '<aside class="key-takeaways" aria-label="Key Takeaways">'
    );
    enhanced = enhanced.replace(
        /(<\/div>)(\s*<!--\s*end key-takeaways\s*-->)/gi,
        '</aside>$2'
    );

    // Add <figure> and <figcaption> to images that don't have them
    enhanced = enhanced.replace(
        /(?<!<figure[^>]*>\s*)<img([^>]+)>(?!\s*<\/figure)/gi,
        (match, attrs) => {
            const altMatch = attrs.match(/alt="([^"]*)"/i);
            const alt = altMatch ? altMatch[1] : '';
            if (alt) {
                return `<figure><img${attrs}><figcaption>${alt}</figcaption></figure>`;
            }
            return match; // Don't wrap if no alt text
        }
    );

    // Add <time> elements to date patterns in text
    enhanced = enhanced.replace(
        /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
        (match) => {
            const date = new Date(match);
            if (!isNaN(date.getTime())) {
                return `<time datetime="${date.toISOString().split('T')[0]}">${match}</time>`;
            }
            return match;
        }
    );

    // Mark abbreviations with <abbr> for common tech terms
    const commonAbbreviations: Record<string, string> = {
        'SEO': 'Search Engine Optimization',
        'AEO': 'Answer Engine Optimization',
        'GEO': 'Generative Engine Optimization',
        'CTR': 'Click-Through Rate',
        'CPC': 'Cost Per Click',
        'ROI': 'Return on Investment',
        'API': 'Application Programming Interface',
        'CRM': 'Customer Relationship Management',
        'SaaS': 'Software as a Service',
        'AI': 'Artificial Intelligence',
        'NLP': 'Natural Language Processing',
    };

    for (const [abbr, title] of Object.entries(commonAbbreviations)) {
        // Only replace the first occurrence (avoid over-marking)
        const pattern = new RegExp(`\\b${abbr}\\b(?![^<]*<\\/abbr)`, '');
        enhanced = enhanced.replace(pattern, `<abbr title="${title}">${abbr}</abbr>`);
    }

    return enhanced;
}

// ============================================================
// NEW CONTENT FORMATTING ENHANCERS
// Rich visual formatting: callouts, pull quotes, accordions,
// code blocks, footnotes, reading time, progress bar, etc.
// ============================================================

// ── 1. Responsive Table Wrapper ────────────────────────────────
// Wraps bare <table> elements in a scrollable container
export function wrapResponsiveTables(html: string): string {
    // Skip tables already wrapped
    return html.replace(
        /(?<!<div[^>]*class="[^"]*(?:responsive-table-wrapper|comparison-table)[^"]*"[^>]*>\s*)(<table[\s\S]*?<\/table>)/gi,
        (match) => {
            // Check if already wrapped by looking at preceding HTML
            if (match.includes('responsive-table-wrapper') || match.includes('comparison-table-wrapper')) {
                return match;
            }
            return `<div class="responsive-table-wrapper">${match}</div>`;
        }
    );
}

// ── 2. Callout Box Injection ───────────────────────────────────
// Converts text patterns and blockquotes into styled callout boxes
export function injectCalloutBoxes(html: string): string {
    let enhanced = html;

    // Pattern: paragraphs starting with emoji + keyword triggers
    const calloutPatterns: { pattern: RegExp; type: string; emoji: string; title: string }[] = [
        { pattern: /(<p[^>]*>)\s*💡\s*(?:Pro\s+Tip|Tip)\s*:\s*([\s\S]*?)(<\/p>)/gi, type: 'tip', emoji: '💡', title: 'Pro Tip' },
        { pattern: /(<p[^>]*>)\s*⚠️?\s*(?:Warning|Caution)\s*:\s*([\s\S]*?)(<\/p>)/gi, type: 'warning', emoji: '⚠️', title: 'Warning' },
        { pattern: /(<p[^>]*>)\s*ℹ️?\s*(?:Info|Did You Know)\s*:\s*([\s\S]*?)(<\/p>)/gi, type: 'info', emoji: 'ℹ️', title: 'Did You Know?' },
        { pattern: /(<p[^>]*>)\s*📌\s*(?:Note|Important)\s*:\s*([\s\S]*?)(<\/p>)/gi, type: 'note', emoji: '📌', title: 'Note' },
        { pattern: /(<p[^>]*>)\s*(?:Pro\s+Tip|💡Tip)\s*:\s*([\s\S]*?)(<\/p>)/gi, type: 'tip', emoji: '💡', title: 'Pro Tip' },
        { pattern: /(<p[^>]*>)\s*(?:Warning|Caution)\s*:\s*([\s\S]*?)(<\/p>)/gi, type: 'warning', emoji: '⚠️', title: 'Warning' },
        { pattern: /(<p[^>]*>)\s*(?:Important)\s*:\s*([\s\S]*?)(<\/p>)/gi, type: 'note', emoji: '📌', title: 'Important' },
    ];

    for (const { pattern, type, emoji, title } of calloutPatterns) {
        enhanced = enhanced.replace(pattern, (_match, _openTag, content) => {
            return `<div class="callout-${type}"><div class="callout-icon">${emoji}</div><div class="callout-content"><strong class="callout-title">${title}</strong><p>${content.trim()}</p></div></div>`;
        });
    }

    // Convert blockquotes with callout keywords
    enhanced = enhanced.replace(
        /<blockquote[^>]*>\s*<p[^>]*>\s*(💡|⚠️|ℹ️|📌)?\s*(Pro\s+Tip|Tip|Warning|Caution|Note|Important|Info|Did You Know)\s*:\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
        (_match, _emoji, keyword, content) => {
            const typeMap: Record<string, { type: string; emoji: string; title: string }> = {
                'pro tip': { type: 'tip', emoji: '💡', title: 'Pro Tip' },
                'tip': { type: 'tip', emoji: '💡', title: 'Pro Tip' },
                'warning': { type: 'warning', emoji: '⚠️', title: 'Warning' },
                'caution': { type: 'warning', emoji: '⚠️', title: 'Caution' },
                'note': { type: 'note', emoji: '📌', title: 'Note' },
                'important': { type: 'note', emoji: '📌', title: 'Important' },
                'info': { type: 'info', emoji: 'ℹ️', title: 'Did You Know?' },
                'did you know': { type: 'info', emoji: 'ℹ️', title: 'Did You Know?' },
            };
            const cfg = typeMap[keyword.toLowerCase()] || { type: 'note', emoji: '📌', title: keyword };
            return `<div class="callout-${cfg.type}"><div class="callout-icon">${cfg.emoji}</div><div class="callout-content"><strong class="callout-title">${cfg.title}</strong><p>${content.trim()}</p></div></div>`;
        }
    );

    // Don't double-wrap existing callout divs
    enhanced = enhanced.replace(/<div class="callout-(\w+)">\s*<div class="callout-\1">/g, '<div class="callout-$1">');

    return enhanced;
}

// ── 3. Pull Quote & Stat Highlight Injection ───────────────────
// Converts attributed blockquotes to pull quotes, highlights stats
export function injectPullQuotes(html: string): string {
    let enhanced = html;
    let pullQuoteCount = 0;
    let statCount = 0;

    // Convert blockquotes with attribution (— or – dash) to pull quotes
    enhanced = enhanced.replace(
        /<blockquote[^>]*>\s*<p[^>]*>([\s\S]*?)\s*[—–]\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
        (_match, quote, attribution) => {
            if (pullQuoteCount >= 2) return _match; // Limit to 2
            // Skip if it's already a callout
            if (quote.includes('callout-')) return _match;
            pullQuoteCount++;
            return `<figure class="pull-quote"><blockquote>${quote.trim()}</blockquote><figcaption>— ${attribution.trim()}</figcaption></figure>`;
        }
    );

    // Extract stat highlights from paragraphs: "XX% of [something] (Source, Year)"
    enhanced = enhanced.replace(
        /<p[^>]*>([\s\S]*?)(\d{1,3}(?:\.\d+)?%)\s+([\s\S]*?)\(([^)]+)\)([\s\S]*?)<\/p>/gi,
        (match, before, percentage, context, source, after) => {
            if (statCount >= 2) return match; // Limit to 2
            // Only convert if the stat is the main focus (short sentence)
            const totalText = (before + context + after).replace(/<[^>]+>/g, '').trim();
            if (totalText.split(/\s+/).length > 25) return match; // Too long, skip
            statCount++;
            return `<div class="stat-highlight"><span class="stat-number">${percentage}</span><span class="stat-label">${context.replace(/<[^>]+>/g, '').trim()}</span><span class="stat-source">${source.trim()}</span></div>`;
        }
    );

    return enhanced;
}

// ── 4. FAQ Accordion Conversion ────────────────────────────────
// Converts flat FAQ H3+P pairs into collapsible accordion
export function convertFAQToAccordion(html: string): string {
    // Find FAQ section — common patterns
    const faqPatterns = [
        /(<(?:div|section)[^>]*(?:id="faq-section"|class="[^"]*faq[^"]*")[^>]*>)([\s\S]*?)(<\/(?:div|section)>)/i,
        /(<h2[^>]*>[^<]*(?:FAQ|Frequently Asked)[^<]*<\/h2>)([\s\S]*?)(?=<h2[^>]*>|$)/i,
    ];

    let enhanced = html;
    let matched = false;

    for (const pattern of faqPatterns) {
        if (matched) break;
        enhanced = enhanced.replace(pattern, (fullMatch, prefix, content, suffix) => {
            // Extract H3+content pairs
            const qaRegex = /<h3[^>]*>([\s\S]*?)<\/h3>\s*([\s\S]*?)(?=<h3[^>]*>|$)/gi;
            let qaMatch;
            const items: string[] = [];

            while ((qaMatch = qaRegex.exec(content)) !== null) {
                const question = qaMatch[1].replace(/<[^>]+>/g, '').trim();
                const answer = qaMatch[2].trim();
                if (question && answer) {
                    items.push(
                        `<details class="accordion-faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">` +
                        `<summary itemprop="name">${question}</summary>` +
                        `<div class="accordion-faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">` +
                        `<div itemprop="text">${answer}</div></div></details>`
                    );
                }
            }

            if (items.length === 0) return fullMatch;
            matched = true;

            const accordionHTML = `<div class="accordion-faq" itemscope itemtype="https://schema.org/FAQPage">${items.join('')}</div>`;

            // If it matched an H2-prefix pattern, keep the heading
            if (prefix.startsWith('<h2')) {
                return `${prefix}${accordionHTML}`;
            }
            return `${prefix}${accordionHTML}${suffix || ''}`;
        });
    }

    return enhanced;
}

// ── 5. Code Block Enhancement ──────────────────────────────────
// Wraps <pre><code> blocks with language badge, copy button
export function enhanceCodeBlocks(html: string): string {
    return html.replace(
        /<pre[^>]*>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi,
        (_match, attrs, code) => {
            // Already enhanced?
            if (_match.includes('code-block-wrapper')) return _match;

            // Detect language from class
            const langMatch = attrs.match(/class="[^"]*language-(\w+)/i);
            const lang = langMatch ? langMatch[1] : detectCodeLanguage(code);
            const langLabel = lang || 'code';

            // Build enhanced code block
            return `<div class="code-block-wrapper">` +
                `<span class="code-language">${langLabel}</span>` +
                `<button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.parentElement.querySelector('code').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>` +
                `<pre><code class="language-${langLabel}"${attrs.replace(/class="[^"]*"/i, '')}>${code}</code></pre>` +
                `</div>`;
        }
    );
}

// Simple code language detection heuristic
function detectCodeLanguage(code: string): string {
    const stripped = code.replace(/<[^>]+>/g, '').trim();
    if (/\b(function|const|let|var|=>|import\s+{)\b/.test(stripped)) return 'javascript';
    if (/\b(def |class |import |from |print\()\b/.test(stripped)) return 'python';
    if (/\b(<html|<div|<span|<head|<!DOCTYPE)\b/i.test(stripped)) return 'html';
    if (/\b(\{[\s\S]*:[\s\S]*;[\s\S]*\}|@media|\.[\w-]+\s*\{)\b/.test(stripped)) return 'css';
    if (/\b(SELECT|FROM|WHERE|INSERT INTO|CREATE TABLE)\b/i.test(stripped)) return 'sql';
    if (/\b(func |package |go\s|fmt\.)\b/.test(stripped)) return 'go';
    if (/\b(public class|System\.out|void main)\b/.test(stripped)) return 'java';
    if (/\b(fn |let mut|impl |use std::)\b/.test(stripped)) return 'rust';
    if (/^\s*[\[{][\s\S]*[}\]]$/.test(stripped)) return 'json';
    if (/^\s*[\w-]+:\s/m.test(stripped) && !stripped.includes('{')) return 'yaml';
    if (/\$\(|echo |#!/.test(stripped)) return 'bash';
    return '';
}

// ── 6. Footnote Processing ─────────────────────────────────────
// Converts [^N] markers to superscript refs with a bottom section
export function processFootnotes(html: string): string {
    // Check if there are any footnote markers
    if (!/\[\^\d+\]/.test(html)) return html;

    let enhanced = html;
    const footnotes: { id: number; text: string }[] = [];

    // Extract footnote definitions: [^1]: Some text (usually at end)
    enhanced = enhanced.replace(
        /(?:<p[^>]*>)?\[\^(\d+)\]:\s*([\s\S]*?)(?:<\/p>|(?=\[\^\d+\]:)|$)/gi,
        (_match, id, text) => {
            footnotes.push({ id: parseInt(id), text: text.replace(/<[^>]+>/g, '').trim() });
            return ''; // Remove definition from body
        }
    );

    // Replace inline markers [^N] with superscript links
    enhanced = enhanced.replace(
        /\[\^(\d+)\]/g,
        (_match, id) => {
            return `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}">${id}</a></sup>`;
        }
    );

    // Build footnotes section if we found definitions
    if (footnotes.length > 0) {
        footnotes.sort((a, b) => a.id - b.id);
        const footnotesHTML = footnotes.map(fn =>
            `<li id="fn-${fn.id}">${fn.text} <a href="#fnref-${fn.id}" class="footnote-back" aria-label="Back to reference">↩</a></li>`
        ).join('\n');

        enhanced += `\n<section class="footnotes-section" aria-label="Footnotes"><ol>${footnotesHTML}</ol></section>`;
    }

    return enhanced;
}

// ── 7. Reading Time Calculator ─────────────────────────────────
// Injects reading time badge near the title or last-updated date
export function addReadingTime(html: string): string {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const minutes = Math.max(1, Math.ceil(wordCount / 238));
    const badge = `<span class="reading-time-badge">🕐 ${minutes} min read</span>`;

    // Try to inject next to last-updated
    if (html.includes('last-updated')) {
        return html.replace(
            /(<[^>]*class="[^"]*last-updated[^"]*"[^>]*>[\s\S]*?<\/[^>]+>)/i,
            `$1 ${badge}`
        );
    }

    // Fallback: inject after H1
    return html.replace(
        /(<\/h1>)/i,
        `$1\n<div style="margin-top: 4px">${badge}</div>`
    );
}

// ── 8. Reading Progress Bar ────────────────────────────────────
// Adds a fixed progress bar at the top with scroll listener
export function addProgressBarMarkup(html: string): string {
    // Don't add if already present
    if (html.includes('reading-progress')) return html;

    const progressBar = `<div class="reading-progress-bar" id="reading-progress" style="width: 0%"></div>`;
    const scrollScript = `<script>!function(){var p=document.getElementById('reading-progress');if(!p)return;window.addEventListener('scroll',function(){var h=document.documentElement.scrollHeight-window.innerHeight;if(h<=0)return;var s=(window.scrollY/h)*100;p.style.width=Math.min(s,100)+'%'})}()</script>`;

    return progressBar + html + scrollScript;
}

// ── 9. Responsive Image Enhancement ───────────────────────────
// Adds lazy loading, decoding, and CLS-safe dimensions to images
export function injectResponsiveImages(html: string): string {
    let isFirst = true;

    return html.replace(/<img([^>]*)>/gi, (match, attrs: string) => {
        let enhanced = attrs;

        // Skip if already has loading attribute
        if (!/loading=/i.test(enhanced)) {
            if (isFirst) {
                // First image: eager load (above the fold)
                enhanced += ' loading="eager"';
                isFirst = false;
            } else {
                enhanced += ' loading="lazy"';
            }
        } else {
            isFirst = false;
        }

        // Add decoding="async" if missing
        if (!/decoding=/i.test(enhanced)) {
            enhanced += ' decoding="async"';
        }

        // Add default dimensions for CLS prevention if missing
        if (!/width=/i.test(enhanced)) {
            enhanced += ' width="800"';
        }
        if (!/height=/i.test(enhanced)) {
            enhanced += ' height="450"';
        }

        return `<img${enhanced}>`;
    });
}

// ── 10. Definition List Conversion ─────────────────────────────
// Converts consecutive <strong>Term:</strong> Definition patterns to <dl>
export function enhanceDefinitionLists(html: string): string {
    // Match 3+ consecutive paragraphs with <strong>Term:</strong> definition pattern
    const dlPattern = /((?:<p[^>]*>\s*<strong>[^<]+:<\/strong>\s*[\s\S]*?<\/p>\s*){3,})/gi;

    return html.replace(dlPattern, (match) => {
        const items = match.match(/<p[^>]*>\s*<strong>([^<]+):<\/strong>\s*([\s\S]*?)<\/p>/gi);
        if (!items || items.length < 3) return match;

        const dlItems = items.map(item => {
            const parsed = item.match(/<p[^>]*>\s*<strong>([^<]+):<\/strong>\s*([\s\S]*?)<\/p>/i);
            if (!parsed) return '';
            return `<dt>${parsed[1].trim()}</dt><dd>${parsed[2].replace(/<[^>]+>/g, '').trim()}</dd>`;
        }).join('\n');

        return `<dl>${dlItems}</dl>`;
    });
}

// ============================================================
// MASTER ENHANCER — runs all formatters in sequence
// ============================================================
export function enhanceContentFormatting(html: string, _keyword: string): string {
    let enhanced = html;

    // 1. Responsive tables (before other table manipulations)
    enhanced = wrapResponsiveTables(enhanced);

    // 2. Callout boxes (convert text patterns to styled callouts)
    enhanced = injectCalloutBoxes(enhanced);

    // 3. Pull quotes & stat highlights
    enhanced = injectPullQuotes(enhanced);

    // 4. Code block enhancement (language detection, copy button)
    enhanced = enhanceCodeBlocks(enhanced);

    // 5. Definition lists (convert bold:definition patterns)
    enhanced = enhanceDefinitionLists(enhanced);

    // 6. FAQ accordion conversion
    enhanced = convertFAQToAccordion(enhanced);

    // 7. Footnote processing
    enhanced = processFootnotes(enhanced);

    // 8. Reading time badge
    enhanced = addReadingTime(enhanced);

    // 9. Progress bar
    enhanced = addProgressBarMarkup(enhanced);

    // 10. Responsive image attributes
    enhanced = injectResponsiveImages(enhanced);

    console.log('[ContentEnhancer] Content formatting enhancement complete — 10 passes applied');

    return enhanced;
}
