// ============================================================
// RankMaster Pro - Zod Input Validation Schemas
// Shared schemas for API route request body validation
// ============================================================

import { z } from 'zod';
import { NextResponse } from 'next/server';

// ── Reusable primitives ──────────────────────────────────────

const uuid = z.string().uuid();
const keyword = z.string().min(1, 'Keyword is required').max(200, 'Keyword too long');
const language = z.string().min(2).max(10).default('en');
const contentTypeEnum = z.enum([
    'article', 'review', 'how_to', 'listicle', 'comparison',
    'alternatives', 'beginner_guide', 'problem_solution', 'case_study', 'news',
]).default('article');


// ── Helper: parse body or return 400 ─────────────────────────

export function validateBody<T extends z.ZodTypeAny>(
    schema: T,
    body: unknown,
): { success: true; data: z.infer<T> } | { success: false; response: NextResponse } {
    const result = schema.safeParse(body);
    if (!result.success) {
        return {
            success: false,
            response: NextResponse.json(
                {
                    error: 'Validation failed',
                    details: result.error.flatten().fieldErrors,
                },
                { status: 400 },
            ),
        };
    }
    return { success: true, data: result.data };
}

// ── Content: Generate ────────────────────────────────────────

export const ContentGenerateSchema = z.object({
    keyword,
    site_id: uuid.optional(),
    action: z.enum(['generate', 'research_only']).optional(),
    language: language.optional(),
    is_cluster: z.boolean().optional(),
    content_type: contentTypeEnum.optional(),
});

// ── Content: Publish ─────────────────────────────────────────

export const ContentPublishSchema = z.object({
    site_id: uuid,
    post_id: uuid.optional(),
    wp_post_id: z.number().int().positive().optional(),
    status: z.enum(['draft', 'publish', 'pending', 'private']).optional(),
    title: z.string().max(500).optional(),
    content: z.string().optional(),
    meta_title: z.string().max(120).optional(),
    meta_description: z.string().max(500).optional(),
    schema_markup: z.record(z.string(), z.unknown()).optional(),
    keyword: z.string().max(200).optional(),
    quality_metrics: z.record(z.string(), z.unknown()).optional(),
    quality_check: z.boolean().optional(),
    force: z.boolean().optional(),
    secondary_keywords: z.array(z.string()).optional(),
    search_intent: z.string().max(50).optional(),
    target_audience: z.string().max(100).optional(),
});

// ── Content: Outline ─────────────────────────────────────────

export const ContentOutlineSchema = z.object({
    keyword,
    niche: z.string().max(200).optional(),
    existingPosts: z.array(z.string()).max(50).optional(),
    content_type: contentTypeEnum.optional(),
});

// ── Backlinks ────────────────────────────────────────────────

export const BacklinkPostSchema = z.object({
    action: z.enum(['discover', 'authority', 'gap', 'manual']).optional(),
    site_id: uuid.optional(),
    source_url: z.string().optional(),
    target_url: z.string().optional(),
    anchor_text: z.string().max(500).optional(),
    link_type: z.enum(['dofollow', 'nofollow', 'ugc', 'sponsored']).optional(),
    status: z.string().max(50).optional(),
    domain_authority: z.number().min(0).max(100).optional(),
    domain: z.string().max(253).optional(),
    your_domain: z.string().max(253).optional(),
    competitor_domain: z.string().max(253).optional(),
});

// ── A/B Tests ────────────────────────────────────────────────

export const ABTestPostSchema = z.object({
    action: z.enum(['create', 'update_metrics', 'switch_variant', 'declare_winner']),
    test_id: uuid.optional(),
    variant_id: z.string().max(100).optional(),
    winner_id: z.string().max(100).optional(),
    post_id: uuid.optional(),
    site_id: uuid.optional(),
    test_name: z.string().max(200).optional(),
    test_type: z.enum(['title', 'meta', 'content']).optional(),
    variants: z.array(z.record(z.string(), z.unknown())).min(2).optional(),
    min_impressions: z.number().int().positive().optional(),
    auto_optimize: z.boolean().optional(),
    impressions: z.number().int().min(0).optional(),
    clicks: z.number().int().min(0).optional(),
    avg_position: z.number().min(0).optional(),
});

// ── Affiliates ───────────────────────────────────────────────

export const AffiliatePostSchema = z.object({
    action: z.enum(['create_program', 'create_link', 'log_revenue', 'track_click']),
    name: z.string().max(200).optional(),
    network: z.string().max(100).optional(),
    commission_rate: z.number().min(0).optional(),
    commission_type: z.enum(['percentage', 'flat']).optional(),
    cookie_duration: z.number().int().min(0).optional(),
    signup_url: z.string().max(2048).optional(),
    notes: z.string().max(5000).optional(),
    program_id: uuid.optional(),
    site_id: uuid.optional(),
    post_id: uuid.optional(),
    original_url: z.string().max(2048).optional(),
    affiliate_url: z.string().max(2048).optional(),
    anchor_text: z.string().max(500).optional(),
    utm_source: z.string().max(100).optional(),
    utm_medium: z.string().max(100).optional(),
    utm_campaign: z.string().max(200).optional(),
    page_type: z.enum(['money', 'info', 'review', 'comparison']).optional(),
    link_id: uuid.optional(),
    month: z.string().max(20).optional(),
    amount: z.number().min(0).optional(),
    clicks: z.number().int().min(0).optional(),
    conversions: z.number().int().min(0).optional(),
});

// ── Cloaked Links ────────────────────────────────────────────

export const CloakedLinkSchema = z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    destination_url: z.string().url(),
    label: z.string().max(200).optional(),
    program_id: uuid.optional(),
    post_id: uuid.optional(),
    redirect_type: z.enum(['permanent', 'temporary']).default('permanent'),
    nofollow: z.boolean().default(true),
    sponsored: z.boolean().default(true),
    geo_rules: z.record(z.string(), z.string()).optional(),
    notes: z.string().max(1000).optional(),
});

// ── Social Publishing ────────────────────────────────────────

export const SocialPublishSchema = z.object({
    action: z.enum(['generate_content', 'publish', 'schedule', 'list', 'delete']),
    platform: z.enum(['pinterest', 'twitter', 'linkedin', 'all']).optional(),
    post_id: uuid.optional(),
    blog_title: z.string().max(500).optional(),
    blog_excerpt: z.string().max(2000).optional(),
    blog_url: z.string().url().optional(),
    blog_keyword: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    content: z.string().max(3000).optional(),
    image_url: z.string().optional(),
    scheduled_at: z.string().optional(),
    id: uuid.optional(),
});

// ── Outreach CRM ─────────────────────────────────────────────

export const OutreachSchema = z.object({
    action: z.enum(['create_prospect', 'update_status', 'generate_email', 'log_response', 'list', 'delete', 'stats']),
    id: uuid.optional(),
    domain: z.string().max(253).optional(),
    contact_name: z.string().max(200).optional(),
    contact_email: z.string().email().optional(),
    domain_authority: z.number().min(0).max(100).optional(),
    niche: z.string().max(200).optional(),
    target_keyword: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    status: z.enum(['prospect', 'contacted', 'replied', 'negotiating', 'placed', 'rejected', 'ghosted']).optional(),
    your_name: z.string().max(200).optional(),
    your_site_url: z.string().max(500).optional(),
    pitch_angle: z.string().max(500).optional(),
    response_notes: z.string().max(2000).optional(),
    placed_url: z.string().max(2048).optional(),
    placed_anchor: z.string().max(500).optional(),
});

// ── Comparison Table ─────────────────────────────────────────

export const ComparisonSchema = z.object({
    action: z.enum(['generate', 'save', 'list', 'delete']),
    title: z.string().max(500).optional(),
    keyword: z.string().max(200).optional(),
    products: z.array(z.object({
        name: z.string(),
        affiliate_url: z.string().optional(),
        price: z.number().nullable().optional(),
        rating: z.number().nullable().optional(),
    })).min(2).max(10).optional(),
    criteria: z.array(z.string()).max(20).optional(),
    post_id: uuid.optional(),
    id: uuid.optional(),
});

// ── Ad Revenue ───────────────────────────────────────────────

export const AdRevenueSchema = z.object({
    action: z.enum(['log_revenue', 'list', 'delete', 'sync_adsense', 'get_summary']),
    network: z.enum(['adsense', 'mediavine', 'ezoic', 'raptive', 'adthrive', 'manual']).optional(),
    site_id: uuid.optional(),
    date: z.string().optional(),
    impressions: z.number().int().min(0).optional(),
    clicks: z.number().int().min(0).optional(),
    rpm: z.number().min(0).optional(),
    epmv: z.number().min(0).optional(),
    revenue: z.number().min(0).optional(),
    sessions: z.number().int().min(0).optional(),
    notes: z.string().max(500).optional(),
    id: uuid.optional(),
});
