// ============================================================
// RankMaster Pro - Product Data Engine
// Amazon PA-API + manual product entry for affiliate posts
// ============================================================

import { createHash, createHmac } from 'crypto';

export interface ProductData {
    asin?: string;
    title: string;
    description: string;
    price: number | null;
    currency: string;
    rating: number | null;
    review_count: number | null;
    image_url: string | null;
    product_url: string;
    affiliate_url?: string;
    availability: 'in_stock' | 'out_of_stock' | 'unknown';
    features: string[];
    brand: string | null;
    category: string | null;
    fetched_at: string;
    source: 'amazon_api' | 'manual' | 'scraped';
}

export interface ComparisonProduct extends ProductData {
    pros: string[];
    cons: string[];
    verdict: string;
    score: number;
    badge?: string;
}

// Per-marketplace host for PA-API v5. Region is paired with the host;
// us-east-1 / eu-west-1 / us-west-2 cover the major marketplaces.
const PAAPI_HOST = 'webservices.amazon.com';
const PAAPI_SERVICE = 'ProductAdvertisingAPI';
const PAAPI_PATH = '/paapi5/getitems';

function hmac(key: Buffer | string, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
}

// Amazon PA-API v5 integration — full AWS Signature V4 signing.
export async function fetchAmazonProduct(
    asin: string,
    associatesTag: string,
    accessKey: string,
    secretKey: string,
    region = 'us-east-1'
): Promise<ProductData | null> {
    try {
        const endpoint = `https://${PAAPI_HOST}${PAAPI_PATH}`;
        const payload = {
            ItemIds: [asin],
            PartnerTag: associatesTag,
            PartnerType: 'Associates',
            Marketplace: 'www.amazon.com',
            Resources: [
                'ItemInfo.Title',
                'ItemInfo.Features',
                'ItemInfo.ByLineInfo',
                'ItemInfo.Classifications',
                'Offers.Listings.Price',
                'Images.Primary.Large',
                'CustomerReviews.Count',
                'CustomerReviews.StarRating',
            ],
        };
        const body = JSON.stringify(payload);

        // ── AWS Signature V4 ──────────────────────────────────────
        const amzTarget = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
        const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
        const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

        // Canonical headers must be sorted by lowercase name and match SignedHeaders.
        const canonicalHeaders =
            `content-encoding:amz-1.0\n` +
            `host:${PAAPI_HOST}\n` +
            `x-amz-date:${amzDate}\n` +
            `x-amz-target:${amzTarget}\n`;
        const signedHeaders = 'content-encoding;host;x-amz-date;x-amz-target';

        const canonicalRequest = [
            'POST',
            PAAPI_PATH,
            '', // canonical query string (none)
            canonicalHeaders,
            signedHeaders,
            sha256Hex(body),
        ].join('\n');

        const credentialScope = `${dateStamp}/${region}/${PAAPI_SERVICE}/aws4_request`;
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            sha256Hex(canonicalRequest),
        ].join('\n');

        const kDate = hmac(`AWS4${secretKey}`, dateStamp);
        const kRegion = hmac(kDate, region);
        const kService = hmac(kRegion, PAAPI_SERVICE);
        const kSigning = hmac(kService, 'aws4_request');
        const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

        const authorization =
            `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
            `SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-encoding': 'amz-1.0',
                'content-type': 'application/json; charset=utf-8',
                host: PAAPI_HOST,
                'x-amz-date': amzDate,
                'x-amz-target': amzTarget,
                Authorization: authorization,
            },
            body,
        });

        if (!res.ok) return null;
        const data = await res.json();
        const item = data?.ItemsResult?.Items?.[0];
        if (!item) return null;

        const price = item.Offers?.Listings?.[0]?.Price;
        const images = item.Images?.Primary?.Large;
        const info = item.ItemInfo;

        return {
            asin,
            title: info?.Title?.DisplayValue || '',
            description: info?.Features?.DisplayValues?.join(' ') || '',
            price: price?.Amount ? parseFloat(price.Amount) : null,
            currency: price?.Currency || 'USD',
            rating: item.CustomerReviews?.StarRating?.Value || null,
            review_count: item.CustomerReviews?.Count || null,
            image_url: images?.URL || null,
            product_url: `https://www.amazon.com/dp/${asin}`,
            affiliate_url: `https://www.amazon.com/dp/${asin}?tag=${associatesTag}`,
            availability: price ? 'in_stock' : 'unknown',
            features: info?.Features?.DisplayValues || [],
            brand: info?.ByLineInfo?.Brand?.DisplayValue || null,
            category: info?.Classifications?.ProductGroup?.DisplayValue || null,
            fetched_at: new Date().toISOString(),
            source: 'amazon_api',
        };
    } catch {
        return null;
    }
}

// AI-powered product data extraction from URL (fallback)
export async function extractProductFromUrl(url: string): Promise<Partial<ProductData>> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankMaster/1.0)' },
            signal: AbortSignal.timeout(8000),
        });
        const html = await res.text();

        // Extract structured data (JSON-LD)
        const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
        for (const block of jsonLdMatches) {
            try {
                const content = block.replace(/<script[^>]*>|<\/script>/g, '').trim();
                const parsed = JSON.parse(content);
                const product = Array.isArray(parsed) ? parsed.find(p => p['@type'] === 'Product') : parsed;
                if (product?.['@type'] === 'Product') {
                    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                    return {
                        title: product.name || '',
                        description: product.description || '',
                        price: offer?.price ? parseFloat(offer.price) : null,
                        currency: offer?.priceCurrency || 'USD',
                        rating: product.aggregateRating?.ratingValue ? parseFloat(product.aggregateRating.ratingValue) : null,
                        review_count: product.aggregateRating?.reviewCount || null,
                        image_url: typeof product.image === 'string' ? product.image : product.image?.[0] || null,
                        product_url: url,
                        brand: product.brand?.name || null,
                        availability: offer?.availability?.includes('InStock') ? 'in_stock' : 'unknown',
                        features: [],
                        fetched_at: new Date().toISOString(),
                        source: 'scraped',
                    };
                }
            } catch { /* skip malformed JSON-LD */ }
        }

        // Fallback: meta tags
        const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
        const descMatch = html.match(/<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]+)"/i);

        return {
            title: titleMatch?.[1] || '',
            description: descMatch?.[1] || '',
            image_url: imgMatch?.[1] || null,
            product_url: url,
            price: null,
            currency: 'USD',
            rating: null,
            review_count: null,
            availability: 'unknown',
            features: [],
            brand: null,
            category: null,
            fetched_at: new Date().toISOString(),
            source: 'scraped',
        };
    } catch {
        return { product_url: url, fetched_at: new Date().toISOString(), source: 'scraped' };
    }
}
