// ============================================================
// RankMaster Pro - Score Normalizer
// Bridges ContentScorer (0-100) and QC Engine (0-10) into a
// unified ContentScore with all dimensions on a 0-100 scale.
// ============================================================

import type { ContentScore, QualityControlReport } from '../types';

/**
 * Normalizes a QC dimension score from 0-10 → 0-100 scale.
 */
function qcToPercent(score: number): number {
    return Math.round(Math.max(0, Math.min(100, score * 10)));
}

/**
 * Merges ContentScorer output + QC Engine report into a unified ContentScore.
 * 
 * Strategy for overlapping dimensions:
 * - Uses ContentScorer values as the base (already 0-100)
 * - Adds QC-exclusive dimensions: humanness, userValue, competitive
 * - Attaches publishReadiness from QC Engine
 * - Adjusts overall score to factor in QC-exclusive dimensions
 */
export function buildUnifiedScore(
    contentScore: ContentScore,
    qcReport: QualityControlReport
): ContentScore {
    // Convert QC-exclusive dimensions to 0-100
    const humanness = qcToPercent(qcReport.humannessScore.score);
    const userValue = qcToPercent(qcReport.valueScore.score);
    const competitive = qcToPercent(qcReport.competitiveScore.score);

    // Blend overall: 80% ContentScorer overall + 20% QC overall (normalized)
    // This gives weight to both systems without radical score shifts
    const qcOverall100 = qcToPercent(qcReport.overallScore);
    const blendedOverall = Math.round(
        contentScore.overall * 0.8 + qcOverall100 * 0.2
    );

    return {
        ...contentScore,
        humanness,
        userValue,
        competitive,
        overall: blendedOverall,
        publishReadiness: {
            decision: qcReport.publishDecision,
            rankability: qcReport.rankabilityPrediction,
            overallQC: qcReport.overallScore,
            improvements: qcReport.requiredImprovements,
        },
    };
}
