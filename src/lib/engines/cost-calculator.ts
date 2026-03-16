// ============================================================
// RankMaster Pro - Per-Post Cost Calculator Engine
// Calculates total AI cost per content generation, broken down
// by model and task type using session-based grouping
// ============================================================

import { createServiceRoleClient } from '../supabase';

// ── Accurate Per-Model Pricing ($/1M tokens) ──────────────────
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    // Google Gemini
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },

    // OpenAI
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },

    // Anthropic
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

    // Groq (Llama)
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },

    // Mistral
    'mistral-large-latest': { input: 2.00, output: 6.00 },
    'mistral-small-latest': { input: 0.20, output: 0.60 },

    // DeepSeek
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'deepseek-reasoner': { input: 0.55, output: 2.19 },

    // Cohere
    'command-r-plus': { input: 2.50, output: 10.00 },
    'command-r': { input: 0.15, output: 0.60 },
};

// Fallback pricing by provider (if model not found in MODEL_PRICING)
const PROVIDER_FALLBACK_PRICING: Record<string, { input: number; output: number }> = {
    gemini: { input: 0.10, output: 0.40 },
    openai: { input: 2.50, output: 10.00 },
    anthropic: { input: 3.00, output: 15.00 },
    groq: { input: 0.05, output: 0.08 },
    mistral: { input: 0.25, output: 0.60 },
    deepseek: { input: 0.14, output: 0.28 },
    cohere: { input: 0.30, output: 0.60 },
};

// ── Types ─────────────────────────────────────────────────────

export interface ModelCostBreakdown {
    model: string;
    provider: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    cost: number;
}

export interface TaskCostBreakdown {
    task: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    cost: number;
}

export interface PostCostReport {
    sessionId: string;
    keyword: string;
    title: string;
    totalCost: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalCalls: number;
    byModel: ModelCostBreakdown[];
    byTask: TaskCostBreakdown[];
    generatedAt: string;
    generationDurationMs: number;
}

// ── Cost Calculation Functions ────────────────────────────────

function getModelPricing(model: string, provider: string): { input: number; output: number } {
    return MODEL_PRICING[model] || PROVIDER_FALLBACK_PRICING[provider] || { input: 0.10, output: 0.30 };
}

function calculateCost(tokensIn: number, tokensOut: number, model: string, provider: string): number {
    const pricing = getModelPricing(model, provider);
    return (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000;
}

// ── Main Functions ────────────────────────────────────────────

/**
 * Calculate cost report for a single content generation session
 */
export async function getPostCostReport(
    sessionId: string,
    userId: string
): Promise<PostCostReport | null> {
    const supabase = createServiceRoleClient();

    // Fetch all API usage entries for this session
    const { data: usageRows, error: usageError } = await supabase
        .from('api_usage')
        .select('provider, model, task, tokens_in, tokens_out, estimated_cost, created_at')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (usageError || !usageRows || usageRows.length === 0) {
        return null;
    }

    // Fetch the content record for this session (for keyword/title)
    const { data: record } = await supabase
        .from('content_records')
        .select('keyword, title, generation_duration_ms, created_at')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

    // ── Aggregate by model ────────────────────────────────
    const modelMap = new Map<string, ModelCostBreakdown>();
    const taskMap = new Map<string, TaskCostBreakdown>();

    let totalCost = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    for (const row of usageRows) {
        const tokensIn = row.tokens_in || 0;
        const tokensOut = row.tokens_out || 0;
        const cost = calculateCost(tokensIn, tokensOut, row.model, row.provider);

        totalCost += cost;
        totalTokensIn += tokensIn;
        totalTokensOut += tokensOut;

        // Group by model
        const modelKey = `${row.provider}/${row.model}`;
        const existing = modelMap.get(modelKey) || {
            model: row.model,
            provider: row.provider,
            calls: 0,
            tokensIn: 0,
            tokensOut: 0,
            cost: 0,
        };
        existing.calls += 1;
        existing.tokensIn += tokensIn;
        existing.tokensOut += tokensOut;
        existing.cost += cost;
        modelMap.set(modelKey, existing);

        // Group by task
        const taskExisting = taskMap.get(row.task) || {
            task: row.task,
            calls: 0,
            tokensIn: 0,
            tokensOut: 0,
            cost: 0,
        };
        taskExisting.calls += 1;
        taskExisting.tokensIn += tokensIn;
        taskExisting.tokensOut += tokensOut;
        taskExisting.cost += cost;
        taskMap.set(row.task, taskExisting);
    }

    // Sort by cost descending
    const byModel = Array.from(modelMap.values()).sort((a, b) => b.cost - a.cost);
    const byTask = Array.from(taskMap.values()).sort((a, b) => b.cost - a.cost);

    return {
        sessionId,
        keyword: record?.keyword || '',
        title: record?.title || '',
        totalCost: Math.round(totalCost * 1_000_000) / 1_000_000, // round to 6 decimal places
        totalTokensIn,
        totalTokensOut,
        totalCalls: usageRows.length,
        byModel,
        byTask,
        generatedAt: record?.created_at || usageRows[0]?.created_at || '',
        generationDurationMs: record?.generation_duration_ms || 0,
    };
}

/**
 * Get cost reports for most recent N posts
 */
export async function getRecentPostCosts(
    userId: string,
    limit: number = 10
): Promise<PostCostReport[]> {
    const supabase = createServiceRoleClient();

    // Fetch recent content records that have session_ids
    const { data: records, error } = await supabase
        .from('content_records')
        .select('session_id, keyword, title, generation_duration_ms, created_at')
        .eq('user_id', userId)
        .not('session_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error || !records || records.length === 0) {
        return [];
    }

    // Build cost reports for each
    const reports: PostCostReport[] = [];
    for (const record of records) {
        if (!record.session_id) continue;
        const report = await getPostCostReport(record.session_id, userId);
        if (report) {
            report.keyword = record.keyword;
            report.title = record.title;
            report.generatedAt = record.created_at;
            report.generationDurationMs = record.generation_duration_ms || 0;
            reports.push(report);
        }
    }

    return reports;
}

/**
 * Get aggregate cost summary across all posts
 */
export async function getCostSummary(
    userId: string,
    days: number = 30
): Promise<{
    totalCost: number;
    totalPosts: number;
    avgCostPerPost: number;
    totalTokens: number;
    byProvider: Record<string, { cost: number; calls: number; tokens: number }>;
    byModel: Record<string, { cost: number; calls: number; tokens: number }>;
}> {
    const supabase = createServiceRoleClient();
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: usageRows } = await supabase
        .from('api_usage')
        .select('provider, model, tokens_in, tokens_out, session_id')
        .eq('user_id', userId)
        .gte('created_at', since);

    const rows = usageRows || [];
    const sessionIds = new Set(rows.filter(r => r.session_id).map(r => r.session_id));

    let totalCost = 0;
    let totalTokens = 0;
    const byProvider: Record<string, { cost: number; calls: number; tokens: number }> = {};
    const byModel: Record<string, { cost: number; calls: number; tokens: number }> = {};

    for (const row of rows) {
        const tokensIn = row.tokens_in || 0;
        const tokensOut = row.tokens_out || 0;
        const cost = calculateCost(tokensIn, tokensOut, row.model, row.provider);
        const tokens = tokensIn + tokensOut;

        totalCost += cost;
        totalTokens += tokens;

        // By provider
        if (!byProvider[row.provider]) byProvider[row.provider] = { cost: 0, calls: 0, tokens: 0 };
        byProvider[row.provider].cost += cost;
        byProvider[row.provider].calls += 1;
        byProvider[row.provider].tokens += tokens;

        // By model
        const modelKey = row.model || 'unknown';
        if (!byModel[modelKey]) byModel[modelKey] = { cost: 0, calls: 0, tokens: 0 };
        byModel[modelKey].cost += cost;
        byModel[modelKey].calls += 1;
        byModel[modelKey].tokens += tokens;
    }

    const totalPosts = sessionIds.size;

    return {
        totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
        totalPosts,
        avgCostPerPost: totalPosts > 0 ? Math.round((totalCost / totalPosts) * 1_000_000) / 1_000_000 : 0,
        totalTokens,
        byProvider,
        byModel,
    };
}

// ── Export pricing for external use ───────────────────────────
export { MODEL_PRICING, PROVIDER_FALLBACK_PRICING };
