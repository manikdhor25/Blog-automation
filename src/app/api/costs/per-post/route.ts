// ============================================================
// RankMaster Pro - Per-Post Costs API
// GET /api/costs/per-post?session_id=xxx   → single post cost
// GET /api/costs/per-post?recent=10        → last N posts
// GET /api/costs/per-post?summary=30       → aggregate summary
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import {
    getPostCostReport,
    getRecentPostCosts,
    getCostSummary,
} from '@/lib/engines/cost-calculator';

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('session_id');
        const recent = searchParams.get('recent');
        const summary = searchParams.get('summary');

        // Mode 1: Single post cost by session_id
        if (sessionId) {
            const report = await getPostCostReport(sessionId, auth.user.id);
            if (!report) {
                return NextResponse.json(
                    { error: 'No cost data found for this session' },
                    { status: 404 }
                );
            }
            return NextResponse.json({ report });
        }

        // Mode 2: Aggregate summary over N days
        if (summary) {
            const days = parseInt(summary) || 30;
            const data = await getCostSummary(auth.user.id, days);
            return NextResponse.json({ summary: data });
        }

        // Mode 3: Recent post costs (default)
        const limit = parseInt(recent || '10') || 10;
        const reports = await getRecentPostCosts(auth.user.id, Math.min(limit, 50));

        // Calculate totals across all reports
        const totalCost = reports.reduce((s, r) => s + r.totalCost, 0);
        const totalTokens = reports.reduce((s, r) => s + r.totalTokensIn + r.totalTokensOut, 0);
        const avgCostPerPost = reports.length > 0 ? totalCost / reports.length : 0;

        return NextResponse.json({
            reports,
            aggregate: {
                totalPosts: reports.length,
                totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
                avgCostPerPost: Math.round(avgCostPerPost * 1_000_000) / 1_000_000,
                totalTokens,
            },
        });
    } catch (error) {
        console.error('[per-post costs] ERROR:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch cost data' },
            { status: 500 }
        );
    }
}
