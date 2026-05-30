// ============================================================
// RankMaster Pro - ASIN → Full Review Post Generator
// Amazon product data → complete affiliate review article
// ============================================================

import { routeAI } from '@/lib/ai/router';
import type { ProductData } from './product-data';

export interface ReviewSection {
    heading: string;
    content: string;
}

export interface GeneratedReview {
    title: string;
    meta_title: string;
    meta_description: string;
    intro: string;
    quick_verdict: string;
    verdict_score: number;
    pros: string[];
    cons: string[];
    who_its_for: string;
    who_its_not_for: string;
    specs_table_html: string;
    sections: ReviewSection[];
    faq: Array<{ question: string; answer: string }>;
    conclusion: string;
    cta_text: string;
    schema_markup: Record<string, unknown>;
    word_count_estimate: number;
    full_html: string;
}

export async function generateProductReview(
    product: ProductData,
    affiliateUrl: string,
    niche: string,
    targetKeyword?: string
): Promise<GeneratedReview | null> {
    const keyword = targetKeyword || `${product.title} review`;

    const featuresList = product.features?.slice(0, 10).map((f, i) => `${i + 1}. ${f}`).join('\n') || 'Not available';
    const ratingText = product.rating ? `${product.rating}/5 (${product.review_count?.toLocaleString() || 0} reviews)` : 'No rating';
    const priceText = product.price ? `$${product.price} ${product.currency}` : 'Check price';

    const prompt = `You are an expert affiliate review writer in the ${niche} niche. Write a comprehensive, honest, SEO-optimized product review.

Product: ${product.title}
Brand: ${product.brand || 'Unknown'}
Price: ${priceText}
Rating: ${ratingText}
Category: ${product.category || niche}
Target keyword: "${keyword}"

Product features:
${featuresList}

Write a complete review following EEAT principles. Return ONLY valid JSON:
{
  "title": "compelling H1 title including keyword (60-65 chars)",
  "meta_title": "SEO title tag (55-60 chars)",
  "meta_description": "meta description with keyword and CTA (145-155 chars)",
  "intro": "engaging intro paragraph (150-200 words) — hook, social proof, who this review is for",
  "quick_verdict": "2-3 sentence verdict summarizing recommendation",
  "verdict_score": 8.5,
  "pros": ["pro 1", "pro 2", "pro 3", "pro 4", "pro 5"],
  "cons": ["con 1", "con 2", "con 3"],
  "who_its_for": "specific audience description",
  "who_its_not_for": "who should avoid this product",
  "specs_table_html": "<table class='review-specs'>...</table>",
  "sections": [
    {"heading": "Design & Build Quality", "content": "300-400 word section..."},
    {"heading": "Performance & Features", "content": "300-400 word section..."},
    {"heading": "Value for Money", "content": "200-300 word section..."},
    {"heading": "How It Compares", "content": "200-300 word section mentioning 2 alternatives..."}
  ],
  "faq": [
    {"question": "Is the ${product.title} worth buying?", "answer": "..."},
    {"question": "What are the alternatives to ${product.title}?", "answer": "..."},
    {"question": "Does ${product.title} have a warranty?", "answer": "..."}
  ],
  "conclusion": "strong closing paragraph (100-150 words) with clear recommendation",
  "cta_text": "Check Current Price on Amazon",
  "word_count_estimate": 1800
}`;

    const result = await routeAI({
        task: 'content_writing',
        prompt,
        systemPrompt: 'Expert affiliate review writer. Honest, detailed, EEAT-compliant. Return only JSON.',
        maxTokens: 4000,
        jsonMode: true,
    });

    if (!result.success || !result.content) return null;

    try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        const data = JSON.parse(jsonMatch?.[0] || result.content) as GeneratedReview;

        // Build schema markup
        data.schema_markup = {
            '@context': 'https://schema.org',
            '@type': 'Review',
            'name': data.title,
            'reviewRating': {
                '@type': 'Rating',
                'ratingValue': data.verdict_score,
                'bestRating': '10',
            },
            'author': { '@type': 'Organization', 'name': 'RankMaster Pro' },
            'itemReviewed': {
                '@type': 'Product',
                'name': product.title,
                'brand': { '@type': 'Brand', 'name': product.brand || '' },
                'offers': {
                    '@type': 'Offer',
                    'price': product.price,
                    'priceCurrency': product.currency,
                    'url': affiliateUrl,
                    'availability': product.availability === 'in_stock'
                        ? 'https://schema.org/InStock'
                        : 'https://schema.org/OutOfStock',
                },
                ...(product.rating ? {
                    'aggregateRating': {
                        '@type': 'AggregateRating',
                        'ratingValue': product.rating,
                        'reviewCount': product.review_count || 0,
                    },
                } : {}),
            },
        };

        // Build full HTML
        const prosHtml = data.pros.map(p => `<li>✅ ${p}</li>`).join('');
        const consHtml = data.cons.map(c => `<li>❌ ${c}</li>`).join('');
        const sectionsHtml = data.sections.map(s =>
            `<h2>${s.heading}</h2>\n<p>${s.content.replace(/\n/g, '</p><p>')}</p>`
        ).join('\n');
        const faqHtml = data.faq.map(f =>
            `<h3>${f.question}</h3><p>${f.answer}</p>`
        ).join('\n');
        const faqSchema = {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': data.faq.map(f => ({
                '@type': 'Question',
                'name': f.question,
                'acceptedAnswer': { '@type': 'Answer', 'text': f.answer },
            })),
        };

        data.full_html = `
<p>${data.intro}</p>

<div class="review-verdict" style="background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:20px;margin:24px 0;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <strong style="font-size:1.1rem;">Quick Verdict</strong>
    <span style="background:#16a34a;color:#fff;padding:4px 12px;border-radius:20px;font-weight:700;">${data.verdict_score}/10</span>
  </div>
  <p>${data.quick_verdict}</p>
  <a href="${affiliateUrl}" rel="nofollow sponsored" target="_blank" style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:6px;font-weight:700;text-decoration:none;">${data.cta_text} →</a>
</div>

<h2>Pros & Cons</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;">
  <div><strong>Pros</strong><ul>${prosHtml}</ul></div>
  <div><strong>Cons</strong><ul>${consHtml}</ul></div>
</div>

<h2>Who Is This For?</h2>
<p><strong>✅ Best for:</strong> ${data.who_its_for}</p>
<p><strong>❌ Not for:</strong> ${data.who_its_not_for}</p>

<h2>Specifications</h2>
${data.specs_table_html}

${sectionsHtml}

<h2>Frequently Asked Questions</h2>
${faqHtml}

<h2>Final Verdict</h2>
<p>${data.conclusion}</p>
<a href="${affiliateUrl}" rel="nofollow sponsored" target="_blank" style="display:inline-block;background:#f97316;color:#fff;padding:14px 28px;border-radius:6px;font-weight:700;text-decoration:none;font-size:1.05rem;">${data.cta_text} →</a>

<script type="application/ld+json">${JSON.stringify(data.schema_markup)}</script>
<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;

        return data;
    } catch {
        return null;
    }
}
