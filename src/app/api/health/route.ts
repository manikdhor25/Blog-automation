// ============================================================
// RankMaster Pro - Health Check Endpoint
// Returns system health status for monitoring and alerting
// ============================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';

// Validate an env var is real (not a placeholder)
function isRealKey(v?: string): boolean {
    return !!v && v.length > 5 && !v.startsWith('your_') && v !== 'placeholder';
}

export async function GET() {
    const checks: Record<string, { status: string; latency?: number; error?: string; details?: Record<string, unknown> }> = {};
    const start = Date.now();

    // 1. Database connectivity + latency
    try {
        const dbStart = Date.now();
        const supabase = createServiceRoleClient();
        const { error } = await supabase.from('sites').select('id', { count: 'exact', head: true });
        const latency = Date.now() - dbStart;
        checks.database = {
            status: error ? 'unhealthy' : latency > 3000 ? 'degraded' : 'healthy',
            latency,
            ...(error && { error: error.message }),
            ...(latency > 3000 && !error && { error: `High latency: ${latency}ms` }),
        };
    } catch (e) {
        checks.database = { status: 'unhealthy', error: e instanceof Error ? e.message : 'Unknown' };
    }

    // 2. AI Provider availability — validate keys aren't placeholders
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const hasGemini = isRealKey(geminiKey);
    const hasOpenAI = isRealKey(openaiKey);
    checks.ai_providers = {
        status: (hasGemini || hasOpenAI) ? 'healthy' : 'unhealthy',
        details: {
            gemini: hasGemini ? 'configured' : 'missing',
            openai: hasOpenAI ? 'configured' : 'missing',
        },
        ...((!hasGemini && !hasOpenAI) && { error: 'No AI provider API keys configured — content generation will fail' }),
    };

    // 3. External APIs — check for placeholder values
    const hasDataForSEO = isRealKey(process.env.DATAFORSEO_LOGIN || process.env.dataforseo_login);
    const hasGoogleCSE = isRealKey(process.env.GOOGLE_SEARCH_API_KEY) && isRealKey(process.env.GOOGLE_SEARCH_ENGINE_ID);
    const hasUnsplash = isRealKey(process.env.UNSPLASH_ACCESS_KEY);
    const hasPexels = isRealKey(process.env.PEXELS_API_KEY);

    checks.external_apis = {
        status: hasDataForSEO && hasGoogleCSE ? 'healthy' : 'degraded',
        details: {
            dataforseo: hasDataForSEO ? 'configured' : 'not_configured (keyword data will use AI estimates)',
            google_cse: hasGoogleCSE ? 'configured' : 'not_configured (SERP intelligence unavailable)',
            image_api: (hasUnsplash || hasPexels) ? 'configured' : 'not_configured (images will use placeholders)',
        },
    };

    // 4. Queue health with latency
    try {
        const queueStart = Date.now();
        const supabase = createServiceRoleClient();
        const { count: scheduledCount } = await supabase
            .from('content_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'scheduled');

        const { count: stuckCount } = await supabase
            .from('content_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'publishing');

        const queueLatency = Date.now() - queueStart;
        checks.queue = {
            status: (stuckCount || 0) > 5 ? 'degraded' : 'healthy',
            latency: queueLatency,
            details: {
                scheduled: scheduledCount || 0,
                stuck_publishing: stuckCount || 0,
            },
            ...((stuckCount || 0) > 0 && { error: `${stuckCount} items stuck in 'publishing' state` }),
        };
    } catch {
        checks.queue = { status: 'unknown', error: 'Could not query content_queue table' };
    }

    // 5. Runtime info
    const memUsage = process.memoryUsage();
    checks.runtime = {
        status: memUsage.heapUsed / memUsage.heapTotal > 0.9 ? 'degraded' : 'healthy',
        details: {
            heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
            heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
            rss_mb: Math.round(memUsage.rss / 1024 / 1024),
            uptime_seconds: Math.round(process.uptime()),
            node_version: process.version,
        },
    };

    // Overall status
    const allStatuses = Object.values(checks).map(c => c.status);
    const isHealthy = !allStatuses.some(s => s === 'unhealthy');
    const isDegraded = allStatuses.some(s => s === 'degraded' || s === 'not_configured');

    return NextResponse.json({
        status: isHealthy ? (isDegraded ? 'degraded' : 'healthy') : 'unhealthy',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        totalLatency: Date.now() - start,
        checks,
    }, {
        status: isHealthy ? 200 : 503,
    });
}
