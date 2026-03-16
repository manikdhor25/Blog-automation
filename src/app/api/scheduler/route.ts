// ============================================================
// RankMaster Pro - Scheduler API Route
// Auto-publishes scheduled queue items when scheduled_at has passed
// Designed to be called by an external cron service every 5 minutes
// ============================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';
import { runQualityControl } from '@/lib/engines/quality-control-engine';

// GET /api/scheduler - Process scheduled queue items
// Idempotent: uses status='publishing' lock to prevent duplicate WordPress posts
export async function GET() {
    try {
        const supabase = createServiceRoleClient();
        const now = new Date().toISOString();

        // Find items scheduled to be published now or in the past
        // IDEMPOTENCY: Only pick 'scheduled' items (not 'publishing' or 'published')
        const { data: scheduledItems, error } = await supabase
            .from('content_queue')
            .select('*')
            .eq('status', 'scheduled')
            .is('wp_post_id', null)           // Skip items already published to WP
            .not('scheduled_at', 'is', null)
            .lte('scheduled_at', now)
            .limit(10);                        // Process in batches to avoid timeout

        if (error) throw error;
        if (!scheduledItems || scheduledItems.length === 0) {
            return NextResponse.json({ processed: 0, message: 'No scheduled items ready' });
        }

        const results: { id: string; title: string; status: string; error?: string }[] = [];

        for (const item of scheduledItems) {
            try {
                // IDEMPOTENCY LOCK: Atomically transition scheduled → publishing
                // If another CRON run already picked this item, the update matches 0 rows
                const { data: locked, error: lockError } = await supabase
                    .from('content_queue')
                    .update({ status: 'publishing', updated_at: now })
                    .eq('id', item.id)
                    .eq('status', 'scheduled')  // Only lock if still 'scheduled'
                    .select('id')
                    .single();

                if (lockError || !locked) {
                    // Another process already claimed this item — skip
                    results.push({ id: item.id, title: item.title, status: 'skipped_concurrent' });
                    continue;
                }

                // If item has a site_id, attempt to publish to WordPress
                if (item.site_id) {
                    const { data: site } = await supabase
                        .from('sites')
                        .select('url, wp_username, wp_app_password')
                        .eq('id', item.site_id)
                        .single();

                    if (site?.wp_username && site?.wp_app_password) {
                        // QC Gate: Check content quality before publishing
                        if (item.keyword && item.content) {
                            try {
                                const qcReport = runQualityControl({
                                    primaryKeyword: item.keyword,
                                    secondaryKeywords: [],
                                    searchIntent: 'informational',
                                    targetAudience: 'general',
                                    content: item.content,
                                });
                                if (qcReport.overallScore < 4.0) {
                                    await supabase.from('content_queue')
                                        .update({ status: 'failed', updated_at: now })
                                        .eq('id', item.id);
                                    results.push({
                                        id: item.id, title: item.title, status: 'qc_blocked',
                                        error: `QC score ${qcReport.overallScore}/10 — ${qcReport.publishDecision}`,
                                    });
                                    continue;
                                }
                            } catch {
                                // QC failure is non-blocking — proceed with publish
                            }
                        }

                        const wpRes = await fetch(`${site.url.replace(/\/$/, '')}/wp-json/wp/v2/posts`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Basic ${Buffer.from(`${site.wp_username}:${site.wp_app_password}`).toString('base64')}`,
                            },
                            body: JSON.stringify({
                                title: item.title,
                                content: item.content,
                                status: 'publish',
                            }),
                        });

                        if (wpRes.ok) {
                            const wpData = await wpRes.json();
                            await supabase.from('content_queue')
                                .update({ status: 'published', wp_post_id: wpData.id, updated_at: now })
                                .eq('id', item.id);
                            results.push({ id: item.id, title: item.title, status: 'published' });
                            continue;
                        } else {
                            // WP publish failed — revert to 'scheduled' for retry
                            const errText = await wpRes.text().catch(() => 'Unknown WP error');
                            await supabase.from('content_queue')
                                .update({ status: 'scheduled', updated_at: now })
                                .eq('id', item.id);
                            results.push({ id: item.id, title: item.title, status: 'wp_failed', error: errText.substring(0, 200) });
                            continue;
                        }
                    }
                }

                // If no WordPress or no credentials, mark as ready
                await supabase.from('content_queue')
                    .update({ status: 'ready', updated_at: now })
                    .eq('id', item.id);
                results.push({ id: item.id, title: item.title, status: 'ready' });
            } catch (err) {
                // On error, revert status so item can be retried — cap at 3
                const retryCount = (item.retry_count || 0) + 1;
                try {
                    if (retryCount >= 3) {
                        await supabase.from('content_queue')
                            .update({ status: 'failed', retry_count: retryCount, updated_at: now })
                            .eq('id', item.id);
                        results.push({ id: item.id, title: item.title, status: 'permanently_failed', error: `Max retries exceeded: ${err instanceof Error ? err.message : 'Unknown error'}` });
                    } else {
                        await supabase.from('content_queue')
                            .update({ status: 'scheduled', retry_count: retryCount, updated_at: now })
                            .eq('id', item.id);
                        results.push({ id: item.id, title: item.title, status: `retry_${retryCount}/3`, error: err instanceof Error ? err.message : 'Unknown error' });
                    }
                } catch { /* Best-effort revert */ }
            }
        }

        return NextResponse.json({
            processed: results.length,
            results,
            timestamp: now,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Scheduler failed' },
            { status: 500 }
        );
    }
}
