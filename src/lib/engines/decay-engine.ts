// ============================================================
// RankMaster Pro - Content Decay Detection Engine
// Monitors published posts for ranking drops and staleness
// ============================================================

import { createServiceRoleClient } from '../supabase';

export interface DecayReport {
    postId: string;
    title: string;
    slug: string;
    siteId: string;
    publishedAt: string;
    daysSincePublish: number;
    daysSinceOptimize: number | null;
    currentScore: number;
    decayReason: DecayReason[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    suggestedAction: string;
}

export type DecayReason =
    | 'stale_content'         // > 6 months since publish/update
    | 'outdated_year'         // references old years
    | 'low_score'             // overall score below threshold
    | 'no_recent_update'      // > 90 days since last optimization
    | 'missing_schema'        // no schema markup
    | 'thin_content'          // word count below competitor average
    | 'broken_eeat';          // EEAT score critically low

export class ContentDecayEngine {
    // Scan all published posts for decay signals
    async scanForDecay(siteId?: string): Promise<DecayReport[]> {
        const supabase = createServiceRoleClient();
        const reports: DecayReport[] = [];

        let query = supabase
            .from('posts')
            .select('id, title, slug, site_id, content_html, status, published_at, last_optimized_at, overall_score, eeat_score, schema_markup_json, word_count')
            .eq('status', 'publish');

        if (siteId) {
            query = query.eq('site_id', siteId);
        }

        const { data: posts } = await query;
        if (!posts || posts.length === 0) return [];

        const now = Date.now();

        for (const post of posts) {
            const decayReasons: DecayReason[] = [];
            const publishedAt = post.published_at ? new Date(post.published_at).getTime() : now;
            const daysSincePublish = Math.floor((now - publishedAt) / (1000 * 60 * 60 * 24));
            const lastOptimized = post.last_optimized_at ? new Date(post.last_optimized_at).getTime() : null;
            const daysSinceOptimize = lastOptimized ? Math.floor((now - lastOptimized) / (1000 * 60 * 60 * 24)) : null;

            // Check: Stale content (> 180 days without update)
            const lastTouched = lastOptimized || publishedAt;
            const daysSinceLastTouch = Math.floor((now - lastTouched) / (1000 * 60 * 60 * 24));
            if (daysSinceLastTouch > 180) {
                decayReasons.push('stale_content');
            }

            // Check: No recent optimization (> 90 days)
            if (daysSinceOptimize === null || daysSinceOptimize > 90) {
                decayReasons.push('no_recent_update');
            }

            // Check: Overall score below threshold
            if ((post.overall_score || 0) < 50) {
                decayReasons.push('low_score');
            }

            // Check: EEAT score critically low
            if ((post.eeat_score || 0) < 30) {
                decayReasons.push('broken_eeat');
            }

            // Check: Missing schema
            if (!post.schema_markup_json || Object.keys(post.schema_markup_json).length === 0) {
                decayReasons.push('missing_schema');
            }

            // Check: Thin content
            if ((post.word_count || 0) < 800) {
                decayReasons.push('thin_content');
            }

            // Check: Outdated year references
            if (post.content_html) {
                const currentYear = new Date().getFullYear();
                const hasOldYear = new RegExp(`\\b(${currentYear - 2}|${currentYear - 3})\\b`).test(post.content_html);
                const hasCurrentYear = new RegExp(`\\b${currentYear}\\b`).test(post.content_html);
                if (hasOldYear && !hasCurrentYear) {
                    decayReasons.push('outdated_year');
                }
            }

            // Only report if there are decay reasons
            if (decayReasons.length > 0) {
                const severity = this.calculateSeverity(decayReasons, daysSinceLastTouch);

                reports.push({
                    postId: post.id,
                    title: post.title,
                    slug: post.slug || '',
                    siteId: post.site_id,
                    publishedAt: post.published_at || '',
                    daysSincePublish,
                    daysSinceOptimize,
                    currentScore: post.overall_score || 0,
                    decayReason: decayReasons,
                    severity,
                    suggestedAction: this.getSuggestedAction(decayReasons, severity),
                });
            }
        }

        // Sort by severity (critical first)
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        reports.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return reports;
    }

    // Update decay alerts in the database
    async updateDecayAlerts(siteId?: string): Promise<{ updated: number; alerts: number }> {
        const supabase = createServiceRoleClient();
        const reports = await this.scanForDecay(siteId);

        // Get all published posts to reset alerts
        let query = supabase
            .from('posts')
            .select('id')
            .eq('status', 'publish');

        if (siteId) {
            query = query.eq('site_id', siteId);
        }

        const { data: allPosts } = await query;
        const alertPostIds = new Set(reports.filter(r => r.severity === 'high' || r.severity === 'critical').map(r => r.postId));

        let updated = 0;
        for (const post of allPosts || []) {
            const shouldAlert = alertPostIds.has(post.id);
            await supabase
                .from('posts')
                .update({
                    decay_alert: shouldAlert,
                    last_decay_check: new Date().toISOString(),
                })
                .eq('id', post.id);
            updated++;
        }

        return { updated, alerts: alertPostIds.size };
    }

    private calculateSeverity(reasons: DecayReason[], daysSinceTouch: number): 'low' | 'medium' | 'high' | 'critical' {
        if (reasons.length >= 4 || (reasons.includes('stale_content') && reasons.includes('low_score'))) {
            return 'critical';
        }
        if (reasons.length >= 3 || reasons.includes('broken_eeat') || daysSinceTouch > 365) {
            return 'high';
        }
        if (reasons.length >= 2 || daysSinceTouch > 180) {
            return 'medium';
        }
        return 'low';
    }

    private getSuggestedAction(reasons: DecayReason[], severity: string): string {
        if (severity === 'critical') {
            return 'Full content refresh required: re-optimize with current competitor data, update statistics, add missing schema, and strengthen EEAT signals';
        }
        if (reasons.includes('stale_content') || reasons.includes('outdated_year')) {
            return 'Update content with current year data, refresh statistics, and re-publish with new date';
        }
        if (reasons.includes('broken_eeat')) {
            return 'Add author box, cite authoritative sources, include expert quotes and first-person experience';
        }
        if (reasons.includes('missing_schema')) {
            return 'Re-optimize to generate and inject schema markup (BlogPosting, FAQ, HowTo)';
        }
        if (reasons.includes('thin_content')) {
            return 'Expand content to match or exceed competitor word count; add FAQ and comparison tables';
        }
        return 'Schedule content optimization to improve scores and freshness signals';
    }
}

import { createSingleton } from '../singleton';

export const getContentDecayEngine = createSingleton(() => new ContentDecayEngine());
