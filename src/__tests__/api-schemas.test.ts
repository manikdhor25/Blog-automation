/**
 * Unit tests for Zod API validation schemas
 */

// Mock next/server to avoid "Request is not defined" in jsdom
jest.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    },
}));

import {
    ContentGenerateSchema,
    ContentPublishSchema,
    ContentOutlineSchema,
    BacklinkPostSchema,
    ABTestPostSchema,
    validateBody,
} from '@/lib/api-schemas';

describe('validateBody helper', () => {
    it('returns success with parsed data for valid input', () => {
        const result = validateBody(ContentGenerateSchema, { keyword: 'seo tools' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.keyword).toBe('seo tools');
        }
    });

    it('returns error response for invalid input', () => {
        const result = validateBody(ContentGenerateSchema, { keyword: '' });
        expect(result.success).toBe(false);
        if (!result.success) {
            // Zod validation should reject empty keyword
            expect(result.response).toBeDefined();
        }
    });

    it('returns error response for missing required fields', () => {
        const result = validateBody(ContentGenerateSchema, {});
        expect(result.success).toBe(false);
    });
});

describe('ContentGenerateSchema', () => {
    it('accepts valid keyword', () => {
        const result = ContentGenerateSchema.safeParse({ keyword: 'best seo tools 2025' });
        expect(result.success).toBe(true);
    });

    it('rejects empty keyword', () => {
        const result = ContentGenerateSchema.safeParse({ keyword: '' });
        expect(result.success).toBe(false);
    });

    it('rejects keyword over 200 chars', () => {
        const result = ContentGenerateSchema.safeParse({ keyword: 'a'.repeat(201) });
        expect(result.success).toBe(false);
    });

    it('accepts optional site_id as UUID', () => {
        const result = ContentGenerateSchema.safeParse({
            keyword: 'seo',
            site_id: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
    });

    it('rejects invalid site_id format', () => {
        const result = ContentGenerateSchema.safeParse({
            keyword: 'seo',
            site_id: 'not-a-uuid',
        });
        expect(result.success).toBe(false);
    });

    it('accepts valid action enum', () => {
        const result = ContentGenerateSchema.safeParse({
            keyword: 'seo',
            action: 'generate',
        });
        expect(result.success).toBe(true);
    });

    it('rejects invalid action enum', () => {
        const result = ContentGenerateSchema.safeParse({
            keyword: 'seo',
            action: 'invalid_action',
        });
        expect(result.success).toBe(false);
    });
});

describe('ContentPublishSchema', () => {
    it('requires site_id', () => {
        const result = ContentPublishSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('accepts valid publish body', () => {
        const result = ContentPublishSchema.safeParse({
            site_id: '550e8400-e29b-41d4-a716-446655440000',
            status: 'publish',
            title: 'My Post Title',
        });
        expect(result.success).toBe(true);
    });

    it('rejects invalid status enum', () => {
        const result = ContentPublishSchema.safeParse({
            site_id: '550e8400-e29b-41d4-a716-446655440000',
            status: 'archived', // not in enum
        });
        expect(result.success).toBe(false);
    });

    it('rejects meta_title over 120 chars', () => {
        const result = ContentPublishSchema.safeParse({
            site_id: '550e8400-e29b-41d4-a716-446655440000',
            meta_title: 'a'.repeat(121),
        });
        expect(result.success).toBe(false);
    });
});

describe('ContentOutlineSchema', () => {
    it('requires keyword', () => {
        const result = ContentOutlineSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('accepts keyword with optional fields', () => {
        const result = ContentOutlineSchema.safeParse({
            keyword: 'seo tools',
            niche: 'digital marketing',
            existingPosts: ['post-1', 'post-2'],
        });
        expect(result.success).toBe(true);
    });

    it('rejects existingPosts over 50 items', () => {
        const result = ContentOutlineSchema.safeParse({
            keyword: 'seo',
            existingPosts: Array(51).fill('post'),
        });
        expect(result.success).toBe(false);
    });
});

describe('BacklinkPostSchema', () => {
    it('accepts valid action enum values', () => {
        for (const action of ['discover', 'authority', 'gap', 'manual']) {
            const result = BacklinkPostSchema.safeParse({ action });
            expect(result.success).toBe(true);
        }
    });

    it('rejects domain_authority out of range', () => {
        const result = BacklinkPostSchema.safeParse({ domain_authority: 150 });
        expect(result.success).toBe(false);
    });

    it('accepts domain_authority in range 0-100', () => {
        const result = BacklinkPostSchema.safeParse({ domain_authority: 75 });
        expect(result.success).toBe(true);
    });
});

describe('ABTestPostSchema', () => {
    it('requires action field', () => {
        const result = ABTestPostSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('accepts valid create action', () => {
        const result = ABTestPostSchema.safeParse({
            action: 'create',
            test_name: 'Title A/B Test',
            test_type: 'title',
            variants: [{ title: 'A' }, { title: 'B' }],
        });
        expect(result.success).toBe(true);
    });

    it('rejects variants with fewer than 2 items', () => {
        const result = ABTestPostSchema.safeParse({
            action: 'create',
            variants: [{ title: 'Only one' }],
        });
        expect(result.success).toBe(false);
    });

    it('rejects negative impressions', () => {
        const result = ABTestPostSchema.safeParse({
            action: 'update_metrics',
            impressions: -1,
        });
        expect(result.success).toBe(false);
    });
});
