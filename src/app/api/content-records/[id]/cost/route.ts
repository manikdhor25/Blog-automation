// ============================================================
// RankMaster Pro - Content Record Cost API
// GET: Fetch cost breakdown for a single content record
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { getPostCostReport, PostCostReport } from '@/lib/engines/cost-calculator';

const EMPTY_REPORT: Omit<PostCostReport, 'sessionId'> & { sessionId: string | null } = {
    sessionId: null,
    keyword: '',
    title: '',
    totalCost: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCalls: 0,
    byModel: [],
    byTask: [],
    generatedAt: '',
    generationDurationMs: 0,
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { id } = await params;

        // Look up the content record by ID
        const { data: record, error: recordError } = await auth.supabase
            .from('content_records')
            .select('session_id, keyword, title')
            .eq('id', id)
            .eq('user_id', auth.user.id)
            .single();

        if (recordError || !record) {
            return NextResponse.json(
                { error: 'Content record not found' },
                { status: 404 }
            );
        }

        // No session_id means the record has no associated generation session
        if (!record.session_id) {
            return NextResponse.json({ ...EMPTY_REPORT, keyword: record.keyword || '', title: record.title || '' });
        }

        // Fetch the full cost breakdown
        const report = await getPostCostReport(record.session_id, auth.user.id);

        if (!report) {
            return NextResponse.json({ ...EMPTY_REPORT, sessionId: record.session_id, keyword: record.keyword || '', title: record.title || '' });
        }

        return NextResponse.json(report);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch cost report' },
            { status: 500 }
        );
    }
}
