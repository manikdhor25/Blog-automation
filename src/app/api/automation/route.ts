// ============================================================
// RankMaster Pro - Automation Pipeline (CRON-compatible)
// Handles: auto-publish, auto-rank-check, auto-decay-scan
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { applyRankFeedback } from '@/lib/engines/rank-feedback';
import { runQualityControl } from '@/lib/engines/quality-control-engine';
import {
    injectSchemaJsonLD,
    buildSEOMetaFields,
    extractHeroImageUrl,
    generateSEOSlug,
    pingSitemap,
} from '@/lib/utils/seo-utils';

// GET /api/automation?task=publish|rank_check|decay_scan
// Designed to be triggered by Vercel CRON, GitHub Actions, or external scheduler
export async function GET(req: NextRequest) {
    const task = req.nextUrl.searchParams.get('task');
    const secret = req.nextUrl.searchParams.get('secret');

    // Basic auth for CRON endpoints (set CRON_SECRET in env)
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    try {
        switch (task) {
            case 'publish':
                return await handleAutoPublish(supabase);
            case 'rank_check':
                return await handleAutoRankCheck(supabase);
            case 'decay_scan':
                return await handleAutoDecayScan(supabase);
            case 'status':
                return await handleStatus(supabase);
            case 'rank_feedback':
                return NextResponse.json(await applyRankFeedback());
            default:
                return NextResponse.json({
                    available_tasks: ['publish', 'rank_check', 'decay_scan', 'rank_feedback', 'status'],
                    usage: '/api/automation?task=publish&secret=YOUR_CRON_SECRET',
                });
        }
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Automation task failed' },
            { status: 500 }
        );
    }
}

// ==========================================
// Auto-Publish: Process scheduled queue items
// IDEMPOTENT: Uses status='publishing' lock to prevent duplicate WordPress posts
// ==========================================
async function handleAutoPublish(supabase: ReturnType<typeof createServiceRoleClient>) {
    const now = new Date().toISOString();

    // Find scheduled items ready to publish
    // IDEMPOTENCY: Only pick 'scheduled' items without existing wp_post_id
    const { data: items, error } = await supabase
        .from('content_queue')
        .select('*')
        .eq('status', 'scheduled')
        .is('wp_post_id', null)
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(10);

    if (error) throw error;
    if (!items || items.length === 0) {
        return NextResponse.json({ task: 'publish', processed: 0, message: 'No items ready to publish' });
    }

    let published = 0;
    let failed = 0;
    const results: { id: string; title: string; status: string; error?: string }[] = [];

    for (const item of items) {
        try {
            // IDEMPOTENCY LOCK: Atomically transition scheduled → publishing
            const { data: locked, error: lockError } = await supabase
                .from('content_queue')
                .update({ status: 'publishing', updated_at: now })
                .eq('id', item.id)
                .eq('status', 'scheduled')
                .select('id')
                .single();

            if (lockError || !locked) {
                results.push({ id: item.id, title: item.title, status: 'skipped_concurrent' });
                continue;
            }

            if (!item.site_id || !item.content) {
                // Mark as failed if missing required data
                await supabase.from('content_queue')
                    .update({ status: 'failed', updated_at: now })
                    .eq('id', item.id);
                results.push({ id: item.id, title: item.title, status: 'failed', error: 'Missing site_id or content' });
                failed++;
                continue;
            }

            // Get site WordPress credentials
            const { data: site } = await supabase.from('sites').select('*').eq('id', item.site_id).single();
            if (!site || !site.url || !site.wp_username || !site.wp_app_password) {
                await supabase.from('content_queue')
                    .update({ status: 'failed', updated_at: now })
                    .eq('id', item.id);
                results.push({ id: item.id, title: item.title, status: 'failed', error: 'Site missing WP credentials' });
                failed++;
                continue;
            }

            // ── P0 SEO Fix: Inject schema JSON-LD into content ─────
            let publishContent = item.content;
            if (item.schema_markup) {
                try {
                    const schema = typeof item.schema_markup === 'string'
                        ? JSON.parse(item.schema_markup)
                        : item.schema_markup;
                    publishContent = injectSchemaJsonLD(publishContent, schema);
                } catch {
                    // Schema parse error — publish without it
                }
            }

            // ── QC Gate: Check quality before auto-publishing ──────
            if (item.keyword && publishContent) {
                try {
                    const qcReport = runQualityControl({
                        primaryKeyword: item.keyword,
                        secondaryKeywords: [],
                        searchIntent: 'informational',
                        targetAudience: 'general',
                        content: publishContent,
                    });

                    if (qcReport.overallScore < 4.0) {
                        await supabase.from('content_queue')
                            .update({ status: 'failed', updated_at: now })
                            .eq('id', item.id);
                        results.push({
                            id: item.id, title: item.title, status: 'failed',
                            error: `QC gate blocked: score ${qcReport.overallScore}/10 (${qcReport.publishDecision}). ${qcReport.requiredImprovements.slice(0, 2).join('; ')}`,
                        });
                        failed++;
                        continue;
                    }
                } catch (qcErr) {
                    logger.warn('QC gate error during auto-publish — proceeding anyway', { itemId: item.id }, qcErr);
                }
            }

            // ── P0 SEO Fix: Generate SEO slug ──────────────────────
            const seoSlug = generateSEOSlug(item.keyword || item.title || '');

            // ── P0 SEO Fix: Build comprehensive SEO meta fields ────
            const ogImageUrl = extractHeroImageUrl(publishContent);
            const seoFields = buildSEOMetaFields({
                metaTitle: item.meta_title || item.title || '',
                metaDescription: item.meta_description || '',
                focusKeyword: item.keyword || '',
                ogImageUrl: ogImageUrl || undefined,
            });

            // Publish to WordPress
            const wpUrl = `${site.url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
            const auth = Buffer.from(`${site.wp_username}:${site.wp_app_password}`).toString('base64');

            const wpRes = await fetch(wpUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${auth}`,
                },
                body: JSON.stringify({
                    title: item.title || item.keyword,
                    content: publishContent,
                    status: 'publish',
                    slug: seoSlug,
                    meta: seoFields.meta,
                }),
            });

            if (wpRes.ok) {
                const wpPost = await wpRes.json();
                await supabase.from('content_queue')
                    .update({ status: 'published', wp_post_id: wpPost.id, updated_at: now })
                    .eq('id', item.id);

                // Save to posts table
                await supabase.from('posts').insert({
                    site_id: item.site_id,
                    user_id: item.user_id,
                    title: item.title,
                    content: publishContent,
                    keyword: item.keyword,
                    wp_post_id: wpPost.id,
                    wp_url: wpPost.link,
                    slug: seoSlug,
                    status: 'published',
                    score: item.score || 0,
                    meta_title: item.meta_title,
                    meta_description: item.meta_description,
                    schema_markup: item.schema_markup,
                    published_at: now,
                });

                // ── P0 SEO Fix: Ping sitemaps after publish ─────────
                pingSitemap(site.url, wpPost.link).catch(e =>
                    logger.warn('Sitemap ping failed', { siteUrl: site.url }, e)
                );

                published++;
                results.push({ id: item.id, title: item.title, status: 'published' });
            } else {
                const errText = await wpRes.text();
                await supabase.from('content_queue')
                    .update({ status: 'failed', updated_at: now })
                    .eq('id', item.id);
                results.push({ id: item.id, title: item.title, status: 'failed', error: errText.substring(0, 200) });
                failed++;
            }
        } catch (e) {
            // Revert status on error so item can be retried — but cap at 3 retries
            const retryCount = (item.retry_count || 0) + 1;
            try {
                if (retryCount >= 3) {
                    // Max retries reached — permanently fail
                    await supabase.from('content_queue')
                        .update({ status: 'failed', retry_count: retryCount, updated_at: now })
                        .eq('id', item.id);
                    results.push({ id: item.id, title: item.title, status: 'permanently_failed', error: `Max retries (3) exceeded: ${e instanceof Error ? e.message : 'Unknown error'}` });
                } else {
                    await supabase.from('content_queue')
                        .update({ status: 'scheduled', retry_count: retryCount, updated_at: now })
                        .eq('id', item.id);
                    results.push({ id: item.id, title: item.title, status: `retry_${retryCount}/3`, error: e instanceof Error ? e.message : 'Unknown error' });
                }
            } catch { /* Best-effort revert */ }
            failed++;
        }
    }

    return NextResponse.json({
        task: 'publish',
        processed: items.length,
        published,
        failed,
        results,
        timestamp: now,
    });
}

// ==========================================
// Auto-Rank-Check: Daily rank tracking for active sites
// ==========================================
async function handleAutoRankCheck(supabase: ReturnType<typeof createServiceRoleClient>) {
    // Get all active sites
    const { data: sites, error } = await supabase
        .from('sites')
        .select('id, name, url')
        .order('created_at');

    if (error) throw error;
    if (!sites || sites.length === 0) {
        return NextResponse.json({ task: 'rank_check', message: 'No active sites' });
    }

    let totalKeywords = 0;
    let totalChecked = 0;
    const siteResults: { site: string; keywords: number; checked: number }[] = [];

    for (const site of sites) {
        // Get keywords for this site
        const { data: keywords } = await supabase
            .from('keywords')
            .select('id, keyword')
            .eq('site_id', site.id)
            .limit(50);

        if (!keywords || keywords.length === 0) continue;
        totalKeywords += keywords.length;

        try {
            // Trigger rank check via internal API
            const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/rank-tracking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'scheduled_check',
                    site_id: site.id,
                    site_url: site.url,
                    keywords: keywords.map((k: { keyword: string }) => k.keyword),
                }),
            });

            if (res.ok) {
                const data = await res.json();
                totalChecked += data.results?.length || keywords.length;
                siteResults.push({ site: site.name, keywords: keywords.length, checked: data.results?.length || 0 });
            }
        } catch (e) {
            siteResults.push({ site: site.name, keywords: keywords.length, checked: 0 });
            logger.error('Rank check failed', { route: '/api/automation', action: 'rank_check', siteId: site.id }, e);
        }
    }

    return NextResponse.json({
        task: 'rank_check',
        sites: sites.length,
        totalKeywords,
        totalChecked,
        siteResults,
        timestamp: new Date().toISOString(),
    });
}

// ==========================================
// Auto-Decay-Scan: Weekly content freshness check
// P2 SEO Fix: Automatically queues re-optimization for
//             severely decaying content
// ==========================================
async function handleAutoDecayScan(supabase: ReturnType<typeof createServiceRoleClient>) {
    // Get all posts older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: posts, error } = await supabase
        .from('posts')
        .select('id, title, keyword, content, site_id, user_id, score, meta_title, meta_description, published_at, updated_at')
        .lte('published_at', thirtyDaysAgo.toISOString())
        .eq('status', 'published')
        .order('published_at', { ascending: true })
        .limit(100);

    if (error) throw error;
    if (!posts || posts.length === 0) {
        return NextResponse.json({ task: 'decay_scan', message: 'No posts old enough to scan' });
    }

    let decaying = 0;
    let autoOptimized = 0;
    const alerts: { id: string; title: string; age_days: number; reason: string; action: string }[] = [];

    for (const post of posts) {
        const publishedDate = new Date(post.published_at);
        const ageDays = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));

        // Check decay signals
        const reasons: string[] = [];
        let severity: 'low' | 'medium' | 'high' = 'low';

        // Signal 1: No updates in 90+ days
        const lastUpdate = post.updated_at ? new Date(post.updated_at) : publishedDate;
        const daysSinceUpdate = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceUpdate > 90) {
            reasons.push(`No updates in ${daysSinceUpdate} days`);
            severity = 'medium';
        }

        // Signal 2: Low score
        if (post.score && post.score < 50) {
            reasons.push(`Low score: ${post.score}`);
            severity = 'high';
        }

        // Signal 3: Very old content (180+ days)
        if (ageDays > 180) {
            reasons.push(`Content is ${ageDays} days old`);
            if (severity !== 'high') severity = 'medium';
        }

        if (reasons.length > 0) {
            decaying++;
            let action = 'flagged';

            // Flag post for decay
            await supabase.from('posts')
                .update({ decay_alert: true })
                .eq('id', post.id);

            // P2 SEO Fix: Auto-queue re-optimization for severe decay
            // Only auto-optimize high/medium severity, max 3 per scan
            if ((severity === 'high' || severity === 'medium') && autoOptimized < 3 && post.keyword && post.site_id) {
                try {
                    // Check if already queued for optimization
                    const { data: existing } = await supabase
                        .from('content_queue')
                        .select('id')
                        .eq('keyword', post.keyword)
                        .in('status', ['draft', 'scheduled', 'publishing'])
                        .limit(1);

                    if (!existing || existing.length === 0) {
                        await supabase.from('content_queue').insert({
                            user_id: post.user_id,
                            site_id: post.site_id,
                            title: `[REFRESH] ${post.title}`,
                            keyword: post.keyword,
                            content: post.content || null,
                            meta_title: post.meta_title || null,
                            meta_description: post.meta_description || null,
                            status: 'draft',
                            score: post.score || 0,
                            scheduled_at: null,
                        });
                        autoOptimized++;
                        action = 'auto_queued_for_optimization';
                    } else {
                        action = 'already_queued';
                    }
                } catch {
                    action = 'queue_failed';
                }
            }

            alerts.push({
                id: post.id,
                title: post.title,
                age_days: ageDays,
                reason: reasons.join('; '),
                action,
            });
        }
    }

    return NextResponse.json({
        task: 'decay_scan',
        scanned: posts.length,
        decaying,
        autoOptimized,
        alerts,
        timestamp: new Date().toISOString(),
    });
}

// ==========================================
// Status: Get automation health overview
// ==========================================
async function handleStatus(supabase: ReturnType<typeof createServiceRoleClient>) {
    const { count: queueCount } = await supabase
        .from('content_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled');

    const { count: decayCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('decay_alert', true);

    const { count: siteCount } = await supabase
        .from('sites')
        .select('*', { count: 'exact', head: true });

    return NextResponse.json({
        task: 'status',
        scheduled_items: queueCount || 0,
        decaying_posts: decayCount || 0,
        active_sites: siteCount || 0,
        cron_tasks: [
            { task: 'publish', schedule: 'Every 15 minutes', path: '/api/automation?task=publish' },
            { task: 'rank_check', schedule: 'Daily at 6 AM', path: '/api/automation?task=rank_check' },
            { task: 'decay_scan', schedule: 'Weekly (Sunday)', path: '/api/automation?task=decay_scan' },
        ],
        timestamp: new Date().toISOString(),
    });
}
