// ============================================================
// RankMaster Pro - Content Decay API
// Scans published posts for decay signals and returns reports
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getContentDecayEngine } from '@/lib/engines/decay-engine';
import { getAuthUser } from '@/lib/auth-guard';
import { logger } from '@/lib/logger';

// GET: Scan for decay (authenticated)
export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const siteId = searchParams.get('site_id') || undefined;

        const decayEngine = getContentDecayEngine();
        const reports = await decayEngine.scanForDecay(siteId);

        // Summary stats
        const summary = {
            total: reports.length,
            critical: reports.filter(r => r.severity === 'critical').length,
            high: reports.filter(r => r.severity === 'high').length,
            medium: reports.filter(r => r.severity === 'medium').length,
            low: reports.filter(r => r.severity === 'low').length,
        };

        return NextResponse.json({ reports, summary });
    } catch (error) {
        logger.error('Decay scan failed', { route: '/api/decay', action: 'scan' }, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Decay scan failed' },
            { status: 500 }
        );
    }
}

// POST: Update decay alerts in database (authenticated)
export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const body = await request.json();
        const { site_id } = body;

        const decayEngine = getContentDecayEngine();
        const result = await decayEngine.updateDecayAlerts(site_id);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error('Decay update failed', { route: '/api/decay', action: 'update' }, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Decay update failed' },
            { status: 500 }
        );
    }
}
