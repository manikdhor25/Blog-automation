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

// ── #48: CTR-Based Title Testing ──────────────────────────────
// Scores title variants based on CTR prediction signals

export interface TitleVariant {
    title: string;
    score: number;
    reasons: string[];
}

export function scoreTitleVariants(titles: string[], keyword: string): TitleVariant[] {
    return titles.map(title => {
        let score = 50; // Base score
        const reasons: string[] = [];
        const titleLower = title.toLowerCase();
        const keywordLower = keyword.toLowerCase();

        // Keyword in title (+15)
        if (titleLower.includes(keywordLower)) {
            score += 15;
            reasons.push('Contains target keyword');
        }

        // Keyword near beginning (+10)
        if (titleLower.indexOf(keywordLower) <= 10) {
            score += 10;
            reasons.push('Keyword near title start');
        }

        // Number in title (+8 — listicles and data-driven titles have higher CTR)
        if (/\d+/.test(title)) {
            score += 8;
            reasons.push('Contains number');
        }

        // Year in title (+5)
        const currentYear = new Date().getFullYear();
        if (title.includes(String(currentYear)) || title.includes(String(currentYear + 1))) {
            score += 5;
            reasons.push('Contains current/next year');
        }

        // Power words (+5)
        const powerWords = /\b(ultimate|proven|essential|complete|secret|best|free|new|fast|easy|simple|instant)\b/i;
        if (powerWords.test(title)) {
            score += 5;
            reasons.push('Contains power word');
        }

        // Parenthetical/bracket (+4)
        if (/[\(\[\{]/.test(title)) {
            score += 4;
            reasons.push('Contains brackets/parenthetical');
        }

        // Question format (+3)
        if (/^(how|what|why|when|where|which|who|is|are|can|should)/i.test(title)) {
            score += 3;
            reasons.push('Question format');
        }

        // Length check — 50-65 chars is optimal for SERP display
        if (title.length >= 50 && title.length <= 65) {
            score += 5;
            reasons.push('Optimal title length (50-65 chars)');
        } else if (title.length > 65) {
            score -= 5;
            reasons.push('Title too long — may be truncated in SERPs');
        } else if (title.length < 30) {
            score -= 3;
            reasons.push('Title very short — may look thin');
        }

        // Emotional trigger words (+3)
        if (/\b(surprising|shocking|mistake|warning|avoid|never|always)\b/i.test(title)) {
            score += 3;
            reasons.push('Emotional trigger word');
        }

        return {
            title,
            score: Math.min(100, Math.max(0, score)),
            reasons,
        };
    }).sort((a, b) => b.score - a.score);
}

// ── #49: SERP Feature Targeting ───────────────────────────────
// Analyzes keyword to recommend which SERP features to target

export interface SERPFeatureTarget {
    feature: string;
    eligibility: 'high' | 'medium' | 'low';
    contentRequirement: string;
    currentlyTargeted: boolean;
}

export function analyzeSERPFeatureTargets(
    keyword: string,
    contentHtml: string,
    hasFAQ: boolean,
    hasHowTo: boolean,
    hasSchema: boolean
): SERPFeatureTarget[] {
    const targets: SERPFeatureTarget[] = [];
    const kwLower = keyword.toLowerCase();

    // Featured Snippet
    const isQuestionKW = /^(how|what|why|when|where|which|who|is|are|can|should|does)/i.test(kwLower);
    targets.push({
        feature: 'Featured Snippet',
        eligibility: isQuestionKW ? 'high' : 'medium',
        contentRequirement: 'First paragraph under H2 must be a self-contained 40-60 word answer',
        currentlyTargeted: /<p[^>]*>[\s\S]{150,300}<\/p>/i.test(contentHtml),
    });

    // PAA Box
    targets.push({
        feature: 'People Also Ask',
        eligibility: hasFAQ ? 'high' : 'low',
        contentRequirement: 'Include 5+ FAQ items with direct, concise answers',
        currentlyTargeted: hasFAQ,
    });

    // HowTo Rich Result
    const isHowTo = /\b(how to|step.by.step|guide|tutorial)\b/i.test(kwLower);
    targets.push({
        feature: 'HowTo Rich Result',
        eligibility: isHowTo ? 'high' : 'low',
        contentRequirement: 'Include numbered steps with HowTo schema',
        currentlyTargeted: hasHowTo,
    });

    // Table/Comparison Rich Result
    const isComparison = /\b(vs|compare|comparison|best|top \d+|alternatives)\b/i.test(kwLower);
    targets.push({
        feature: 'Table Snippet',
        eligibility: isComparison ? 'high' : 'medium',
        contentRequirement: 'Include comparison tables with structured data',
        currentlyTargeted: /<table/i.test(contentHtml),
    });

    // Video Rich Result
    targets.push({
        feature: 'Video Rich Result',
        eligibility: 'medium',
        contentRequirement: 'Include embedded video with VideoObject schema',
        currentlyTargeted: /youtube\.com|VideoObject/i.test(contentHtml),
    });

    // Breadcrumb Rich Result
    targets.push({
        feature: 'Breadcrumb',
        eligibility: hasSchema ? 'high' : 'low',
        contentRequirement: 'Include BreadcrumbList schema',
        currentlyTargeted: hasSchema,
    });

    return targets;
}

// ── #58: SERP Feature Change Detection ────────────────────────
// Compares SERP features over time to detect opportunities

export interface SERPFeatureChange {
    keyword: string;
    feature: string;
    changeType: 'appeared' | 'disappeared' | 'changed';
    detectedAt: string;
    recommendation: string;
}

export function detectSERPFeatureChanges(
    keyword: string,
    previousFeatures: string[],
    currentFeatures: string[]
): SERPFeatureChange[] {
    const changes: SERPFeatureChange[] = [];
    const prevSet = new Set(previousFeatures.map(f => f.toLowerCase()));
    const currSet = new Set(currentFeatures.map(f => f.toLowerCase()));
    const now = new Date().toISOString();

    // New features appeared
    for (const feature of currentFeatures) {
        if (!prevSet.has(feature.toLowerCase())) {
            changes.push({
                keyword,
                feature,
                changeType: 'appeared',
                detectedAt: now,
                recommendation: `New "${feature}" feature detected for "${keyword}". Optimize content to capture this SERP feature.`,
            });
        }
    }

    // Features that disappeared
    for (const feature of previousFeatures) {
        if (!currSet.has(feature.toLowerCase())) {
            changes.push({
                keyword,
                feature,
                changeType: 'disappeared',
                detectedAt: now,
                recommendation: `"${feature}" feature no longer showing for "${keyword}". May indicate SERP intent shift.`,
            });
        }
    }

    return changes;
}
