// ============================================================
// RankMaster Pro - Publish to WordPress API
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createWordPressClient } from '@/lib/wordpress/client';
import { getAuthUser } from '@/lib/auth-guard';
import { ContentPublishSchema } from '@/lib/api-schemas';
import { logger } from '@/lib/logger';
import {
    injectSchemaJsonLD,
    buildSEOMetaFields,
    extractHeroImageUrl,
    generateSEOSlug,
    pingSitemap,
} from '@/lib/utils/seo-utils';
import { runQualityControl } from '@/lib/engines/quality-control-engine';
import { checkFactuality } from '@/lib/engines/factuality-checker';

export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const body = await request.json();
        const parsed = ContentPublishSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const { site_id, post_id, wp_post_id, status, title: rawTitle, content: rawContent, meta_title, meta_description, schema_markup, keyword, quality_metrics, quality_check, secondary_keywords, search_intent, target_audience, force } = parsed.data;
        const title = rawTitle || '';
        const content = rawContent || '';

        // Verify site ownership
        const { data: site, error: siteError } = await auth.supabase
            .from('sites')
            .select('*')
            .eq('id', site_id)
            .eq('user_id', auth.user.id)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        const wp = createWordPressClient(site);

        // ── Quality Control Gate (default: ON) ────────────────────
        // Evaluate content before publishing. Set quality_check=false to skip.
        // If the QC decision is "Reject", block the publish.
        let qcReport = null;
        let factualityReport = null;
        if (quality_check !== false && content && keyword) {
            // Run 9-dimension QC + AI factuality deep check in parallel
            const [qcResult, factResult] = await Promise.all([
                Promise.resolve(runQualityControl({
                    primaryKeyword: keyword,
                    secondaryKeywords: secondary_keywords || [],
                    searchIntent: search_intent || 'informational',
                    targetAudience: target_audience || 'general',
                    content,
                })),
                checkFactuality(content, keyword, { deepCheck: true }).catch(err => {
                    logger.warn('Factuality deep check failed during publish', {}, err);
                    return null;
                }),
            ]);

            qcReport = qcResult;
            factualityReport = factResult;

            logger.info('QC gate evaluated', {
                keyword,
                overall: qcReport.overallScore,
                decision: qcReport.publishDecision,
                rankability: qcReport.rankabilityPrediction,
                factualityScore: factualityReport?.score ?? 'skipped',
            });

            if (qcReport.publishDecision === 'Reject') {
                return NextResponse.json({
                    error: 'Content rejected by quality control',
                    qcReport,
                    ...(factualityReport ? { factualityReport } : {}),
                    requiredImprovements: qcReport.requiredImprovements,
                    message: `Quality score ${qcReport.overallScore}/10 is too low. Fix the listed issues before publishing.`,
                }, { status: 422 });
            }
        }

        // P0 SEO Fix: Inject schema JSON-LD using centralized utility
        let finalContent = content;
        if (schema_markup) {
            finalContent = injectSchemaJsonLD(finalContent, schema_markup);
        }

        // P0 SEO Fix: Generate SEO-optimized slug
        const seoSlug = generateSEOSlug(keyword || title || '');

        let wpPost;

        if (post_id) {
            // ── Case 1: Supabase post_id provided (e.g. from create page) ──
            const { data: existingPost } = await auth.supabase
                .from('posts')
                .select('wp_post_id')
                .eq('id', post_id)
                .single();

            if (existingPost?.wp_post_id) {
                wpPost = await wp.updatePost(existingPost.wp_post_id, {
                    title,
                    content: finalContent,
                    status: status || 'draft',
                    slug: seoSlug,
                });
            } else {
                wpPost = await wp.createPost({
                    title,
                    content: finalContent,
                    status: status || 'draft',
                    slug: seoSlug,
                });
            }

            await auth.supabase.from('posts').update({
                wp_post_id: wpPost.id,
                status: status === 'publish' ? 'published' : (status || 'draft'),
                published_at: status === 'publish' ? new Date().toISOString() : null,
                target_keyword: keyword || '',
                ...(quality_metrics ? { quality_metrics } : {}),
            }).eq('id', post_id);

        } else if (wp_post_id) {
            // ── Case 2: wp_post_id provided (optimize flow — update existing WP post) ──
            wpPost = await wp.updatePost(wp_post_id, {
                title,
                content: finalContent,
                status: status || 'draft',
            });

            // Check if we already track this post in Supabase
            const { data: trackedPost } = await auth.supabase
                .from('posts')
                .select('id')
                .eq('site_id', site_id)
                .eq('wp_post_id', wp_post_id)
                .single();

            const postData = {
                site_id,
                user_id: auth.user.id,
                wp_post_id: wpPost.id,
                title,
                slug: wpPost.slug,
                content_html: finalContent,
                status: status === 'publish' ? 'published' : (status || 'draft'),
                meta_title: meta_title || title,
                meta_description: meta_description || '',
                schema_markup_json: schema_markup || {},
                published_at: status === 'publish' ? new Date().toISOString() : null,
                target_keyword: keyword || '',
                last_optimized_at: new Date().toISOString(),
                ...(quality_metrics ? { quality_metrics } : {}),
            };

            if (trackedPost) {
                // Update existing Supabase record
                await auth.supabase.from('posts').update(postData).eq('id', trackedPost.id);
            } else {
                // Create new Supabase record for this WP post
                await auth.supabase.from('posts').insert(postData);
            }

        } else {
            // ── Case 3: No IDs — create new post (with duplicate guard) ──
            if (!body.force) {
                const slug = title
                    ?.toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '') || '';

                const duplicateChecks = [];

                if (title) {
                    duplicateChecks.push(
                        auth.supabase
                            .from('posts')
                            .select('id, title, slug, status')
                            .eq('site_id', site_id)
                            .ilike('title', title)
                            .limit(1)
                    );
                }

                if (keyword) {
                    duplicateChecks.push(
                        auth.supabase
                            .from('posts')
                            .select('id, title, slug, status')
                            .eq('site_id', site_id)
                            .ilike('keyword', keyword)
                            .limit(1)
                    );
                }

                if (slug) {
                    duplicateChecks.push(
                        auth.supabase
                            .from('posts')
                            .select('id, title, slug, status')
                            .eq('site_id', site_id)
                            .eq('slug', slug)
                            .limit(1)
                    );
                }

                const results = await Promise.all(duplicateChecks);
                const duplicates = results
                    .map(r => r.data?.[0])
                    .filter((d): d is NonNullable<typeof d> => d != null);

                if (duplicates.length > 0) {
                    const dup = duplicates[0]!;
                    return NextResponse.json({
                        error: 'Duplicate post detected',
                        duplicate: {
                            id: dup.id,
                            title: dup.title,
                            slug: dup.slug,
                            status: dup.status,
                        },
                        message: `A post with a similar title, slug, or keyword already exists: "${dup.title}". Set force=true to publish anyway.`,
                    }, { status: 409 });
                }
            }

            wpPost = await wp.createPost({
                title,
                content: finalContent,
                status: status || 'draft',
                slug: seoSlug,
            });

            await auth.supabase.from('posts').insert({
                site_id,
                user_id: auth.user.id,
                wp_post_id: wpPost.id,
                title,
                slug: wpPost.slug,
                content_html: finalContent,
                status: status === 'publish' ? 'published' : (status || 'draft'),
                meta_title: meta_title || title,
                meta_description: meta_description || '',
                schema_markup_json: schema_markup || {},
                published_at: status === 'publish' ? new Date().toISOString() : null,
                target_keyword: keyword || '',
                ...(quality_metrics ? { quality_metrics } : {}),
            });
        }

        // Update SEO meta (Yoast + RankMath) with OG image + focus keyword
        if (meta_title || meta_description || keyword) {
            try {
                // P0 SEO Fix: Build comprehensive meta fields with OG image
                const ogImageUrl = extractHeroImageUrl(finalContent);
                const seoFields = buildSEOMetaFields({
                    metaTitle: meta_title || title,
                    metaDescription: meta_description || '',
                    focusKeyword: keyword || '',
                    ogImageUrl: ogImageUrl || undefined,
                });
                await wp.updatePost(wpPost.id, { meta: seoFields.meta });
            } catch {
                // SEO plugin might not be installed, continue
            }
        }

        // P0 SEO Fix: Ping sitemaps after successful publish
        if (status === 'publish' && site.url) {
            pingSitemap(site.url, wpPost.link).catch(e =>
                logger.warn('Sitemap ping failed', { siteUrl: site.url }, e)
            );
        }

        // ── Update content_records with publish info ──────────
        if (keyword || title) {
            try {
                // Find the most recent content record matching this keyword+site
                const matchQuery = auth.supabase
                    .from('content_records')
                    .select('id')
                    .eq('user_id', auth.user.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (site_id) matchQuery.eq('site_id', site_id);
                if (keyword) matchQuery.eq('keyword', keyword);

                const { data: matchedRecord } = await matchQuery.single();

                if (matchedRecord) {
                    await auth.supabase.from('content_records').update({
                        publish_status: status === 'publish' ? 'published' : 'draft',
                        wp_post_id: wpPost.id,
                        published_at: status === 'publish' ? new Date().toISOString() : null,
                        post_id: post_id || null,
                        updated_at: new Date().toISOString(),
                    }).eq('id', matchedRecord.id);
                }
            } catch (recordErr) {
                console.error('[publish] Failed to update content record:', recordErr);
            }
        }

        return NextResponse.json({
            success: true,
            wpPostId: wpPost.id,
            wpPostUrl: wpPost.link,
            status: wpPost.status,
            ...(qcReport ? { qcReport } : {}),
        });
    } catch (error) {
        logger.error('Publish failed', { route: '/api/content/publish' }, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to publish' },
            { status: 500 }
        );
    }
}
