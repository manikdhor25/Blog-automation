import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ValidateSchema = z.object({
    action: z.literal('validate'),
    schema_json: z.string().min(10),
    post_url: z.string().url().optional(),
});

const GenerateSchema = z.object({
    action: z.literal('generate'),
    schema_type: z.enum(['Article', 'HowTo', 'FAQPage', 'Review', 'Product', 'BreadcrumbList', 'Organization', 'WebSite', 'VideoObject', 'Recipe']),
    data: z.record(z.string(), z.unknown()),
    post_id: z.string().uuid().optional(),
});

const REQUIRED_FIELDS: Record<string, string[]> = {
    Article: ['@type', '@context', 'headline', 'author', 'datePublished'],
    HowTo: ['@type', '@context', 'name', 'step'],
    FAQPage: ['@type', '@context', 'mainEntity'],
    Review: ['@type', '@context', 'itemReviewed', 'reviewRating', 'author'],
    Product: ['@type', '@context', 'name', 'offers'],
    BreadcrumbList: ['@type', '@context', 'itemListElement'],
    Organization: ['@type', '@context', 'name'],
    WebSite: ['@type', '@context', 'name', 'url'],
    VideoObject: ['@type', '@context', 'name', 'description', 'thumbnailUrl', 'uploadDate'],
    Recipe: ['@type', '@context', 'name', 'recipeIngredient', 'recipeInstructions'],
};

export async function POST(req: NextRequest) {
    await getAuthUser(req);
    const body = await req.json();

    if (body.action === 'validate') {
        const parsed = ValidateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        let schema: Record<string, unknown>;
        const errors: Array<{ field: string; severity: 'error' | 'warning'; message: string }> = [];
        const warnings: string[] = [];
        const suggestions: string[] = [];

        try {
            schema = JSON.parse(parsed.data.schema_json);
        } catch {
            return NextResponse.json({ valid: false, errors: [{ field: 'json', severity: 'error', message: 'Invalid JSON syntax' }] });
        }

        // Check @context
        if (!schema['@context']) errors.push({ field: '@context', severity: 'error', message: 'Missing @context (should be "https://schema.org")' });
        else if (schema['@context'] !== 'https://schema.org' && schema['@context'] !== 'http://schema.org') warnings.push('@context should be "https://schema.org"');

        // Check @type
        const schemaType = schema['@type'] as string;
        if (!schemaType) {
            errors.push({ field: '@type', severity: 'error', message: 'Missing @type field' });
        } else {
            const required = REQUIRED_FIELDS[schemaType] || [];
            for (const field of required) {
                if (!schema[field] && field !== '@context' && field !== '@type') {
                    errors.push({ field, severity: 'error', message: `Missing required field: "${field}" for ${schemaType}` });
                }
            }

            // Type-specific warnings
            if (schemaType === 'Article') {
                if (!schema['image']) warnings.push('Article: "image" recommended for rich results');
                if (!schema['description']) warnings.push('Article: "description" recommended');
                if (!schema['dateModified']) suggestions.push('Add "dateModified" to show content freshness');
                if (!schema['wordCount']) suggestions.push('Add "wordCount" for better indexing');
            }
            if (schemaType === 'Review') {
                const rating = schema['reviewRating'] as Record<string, unknown>;
                if (rating && (!rating['ratingValue'] || !rating['bestRating'])) {
                    errors.push({ field: 'reviewRating', severity: 'error', message: 'reviewRating needs ratingValue and bestRating' });
                }
            }
            if (schemaType === 'Product') {
                const offers = schema['offers'] as Record<string, unknown>;
                if (offers && !offers['price'] && !offers['priceRange']) {
                    warnings.push('Product offers should include price or priceRange');
                }
                if (!schema['aggregateRating']) suggestions.push('Add aggregateRating to show star ratings in SERP');
            }
            if (schemaType === 'HowTo') {
                const steps = schema['step'] as unknown[];
                if (Array.isArray(steps) && steps.length === 0) errors.push({ field: 'step', severity: 'error', message: 'HowTo must have at least one step' });
                if (!schema['totalTime']) suggestions.push('Add "totalTime" (e.g., "PT30M") for rich results');
                if (!schema['estimatedCost']) suggestions.push('Add "estimatedCost" if applicable');
            }
        }

        const isValid = errors.length === 0;
        const richResultEligible = isValid && warnings.length === 0;

        return NextResponse.json({
            valid: isValid, errors, warnings, suggestions,
            rich_result_eligible: richResultEligible,
            schema_type: schemaType,
            google_test_url: parsed.data.post_url ? `https://search.google.com/test/rich-results?url=${encodeURIComponent(parsed.data.post_url)}` : null,
        });
    }

    if (body.action === 'generate') {
        const parsed = GenerateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const prompt = `Generate complete, valid JSON-LD schema markup for a ${d.schema_type}.

Input data: ${JSON.stringify(d.data)}

Requirements:
- Complete and valid JSON-LD
- Include @context and @type
- Fill all required fields
- Include recommended optional fields
- Use real Google-recommended structure

Return ONLY the JSON object, no explanation, no markdown code blocks.`;

        const { text, provider } = await routeAI({ task: 'content_writing', prompt, json: true });
        let generated;
        try {
            const cleaned = text.replace(/^```json\n?|^```\n?|\n?```$/g, '').trim();
            generated = JSON.parse(cleaned);
        } catch {
            return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
        }

        return NextResponse.json({ generated, schema_string: JSON.stringify(generated, null, 2), provider });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
