// ============================================================
// RankMaster Pro - Advanced Reports API
// Aggregates content_records + api_usage into 6 report sections:
//   1. Production KPIs
//   2. Cost Analytics
//   3. Pipeline Performance
//   4. Quality Trends
//   5. Model Efficiency
//   6. Content Type Distribution
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { getCostSummary } from '@/lib/engines/cost-calculator';

// Row shapes for the two source queries. Declared explicitly because the
// multi-line concatenated select() strings prevent Supabase from inferring
// the row type (it falls back to GenericStringError).
interface ContentRecordRow {
    id: string;
    session_id: string | null;
    content_type: string | null;
    word_count_actual: number | null;
    overall_score: number | null;
    seo_score: number | null;
    aeo_score: number | null;
    eeat_score: number | null;
    readability_score: number | null;
    naturalness_score: number | null;
    generation_duration_ms: number | null;
    title: string | null;
    keyword: string | null;
    created_at: string;
}

interface ApiUsageRow {
    id: string;
    session_id: string | null;
    provider: string | null;
    model: string | null;
    task: string | null;
    tokens_in: number | null;
    tokens_out: number | null;
    estimated_cost: number | string | null;
    created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────

function getDateRange(days: string): { since: string | null; daysNum: number | null } {
    if (days === 'all') return { since: null, daysNum: null };
    const d = parseInt(days, 10);
    if (![7, 30, 90].includes(d)) return { since: null, daysNum: null };
    return {
        since: new Date(Date.now() - d * 86400000).toISOString(),
        daysNum: d,
    };
}

function percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, idx)];
}

function toDateKey(iso: string): string {
    return iso.slice(0, 10); // YYYY-MM-DD
}

// ── GET /api/reports/advanced ─────────────────────────────────

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const days = searchParams.get('days') || '30';
        const siteId = searchParams.get('site_id') || null;

        // Validate days param
        if (!['7', '30', '90', 'all'].includes(days)) {
            return NextResponse.json(
                { error: 'Invalid days parameter. Use 7, 30, 90, or all.' },
                { status: 400 }
            );
        }

        const { since } = getDateRange(days);
        const userId = auth.user.id;

        // ── Fetch content_records ─────────────────────────────
        let contentQuery = auth.supabase
            .from('content_records')
            .select(
                'id, session_id, content_type, word_count_actual, overall_score, ' +
                'seo_score, aeo_score, eeat_score, readability_score, naturalness_score, ' +
                'generation_duration_ms, title, keyword, created_at'
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (since) contentQuery = contentQuery.gte('created_at', since);
        if (siteId) contentQuery = contentQuery.eq('site_id', siteId);

        // ── Fetch api_usage ──────────────────────────────────
        let usageQuery = auth.supabase
            .from('api_usage')
            .select(
                'id, session_id, provider, model, task, tokens_in, tokens_out, ' +
                'estimated_cost, created_at'
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (since) usageQuery = usageQuery.gte('created_at', since);

        const [contentRes, usageRes] = await Promise.all([contentQuery, usageQuery]);

        if (contentRes.error) {
            return NextResponse.json({ error: contentRes.error.message }, { status: 500 });
        }
        if (usageRes.error) {
            return NextResponse.json({ error: usageRes.error.message }, { status: 500 });
        }

        const records = (contentRes.data || []) as unknown as ContentRecordRow[];
        const usage = (usageRes.data || []) as unknown as ApiUsageRow[];

        // ────────────────────────────────────────────────────────
        // SECTION 1: Production KPIs
        // ────────────────────────────────────────────────────────

        const totalArticles = records.length;
        const totalWords = records.reduce((s, r) => s + (r.word_count_actual || 0), 0);
        const avgOverallScore = totalArticles > 0
            ? Math.round(records.reduce((s, r) => s + (r.overall_score || 0), 0) / totalArticles * 10) / 10
            : 0;
        const avgGenerationTime = totalArticles > 0
            ? Math.round(records.reduce((s, r) => s + (r.generation_duration_ms || 0), 0) / totalArticles)
            : 0;

        // Articles this week vs last week
        const now = Date.now();
        const oneWeekAgo = now - 7 * 86400000;
        const twoWeeksAgo = now - 14 * 86400000;
        const articlesThisWeek = records.filter(r => new Date(r.created_at).getTime() >= oneWeekAgo).length;
        const articlesLastWeek = records.filter(r => {
            const t = new Date(r.created_at).getTime();
            return t >= twoWeeksAgo && t < oneWeekAgo;
        }).length;

        const productionKPIs = {
            totalArticles,
            totalWords,
            avgOverallScore,
            avgGenerationTimeMs: avgGenerationTime,
            articlesThisWeek,
            articlesLastWeek,
            weekOverWeekChange: articlesLastWeek > 0
                ? Math.round(((articlesThisWeek - articlesLastWeek) / articlesLastWeek) * 100)
                : articlesThisWeek > 0 ? 100 : 0,
        };

        // ────────────────────────────────────────────────────────
        // SECTION 2: Cost Analytics
        // ────────────────────────────────────────────────────────

        // Use getCostSummary for provider/model aggregation where possible
        const daysNum = days === 'all' ? 3650 : parseInt(days, 10);
        const costSummary = await getCostSummary(userId, daysNum);

        const totalAICost = usage.reduce((s, u) => s + parseFloat(String(u.estimated_cost || '0')), 0);

        // Articles that have session_ids in api_usage
        const usageSessionIds = new Set(usage.filter(u => u.session_id).map(u => u.session_id));
        const articlesWithCost = records.filter(r => r.session_id && usageSessionIds.has(r.session_id)).length;
        const avgCostPerArticle = articlesWithCost > 0
            ? Math.round((totalAICost / articlesWithCost) * 1_000_000) / 1_000_000
            : 0;

        // Cost by provider
        const costByProvider: Record<string, { cost: number; calls: number }> = {};
        for (const u of usage) {
            const key = u.provider || 'unknown';
            if (!costByProvider[key]) costByProvider[key] = { cost: 0, calls: 0 };
            costByProvider[key].cost += parseFloat(String(u.estimated_cost || '0'));
            costByProvider[key].calls += 1;
        }

        // Cost by model
        const costByModel: Record<string, { cost: number; calls: number }> = {};
        for (const u of usage) {
            const key = u.model || 'unknown';
            if (!costByModel[key]) costByModel[key] = { cost: 0, calls: 0 };
            costByModel[key].cost += parseFloat(String(u.estimated_cost || '0'));
            costByModel[key].calls += 1;
        }

        // Daily cost data for charting
        const dailyCostMap: Record<string, { cost: number; calls: number }> = {};
        for (const u of usage) {
            const dateKey = toDateKey(u.created_at);
            if (!dailyCostMap[dateKey]) dailyCostMap[dateKey] = { cost: 0, calls: 0 };
            dailyCostMap[dateKey].cost += parseFloat(String(u.estimated_cost || '0'));
            dailyCostMap[dateKey].calls += 1;
        }
        const dailyCostData = Object.entries(dailyCostMap)
            .map(([date, v]) => ({
                date,
                cost: Math.round(v.cost * 1_000_000) / 1_000_000,
                calls: v.calls,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const costAnalytics = {
            totalAICost: Math.round(totalAICost * 1_000_000) / 1_000_000,
            avgCostPerArticle,
            costByProvider,
            costByModel,
            dailyCostData,
            // Include getCostSummary's pre-computed data as supplementary info
            costSummaryTokens: costSummary.totalTokens,
        };

        // ────────────────────────────────────────────────────────
        // SECTION 3: Pipeline Performance
        // ────────────────────────────────────────────────────────

        const durations = records
            .map(r => r.generation_duration_ms || 0)
            .filter(d => d > 0);
        const sortedDurations = [...durations].sort((a, b) => a - b);

        const avgDuration = durations.length > 0
            ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
            : 0;
        const p95Duration = percentile(sortedDurations, 95);

        // Fastest and slowest articles
        const recordsWithDuration = records
            .filter(r => (r.generation_duration_ms || 0) > 0);

        const fastestArticle = recordsWithDuration.length > 0
            ? recordsWithDuration.reduce((min, r) =>
                (r.generation_duration_ms || Infinity) < (min.generation_duration_ms || Infinity) ? r : min
            )
            : null;

        const slowestArticle = recordsWithDuration.length > 0
            ? recordsWithDuration.reduce((max, r) =>
                (r.generation_duration_ms || 0) > (max.generation_duration_ms || 0) ? r : max
            )
            : null;

        // Duration by content_type
        const durationByType: Record<string, { total: number; count: number; avg: number }> = {};
        for (const r of records) {
            const ct = r.content_type || 'unknown';
            if (!durationByType[ct]) durationByType[ct] = { total: 0, count: 0, avg: 0 };
            durationByType[ct].total += r.generation_duration_ms || 0;
            durationByType[ct].count += 1;
        }
        for (const key of Object.keys(durationByType)) {
            const entry = durationByType[key];
            entry.avg = entry.count > 0 ? Math.round(entry.total / entry.count) : 0;
        }

        const pipelinePerformance = {
            avgDurationMs: avgDuration,
            p95DurationMs: p95Duration,
            fastestArticle: fastestArticle
                ? { title: fastestArticle.title, keyword: fastestArticle.keyword, durationMs: fastestArticle.generation_duration_ms }
                : null,
            slowestArticle: slowestArticle
                ? { title: slowestArticle.title, keyword: slowestArticle.keyword, durationMs: slowestArticle.generation_duration_ms }
                : null,
            durationByContentType: durationByType,
        };

        // ────────────────────────────────────────────────────────
        // SECTION 4: Quality Trends
        // ────────────────────────────────────────────────────────

        // Average scores over time (grouped by day)
        const dailyScoreMap: Record<string, {
            count: number;
            seo: number; aeo: number; eeat: number;
            readability: number; naturalness: number; overall: number;
        }> = {};

        for (const r of records) {
            const dateKey = toDateKey(r.created_at);
            if (!dailyScoreMap[dateKey]) {
                dailyScoreMap[dateKey] = { count: 0, seo: 0, aeo: 0, eeat: 0, readability: 0, naturalness: 0, overall: 0 };
            }
            const entry = dailyScoreMap[dateKey];
            entry.count += 1;
            entry.seo += r.seo_score || 0;
            entry.aeo += r.aeo_score || 0;
            entry.eeat += r.eeat_score || 0;
            entry.readability += r.readability_score || 0;
            entry.naturalness += r.naturalness_score || 0;
            entry.overall += r.overall_score || 0;
        }

        const qualityOverTime = Object.entries(dailyScoreMap)
            .map(([date, v]) => ({
                date,
                seo: Math.round((v.seo / v.count) * 10) / 10,
                aeo: Math.round((v.aeo / v.count) * 10) / 10,
                eeat: Math.round((v.eeat / v.count) * 10) / 10,
                readability: Math.round((v.readability / v.count) * 10) / 10,
                naturalness: Math.round((v.naturalness / v.count) * 10) / 10,
                overall: Math.round((v.overall / v.count) * 10) / 10,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Score distribution bands
        const bands = { '0-30': 0, '30-50': 0, '50-70': 0, '70-85': 0, '85-100': 0 };
        for (const r of records) {
            const score = r.overall_score || 0;
            if (score < 30) bands['0-30']++;
            else if (score < 50) bands['30-50']++;
            else if (score < 70) bands['50-70']++;
            else if (score < 85) bands['70-85']++;
            else bands['85-100']++;
        }

        const qualityTrends = {
            scoresOverTime: qualityOverTime,
            scoreDistribution: bands,
        };

        // ────────────────────────────────────────────────────────
        // SECTION 5: Model Efficiency
        // ────────────────────────────────────────────────────────

        const modelEfficiency: Record<string, {
            model: string;
            provider: string;
            totalCost: number;
            avgTokens: number;
            totalTokensIn: number;
            totalTokensOut: number;
            calls: number;
        }> = {};

        for (const u of usage) {
            const key = u.model || 'unknown';
            if (!modelEfficiency[key]) {
                modelEfficiency[key] = {
                    model: u.model || 'unknown',
                    provider: u.provider || 'unknown',
                    totalCost: 0,
                    avgTokens: 0,
                    totalTokensIn: 0,
                    totalTokensOut: 0,
                    calls: 0,
                };
            }
            const entry = modelEfficiency[key];
            entry.totalCost += parseFloat(String(u.estimated_cost || '0'));
            entry.totalTokensIn += u.tokens_in || 0;
            entry.totalTokensOut += u.tokens_out || 0;
            entry.calls += 1;
        }

        // Compute avgTokens
        for (const key of Object.keys(modelEfficiency)) {
            const entry = modelEfficiency[key];
            entry.avgTokens = entry.calls > 0
                ? Math.round((entry.totalTokensIn + entry.totalTokensOut) / entry.calls)
                : 0;
            entry.totalCost = Math.round(entry.totalCost * 1_000_000) / 1_000_000;
        }

        const modelEfficiencyArray = Object.values(modelEfficiency)
            .sort((a, b) => b.totalCost - a.totalCost);

        // ────────────────────────────────────────────────────────
        // SECTION 6: Content Type Distribution
        // ────────────────────────────────────────────────────────

        // Build a map of session_id → total cost from api_usage
        const sessionCostMap: Record<string, number> = {};
        for (const u of usage) {
            if (!u.session_id) continue;
            if (!sessionCostMap[u.session_id]) sessionCostMap[u.session_id] = 0;
            sessionCostMap[u.session_id] += parseFloat(String(u.estimated_cost || '0'));
        }

        const contentTypeMap: Record<string, {
            count: number;
            totalScore: number;
            totalCost: number;
        }> = {};

        for (const r of records) {
            const ct = r.content_type || 'unknown';
            if (!contentTypeMap[ct]) contentTypeMap[ct] = { count: 0, totalScore: 0, totalCost: 0 };
            contentTypeMap[ct].count += 1;
            contentTypeMap[ct].totalScore += r.overall_score || 0;
            if (r.session_id && sessionCostMap[r.session_id] !== undefined) {
                contentTypeMap[ct].totalCost += sessionCostMap[r.session_id];
            }
        }

        const contentTypeDistribution = Object.entries(contentTypeMap)
            .map(([type, v]) => ({
                contentType: type,
                count: v.count,
                avgScore: v.count > 0 ? Math.round((v.totalScore / v.count) * 10) / 10 : 0,
                avgCost: v.count > 0
                    ? Math.round((v.totalCost / v.count) * 1_000_000) / 1_000_000
                    : 0,
                totalCost: Math.round(v.totalCost * 1_000_000) / 1_000_000,
            }))
            .sort((a, b) => b.count - a.count);

        // ── Final Response ────────────────────────────────────

        return NextResponse.json({
            period: {
                days,
                since: since || 'all',
                siteId,
                generatedAt: new Date().toISOString(),
            },
            productionKPIs,
            costAnalytics,
            pipelinePerformance,
            qualityTrends,
            modelEfficiency: modelEfficiencyArray,
            contentTypeDistribution,
        });
    } catch (error) {
        console.error('[advanced-reports] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to generate advanced report' },
            { status: 500 }
        );
    }
}
