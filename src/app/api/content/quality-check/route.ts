// ============================================================
// RankMaster Pro - Quality Control API
// Pre-publish quality gate endpoint
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { runQualityControl, type QCInput } from '@/lib/engines/quality-control-engine';
import { checkFactuality } from '@/lib/engines/factuality-checker';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const body = await request.json();
        const {
            primary_keyword,
            secondary_keywords,
            search_intent,
            target_audience,
            content,
        } = body;

        // Validate required inputs
        if (!primary_keyword || !content) {
            return NextResponse.json(
                { error: 'primary_keyword and content are required' },
                { status: 400 }
            );
        }

        const input: QCInput = {
            primaryKeyword: primary_keyword,
            secondaryKeywords: secondary_keywords || [],
            searchIntent: search_intent || 'informational',
            targetAudience: target_audience || 'general',
            content,
        };

        const startTime = Date.now();

        // Run 9-dimension QC + AI factuality deep check in parallel
        const [report, factualityReport] = await Promise.all([
            Promise.resolve(runQualityControl(input)),
            checkFactuality(content, primary_keyword, { deepCheck: true }).catch(err => {
                logger.warn('Factuality deep check failed during QC', {}, err);
                return null;
            }),
        ]);

        const durationMs = Date.now() - startTime;

        logger.info('Quality control evaluation completed', {
            keyword: primary_keyword,
            overall: report.overallScore,
            decision: report.publishDecision,
            rankability: report.rankabilityPrediction,
            factualityScore: factualityReport?.score ?? 'skipped',
            durationMs,
        });

        return NextResponse.json({
            success: true,
            report,
            ...(factualityReport ? { factualityReport } : {}),
            durationMs,
        });
    } catch (error) {
        logger.error('Quality control failed', { route: '/api/content/quality-check' }, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Quality check failed' },
            { status: 500 }
        );
    }
}
