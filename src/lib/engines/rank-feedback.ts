// ============================================================
// RankMaster Pro - Rank → Score Feedback Engine
// Uses real ranking data to recalibrate content scores over time,
// enabling a self-improving content optimization loop.
// ============================================================

import { createServiceRoleClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface RankFeedback {
    postId: string;
    currentScore: number;
    adjustedScore: number;
    avgPosition: number;
    positionTrend: 'improving' | 'stable' | 'declining';
    factors: string[];
}

/**
 * Analyses rank tracking data and adjusts content scores accordingly.
 * High-ranking content with low scores → boost score (underrated).
 * Low-ranking content with high scores → lower score (overrated).
 */
export async function computeRankFeedback(siteId?: string): Promise<RankFeedback[]> {
    const supabase = createServiceRoleClient();
    const log = logger.child({ route: 'rank-feedback', siteId });

    // 1. Fetch posts with rank history
    let postsQuery = supabase
        .from('posts')
        .select('id, title, overall_score, target_keyword, site_id')
        .not('target_keyword', 'is', null)
        .gt('overall_score', 0);

    if (siteId) postsQuery = postsQuery.eq('site_id', siteId);

    const { data: posts, error: postsError } = await postsQuery;
    if (postsError || !posts?.length) {
        log.info('No scorable posts found');
        return [];
    }

    const feedbacks: RankFeedback[] = [];

    for (const post of posts) {
        // 2. Get recent rank data for this keyword
        const { data: ranks } = await supabase
            .from('rank_history')
            .select('position, checked_at')
            .eq('keyword', post.target_keyword)
            .eq('site_id', post.site_id)
            .order('checked_at', { ascending: false })
            .limit(14); // Last 14 checks (~2 weeks)

        if (!ranks || ranks.length < 2) continue;

        const positions = ranks.map(r => r.position).filter(p => p > 0);
        if (positions.length === 0) continue;

        const avgPosition = positions.reduce((a, b) => a + b, 0) / positions.length;
        const recentAvg = positions.slice(0, Math.ceil(positions.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(positions.length / 2);
        const olderAvg = positions.slice(Math.ceil(positions.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(positions.length / 2);

        const positionTrend: 'improving' | 'stable' | 'declining' =
            recentAvg < olderAvg - 2 ? 'improving' :
                recentAvg > olderAvg + 2 ? 'declining' : 'stable';

        // 3. Calculate score adjustment
        const currentScore = post.overall_score || 0;
        let adjustment = 0;
        const factors: string[] = [];

        // Position-based calibration (the "reality check")
        if (avgPosition <= 3 && currentScore < 80) {
            // Top 3 ranking but low score → content is underrated
            adjustment += Math.min(15, 80 - currentScore);
            factors.push(`Top-3 ranking (avg ${avgPosition.toFixed(1)}) suggests higher score`);
        } else if (avgPosition <= 10 && currentScore < 60) {
            adjustment += Math.min(10, 60 - currentScore);
            factors.push(`Page-1 ranking with low score — adjusting up`);
        } else if (avgPosition > 30 && currentScore > 80) {
            // High score but poor ranking → content is overrated
            adjustment -= Math.min(15, currentScore - 65);
            factors.push(`Low ranking (avg ${avgPosition.toFixed(1)}) despite high score — adjusting down`);
        } else if (avgPosition > 20 && currentScore > 70) {
            adjustment -= Math.min(8, currentScore - 60);
            factors.push(`Below page-2 with high score — slight downward adjustment`);
        }

        // Trend bonus/penalty
        if (positionTrend === 'improving') {
            adjustment += 3;
            factors.push('Ranking trend improving (+3)');
        } else if (positionTrend === 'declining') {
            adjustment -= 3;
            factors.push('Ranking trend declining (-3)');
        }

        if (adjustment === 0) continue;

        const adjustedScore = Math.max(0, Math.min(100, currentScore + adjustment));

        feedbacks.push({
            postId: post.id,
            currentScore,
            adjustedScore: Math.round(adjustedScore),
            avgPosition: Math.round(avgPosition * 10) / 10,
            positionTrend,
            factors,
        });
    }

    log.info('Rank feedback computed', { postsAnalyzed: posts.length, adjustments: feedbacks.length });
    return feedbacks;
}

/**
 * Apply rank feedback adjustments to the database.
 * Updates the `overall_score` for posts with significant rank-based corrections.
 */
export async function applyRankFeedback(siteId?: string): Promise<{ updated: number; feedbacks: RankFeedback[] }> {
    const supabase = createServiceRoleClient();
    const log = logger.child({ route: 'rank-feedback', action: 'apply' });

    const feedbacks = await computeRankFeedback(siteId);
    let updated = 0;

    for (const fb of feedbacks) {
        const scoreDiff = Math.abs(fb.adjustedScore - fb.currentScore);
        if (scoreDiff < 3) continue; // Only apply meaningful adjustments

        const { error } = await supabase
            .from('posts')
            .update({
                overall_score: fb.adjustedScore,
                rank_adjusted_at: new Date().toISOString(),
            })
            .eq('id', fb.postId);

        if (!error) {
            updated++;
        } else {
            log.warn('Failed to update post score', { postId: fb.postId }, error);
        }
    }

    log.info('Rank feedback applied', { updated, total: feedbacks.length });
    return { updated, feedbacks };
}
