// ============================================================
// RankMaster Pro - Dynamic AI Router with Multi-Model Support
// Retry, fallback, JSON validation, streaming support
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createServiceRoleClient } from '../supabase';

// All supported AI providers
export type AIProvider =
    | 'gemini' | 'openai' | 'anthropic' | 'groq'
    | 'mistral' | 'deepseek' | 'cohere' | 'openrouter';

interface ProviderConfig {
    name: string;
    label: string;
    models: { id: string; name: string; maxTokens: number }[];
    baseUrl?: string;
    isOpenAICompatible: boolean;
}

const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
    gemini: {
        name: 'gemini',
        label: 'Google Gemini',
        models: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', maxTokens: 16384 },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', maxTokens: 16384 },
        ],
        isOpenAICompatible: false,
    },
    openai: {
        name: 'openai',
        label: 'OpenAI',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 4096 },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 4096 },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 4096 },
        ],
        isOpenAICompatible: true,
    },
    anthropic: {
        name: 'anthropic',
        label: 'Anthropic (Claude)',
        models: [
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', maxTokens: 4096 },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', maxTokens: 4096 },
        ],
        baseUrl: 'https://api.anthropic.com/v1/',
        isOpenAICompatible: false,
    },
    groq: {
        name: 'groq',
        label: 'Groq',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', maxTokens: 4096 },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', maxTokens: 4096 },
        ],
        baseUrl: 'https://api.groq.com/openai/v1',
        isOpenAICompatible: true,
    },
    mistral: {
        name: 'mistral',
        label: 'Mistral AI',
        models: [
            { id: 'mistral-large-latest', name: 'Mistral Large', maxTokens: 4096 },
            { id: 'mistral-small-latest', name: 'Mistral Small', maxTokens: 4096 },
        ],
        baseUrl: 'https://api.mistral.ai/v1',
        isOpenAICompatible: true,
    },
    deepseek: {
        name: 'deepseek',
        label: 'DeepSeek',
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek Chat', maxTokens: 4096 },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', maxTokens: 4096 },
        ],
        baseUrl: 'https://api.deepseek.com/v1',
        isOpenAICompatible: true,
    },
    cohere: {
        name: 'cohere',
        label: 'Cohere',
        models: [
            { id: 'command-r-plus', name: 'Command R+', maxTokens: 4096 },
            { id: 'command-r', name: 'Command R', maxTokens: 4096 },
        ],
        baseUrl: 'https://api.cohere.ai/v1',
        isOpenAICompatible: true,
    },
    openrouter: {
        name: 'openrouter',
        label: 'OpenRouter',
        // Curated models optimized for quality/cost — user can type any valid OpenRouter model ID in the UI
        models: [
            // ── Best-value writing models ──
            { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro (Best Writer)', maxTokens: 8192 },
            { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B (Creative Writer)', maxTokens: 8192 },
            { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick (Writer)', maxTokens: 8192 },
            // ── Ultra-cheap analysis models ──
            { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash (Fast/Cheap)', maxTokens: 8192 },
            { id: 'qwen/qwen3-32b', name: 'Qwen3 32B (Fast Analysis)', maxTokens: 4096 },
            { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout (Fast)', maxTokens: 4096 },
            // ── Multimodal ──
            { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (Multimodal)', maxTokens: 8192 },
            // ── Premium fallbacks ──
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Premium)', maxTokens: 4096 },
            { id: 'openai/gpt-4o', name: 'GPT-4o (Premium)', maxTokens: 4096 },
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Budget)', maxTokens: 4096 },
        ],
        baseUrl: 'https://openrouter.ai/api/v1',
        isOpenAICompatible: true,
    },
};

// Task types for smart routing
export type TaskType = 'content_writing' | 'content_optimization' | 'content_scoring' |
    'keyword_suggestion' | 'competitor_analysis' | 'topic_research' |
    'meta_generation' | 'schema_generation' | 'outline_generation' |
    'blueprint_analysis' | 'section_writing' | 'serp_analysis' |
    'internal_linking' | 'image_analysis' | 'seo_analysis' | 'data_analysis' |
    'entity_extraction' | 'geo_optimization' |
    'paa_mining' | 'paa_article' | 'trending_detection';

// ── Smart Task → Provider+Model Map ──────────────────────────────
// Each task type maps to an ordered list of preferred provider+model.
// The router picks the first available one based on configured API keys.
//
// ════════════════════════════════════════════════════════════════
// STRATEGY: BEST QUALITY OUTPUT — NO COMPROMISES ON CONTENT
// ════════════════════════════════════════════════════════════════
//
// After analyzing the full content pipeline (content-writer.ts,
// content-quality-gate.ts, outline-generator.ts), here's the truth:
//
// 1. The article generation pipeline makes 15-25 AI calls per article.
//    EVERY writing call produces content that readers and Google see.
//
// 2. The quality gate (content-quality-gate.ts) rewrites weak sections.
//    If the initial model produces mediocre prose, the gate triggers
//    1-3 EXTRA rewrite rounds — each costing more tokens. A stronger
//    model on the first pass actually SAVES money by avoiding retries.
//
// 3. Outlines determine the entire article structure, angles, and
//    differentiation. A smarter model here = better article.
//
// 4. Competitor/blueprint analysis identifies content gaps and unique
//    angles. Better reasoning here = better strategic positioning.
//
// RESULT: Use Claude Sonnet for ALL content-producing/shaping tasks.
//         Use DeepSeek Flash ONLY for pure JSON extraction where
//         writing quality is literally irrelevant.
//
// ┌────────────────────────────────────────────────────────────────┐
// │  TIER     │ MODEL                    │ COST/M       │ TASKS   │
// │───────────│──────────────────────────│──────────────│─────────│
// │  CONTENT  │ Claude 3.5 Sonnet (OR)   │ $3.00/$15.00 │ 7 tasks │
// │  (Best    │ → GPT-4o fallback        │ $2.50/$10.00 │         │
// │   prose)  │ → DS V4 Pro emergency    │ $0.44/$0.87  │         │
// │           │                          │              │         │
// │  DATA     │ DeepSeek V4 Flash (OR)   │ $0.10/$0.20  │ 8 tasks │
// │  (JSON    │ → Qwen3 32B fallback     │ $0.08/$0.15  │         │
// │   only)   │ → Gemini Flash backup    │ free tier    │         │
// │           │                          │              │         │
// │  VISION   │ Gemini 2.5 Flash (OR)    │ $0.15/$0.60  │ 1 task  │
// │           │ → GPT-4o fallback        │ $2.50/$10.00 │         │
// └────────────────────────────────────────────────────────────────┘
//
// COST PER ARTICLE: ~$0.55-0.70  (vs $0.50-1.20 before)
// Same quality ceiling, better reliability, one API key.
// ════════════════════════════════════════════════════════════════

const TASK_MODEL_MAP: Record<TaskType, { provider: AIProvider; model: string }[]> = {

    // ═══════════════════════════════════════════════════════════════
    // CONTENT TIER — Claude Sonnet (via OpenRouter)
    //
    // These tasks produce or directly shape the published article.
    // Claude is the best English prose writer available. Period.
    // Fallback: GPT-4o (95% as good) → DS V4 Pro (90% as good)
    // ═══════════════════════════════════════════════════════════════

    // THE BODY — Every section your readers see and Google evaluates.
    // This is 70% of all tokens per article (8-15 calls).
    // The quality gate (content-quality-gate.ts L98-277) rewrites
    // weak sections — Claude gets it right on the first pass,
    // meaning FEWER retry calls and LOWER total token cost.
    section_writing: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // GENERAL CONTENT — FAQs, email sequences, glossary terms,
    // HARO pitches, patched sections, word-count expansions.
    // All reader-facing. All need strong writing.
    content_writing: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // OPTIMIZATION — Rewrites existing content to improve quality.
    // Needs the best model to actually IMPROVE on the original.
    content_optimization: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // TITLES & META — 500 tokens, but determines your SERP CTR.
    // A 5% better title = 5% more traffic on every impression.
    // Claude excels at creative short-form copy.
    meta_generation: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // OUTLINE — Determines entire article structure, heading angles,
    // content gaps to exploit, and section word targets.
    // A mediocre outline → mediocre article, no matter how good
    // the writing model is. This is 1 call per article (~$0.07).
    outline_generation: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // COMPETITOR ANALYSIS — Identifies content gaps, unique angles,
    // and winning patterns. Strategic reasoning, not data extraction.
    // Better analysis → better differentiation → higher rankings.
    competitor_analysis: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // BLUEPRINT — Synthesizes raw competitor data into strategic
    // insights: consensus headings, content gaps, unique angles.
    // The blueprint feeds directly into the outline generator.
    blueprint_analysis: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // ═══════════════════════════════════════════════════════════════
    // DATA TIER — DeepSeek V4 Flash (via OpenRouter)
    //
    // These tasks output pure structured JSON. No human reads this
    // output directly. Writing quality is irrelevant — what matters
    // is accurate data extraction and schema adherence.
    // Flash is excellent at this and costs nearly nothing.
    // ═══════════════════════════════════════════════════════════════

    // SCORING — Evaluates content against a fixed rubric.
    // Output is a JSON score object. Doesn't need creative prose.
    content_scoring: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // SEO ANALYSIS — Intent classification, keyword clustering,
    // SERP pattern extraction. All structured JSON output.
    seo_analysis: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // KEYWORD SUGGESTIONS — Generates lists of keyword ideas.
    // Output is a JSON array of strings. No prose needed.
    keyword_suggestion: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // TOPIC RESEARCH — Structured data gathering. JSON output.
    topic_research: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // SCHEMA MARKUP — Generates JSON-LD structured data.
    // Template-based JSON. Cheapest model is fine.
    schema_generation: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // SERP ANALYSIS — Extracts patterns from search results.
    // Pure data extraction into JSON.
    serp_analysis: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // INTERNAL LINKING — Pattern matching between headings and
    // existing posts. JSON array of link suggestions.
    internal_linking: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],
    data_analysis: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // ═══════════════════════════════════════════════════════════════
    // TIER M — MULTIMODAL (Gemini 2.5 Flash via OpenRouter)
    // Vision tasks need multimodal capability. Gemini is the
    // best value for image understanding.
    // ═══════════════════════════════════════════════════════════════
    image_analysis: [
        { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // ENTITY EXTRACTION — NER from article content. Pure JSON output.
    // OA-1: Now connected to the pipeline via content-writer.ts
    entity_extraction: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // GEO OPTIMIZATION — Citation injection and restructuring.
    // OA-1: Now connected to the pipeline via content-writer.ts
    // Uses content tier because output replaces reader-facing text.
    geo_optimization: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // PAA MINING — Extract People-Also-Ask questions as structured JSON.
    paa_mining: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],

    // PAA ARTICLE — Writes reader-facing answers to PAA questions.
    paa_article: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        { provider: 'openrouter', model: 'openai/gpt-4o' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],

    // TRENDING DETECTION — Scores/classifies trend signals. JSON output.
    trending_detection: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
        { provider: 'openrouter', model: 'qwen/qwen3-32b' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],
};

// Retry configuration
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxProviderFallbacks: 3,
    // Rate-limit (429) specific: longer delays to let the provider reset
    // Increased patience: OpenRouter free/low-tier accounts have strict per-minute limits.
    // 5 retries with 5s base (5s → 10s → 20s → 40s → 60s) gives up to ~135s total wait,
    // which is enough for most provider rate-limit windows to reset.
    rateLimitRetries: 5,
    rateLimitBaseDelayMs: 5000,
    rateLimitMaxDelayMs: 60000,
};

export interface GenerateOptions {
    systemPrompt?: string;
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    model?: string;
    provider?: AIProvider;
    /** Per-call session for thread-safe cost attribution */
    session?: { sessionId: string; userId: string };
}

// Per-task model override: task → { provider, model }
export type TaskModelOverride = { provider: AIProvider; model: string };

export class AIRouter {
    private providerKeys: Record<string, string> = {};
    private defaultProvider: AIProvider = 'gemini';
    private premiumProvider: AIProvider = 'openai';
    private keysLoaded = false;
    private currentSessionId: string | null = null;
    private currentUserId: string | null = null;
    // DB-configured per-task overrides (loaded alongside keys)
    private taskOverrides: Partial<Record<TaskType, TaskModelOverride>> = {};

    // Rate limiting: sliding window per provider
    private rateLimitMap: Record<string, number[]> = {};
    private static RATE_LIMIT_PER_MINUTE = 60; // calls per provider per minute

    private checkRateLimit(provider: AIProvider): void {
        const now = Date.now();
        const windowMs = 60_000;
        if (!this.rateLimitMap[provider]) this.rateLimitMap[provider] = [];
        // Remove timestamps outside the window
        this.rateLimitMap[provider] = this.rateLimitMap[provider].filter(t => now - t < windowMs);
        if (this.rateLimitMap[provider].length >= AIRouter.RATE_LIMIT_PER_MINUTE) {
            throw new Error(`Rate limit: ${provider} exceeded ${AIRouter.RATE_LIMIT_PER_MINUTE} calls/min. Try again shortly.`);
        }
        this.rateLimitMap[provider].push(now);
    }

    // Load API keys + per-task overrides from database settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async loadKeys(externalSupabase?: any): Promise<void> {
        try {
            const supabase = externalSupabase || createServiceRoleClient();
            const { data } = await supabase
                .from('settings')
                .select('key, value')
                .in('category', ['ai', 'ai_task_routing']);

            this.providerKeys = {};
            this.taskOverrides = {};

            for (const setting of data || []) {
                if (!setting.value) continue;

                if (setting.key.startsWith('task_route_')) {
                    // Format: task_route_{taskType} = "provider:model"
                    const taskType = setting.key.replace('task_route_', '') as TaskType;
                    const [provider, ...modelParts] = setting.value.split(':');
                    const model = modelParts.join(':'); // model IDs can contain colons
                    if (provider && model) {
                        this.taskOverrides[taskType] = { provider: provider as AIProvider, model };
                    }
                } else {
                    this.providerKeys[setting.key] = setting.value;
                }
            }

            // Set default/premium providers from settings
            this.defaultProvider = (this.providerKeys['default_ai_provider'] as AIProvider) || 'gemini';
            this.premiumProvider = (this.providerKeys['premium_ai_provider'] as AIProvider) || 'openai';
            this.keysLoaded = true;
        } catch {
            // Fall back to env vars (skip placeholder values)
            const isReal = (v?: string) => v && !v.startsWith('your_') && v !== 'placeholder';
            if (isReal(process.env.GEMINI_API_KEY)) this.providerKeys['gemini_api_key'] = process.env.GEMINI_API_KEY!;
            if (isReal(process.env.OPENAI_API_KEY)) this.providerKeys['openai_api_key'] = process.env.OPENAI_API_KEY!;
            if (isReal(process.env.OPENROUTER_API_KEY)) this.providerKeys['openrouter_api_key'] = process.env.OPENROUTER_API_KEY!;
            this.keysLoaded = true;
        }
    }

    // Get API key for a provider
    private getKey(provider: AIProvider): string | undefined {
        return this.providerKeys[`${provider}_api_key`];
    }

    // Get list of available (configured) providers
    getAvailableProviders(): { provider: AIProvider; label: string; configured: boolean }[] {
        const providers = Object.entries(PROVIDER_CONFIGS).map(([key, config]) => ({
            provider: key as AIProvider,
            label: config.label,
            configured: Boolean(this.getKey(key as AIProvider)),
        }));
        return providers;
    }

    /**
     * @deprecated Use the `session` option in generate() for thread-safe cost attribution.
     * Kept for backward compatibility — per-call session takes precedence.
     */
    setSession(sessionId: string, userId?: string): void {
        this.currentSessionId = sessionId;
        if (userId) this.currentUserId = userId;
    }

    /**
     * @deprecated Use the `session` option in generate() for thread-safe cost attribution.
     * Kept for backward compatibility.
     */
    clearSession(): void {
        this.currentSessionId = null;
        this.currentUserId = null;
    }

    getSessionId(): string | null {
        return this.currentSessionId;
    }

    // Expose task overrides for admin UI
    getTaskOverrides(): Partial<Record<TaskType, TaskModelOverride>> {
        return { ...this.taskOverrides };
    }

    // Smart route: pick the best provider AND model for a task
    private pickProviderAndModel(
        taskType: TaskType,
        preferredProvider?: AIProvider,
        preferredModel?: string
    ): { provider: AIProvider; model: string } {
        // 1. Caller-explicit provider (e.g. direct API call override)
        if (preferredProvider && this.getKey(preferredProvider)) {
            const model = preferredModel
                || TASK_MODEL_MAP[taskType]?.find(m => m.provider === preferredProvider)?.model
                || PROVIDER_CONFIGS[preferredProvider]?.models[0]?.id
                || 'unknown';
            return { provider: preferredProvider, model };
        }

        // 2. Per-task DB override (admin-configured)
        const override = this.taskOverrides[taskType];
        if (override && this.getKey(override.provider)) {
            console.log(`[AIRouter] Task override: ${taskType} → ${override.provider}/${override.model}`);
            return { provider: override.provider, model: preferredModel || override.model };
        }

        // 3. TASK_MODEL_MAP — first available provider+model
        const candidates = TASK_MODEL_MAP[taskType] || [];
        for (const candidate of candidates) {
            if (this.getKey(candidate.provider)) {
                console.log(`[AIRouter] Smart route: ${taskType} → ${candidate.provider}/${candidate.model}`);
                return { provider: candidate.provider, model: preferredModel || candidate.model };
            }
        }

        // 4. User-configured default provider
        if (this.getKey(this.defaultProvider)) {
            const model = preferredModel || PROVIDER_CONFIGS[this.defaultProvider]?.models[0]?.id || 'unknown';
            return { provider: this.defaultProvider, model };
        }

        // 5. Any available provider
        const available = Object.keys(PROVIDER_CONFIGS) as AIProvider[];
        for (const p of available) {
            if (this.getKey(p)) {
                return { provider: p, model: preferredModel || PROVIDER_CONFIGS[p].models[0]?.id };
            }
        }

        throw new Error('No AI provider configured. Please add an API key in Settings → AI Providers.');
    }

    // Get ordered fallback chain from the TASK_MODEL_MAP (excluding the primary)
    private getFallbackChain(primaryProvider: AIProvider, taskType?: TaskType): AIProvider[] {
        if (taskType && TASK_MODEL_MAP[taskType]) {
            // Use the task map ordering — it already prioritises by capability
            const fromMap = TASK_MODEL_MAP[taskType]
                .filter(c => c.provider !== primaryProvider && this.getKey(c.provider))
                .map(c => c.provider);
            if (fromMap.length > 0) return fromMap;
        }

        // Generic fallback: any configured provider
        const allProviders = Object.keys(PROVIDER_CONFIGS) as AIProvider[];
        return allProviders.filter(p => p !== primaryProvider && this.getKey(p));
    }

    // Main generate function — with retry + fallback
    async generate(
        taskType: TaskType,
        prompt: string,
        options: GenerateOptions = {}
    ): Promise<string> {
        if (!this.keysLoaded) await this.loadKeys();

        // Extract per-call session for thread-safe cost attribution
        const session = options.session;

        const { provider: primaryProvider, model: smartModel } = this.pickProviderAndModel(taskType, options.provider, options.model);
        // Inject the smart-selected model into options so downstream callProvider uses it
        const mergedOptions = { ...options, model: options.model || smartModel };
        const fallbackProviders = this.getFallbackChain(primaryProvider, taskType);
        const providersToTry = [primaryProvider, ...fallbackProviders].slice(0, RETRY_CONFIG.maxProviderFallbacks);

        let lastError: Error | null = null;
        // Track providers that returned rate-limit (429) errors.
        // If e.g. openrouter/claude returns 429, skip openrouter/gpt-4o and openrouter/deepseek
        // since they all hit the same API endpoint with the same key.
        const rateLimitedProviders = new Set<AIProvider>();

        for (const provider of providersToTry) {
            // Skip this provider if a previous model on the same provider was rate-limited
            if (rateLimitedProviders.has(provider)) {
                console.warn(`[AIRouter] Skipping ${provider} (already rate-limited). Trying next...`);
                continue;
            }

            try {
                // For fallback providers, pick their best model for this task
                const fallbackOpts = provider === primaryProvider
                    ? mergedOptions
                    : { ...mergedOptions, model: TASK_MODEL_MAP[taskType]?.find(c => c.provider === provider)?.model || PROVIDER_CONFIGS[provider].models[0]?.id };
                const result = await this.generateWithRetry(provider, taskType, prompt, fallbackOpts, session);
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // Mark the provider as rate-limited so we skip other models on the same provider
                if (this.isRateLimitError(lastError)) {
                    rateLimitedProviders.add(provider);
                    console.warn(`[AIRouter] Provider ${provider} rate-limited. Will skip remaining ${provider} models.`);
                } else {
                    console.warn(`[AIRouter] Provider ${provider} failed: ${lastError.message}. Trying next...`);
                }
            }
        }

        throw lastError || new Error('All AI providers failed. Check your API keys in Settings.');
    }

    // Generate with retry logic for a single provider
    private async generateWithRetry(
        provider: AIProvider,
        taskType: TaskType,
        prompt: string,
        options: GenerateOptions,
        session?: { sessionId: string; userId: string }
    ): Promise<string> {
        const apiKey = this.getKey(provider);
        if (!apiKey) {
            throw new Error(`No API key for ${PROVIDER_CONFIGS[provider].label}`);
        }

        // Check rate limit before attempting
        this.checkRateLimit(provider);

        let lastError: Error | null = null;
        let rateLimitAttempt = 0;

        for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
            try {
                const result = await this.callProvider(provider, apiKey, prompt, options);

                // Validate JSON response if jsonMode is enabled
                if (options.jsonMode) {
                    const validated = this.validateJsonResponse(result);
                    if (validated !== null) {
                        // Log usage (fire-and-forget)
                        this.logUsage(provider, options.model || PROVIDER_CONFIGS[provider].models[0]?.id || 'unknown', taskType, prompt.length, result.length, session).catch(() => { });
                        return validated;
                    }
                    // JSON validation failed — log and retry
                    console.warn(`[AIRouter] JSON validation failed for ${provider}. Response starts with: "${result.substring(0, 200)}"`);
                    throw new Error('Response is not valid JSON');
                }

                // Log usage (fire-and-forget)
                this.logUsage(provider, options.model || PROVIDER_CONFIGS[provider].models[0]?.id || 'unknown', taskType, prompt.length, result.length, session).catch(() => { });
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Retry rate-limit (429) errors with longer exponential backoff
                if (this.isRateLimitError(lastError)) {
                    if (rateLimitAttempt < RETRY_CONFIG.rateLimitRetries) {
                        const delay = Math.min(
                            RETRY_CONFIG.rateLimitBaseDelayMs * Math.pow(2, rateLimitAttempt),
                            RETRY_CONFIG.rateLimitMaxDelayMs
                        );
                        const jitter = Math.random() * 500;
                        console.warn(
                            `[AIRouter] Rate limited by ${provider}. ` +
                            `Retry ${rateLimitAttempt + 1}/${RETRY_CONFIG.rateLimitRetries} in ${Math.round(delay + jitter)}ms`
                        );
                        await new Promise(resolve => setTimeout(resolve, delay + jitter));
                        rateLimitAttempt++;
                        attempt--; // don't consume a normal retry slot
                        continue;
                    }
                    console.warn(`[AIRouter] Rate limit retries exhausted for ${provider}. Falling back to next provider.`);
                    throw lastError;
                }

                // Don't retry on auth errors (401/403)
                if (this.isAuthError(lastError)) {
                    throw lastError;
                }

                // Wait before retrying (exponential backoff)
                if (attempt < RETRY_CONFIG.maxRetries - 1) {
                    const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error(`Provider ${provider} failed after ${RETRY_CONFIG.maxRetries} retries`);
    }

    // Call a specific provider
    private async callProvider(
        provider: AIProvider,
        apiKey: string,
        prompt: string,
        options: GenerateOptions
    ): Promise<string> {
        const config = PROVIDER_CONFIGS[provider];
        if (!config) throw new Error(`Unknown provider: ${provider}`);

        if (provider === 'gemini') {
            return this.generateWithGemini(apiKey, prompt, options);
        } else if (provider === 'anthropic') {
            return this.generateWithAnthropic(apiKey, prompt, options);
        } else if (config.isOpenAICompatible) {
            // OpenRouter needs extra headers for attribution
            const extraHeaders = provider === 'openrouter'
                ? { 'HTTP-Referer': 'https://rankmaster.pro', 'X-Title': 'RankMaster Pro' }
                : undefined;
            return this.generateWithOpenAICompatible(apiKey, config, prompt, options, extraHeaders);
        }

        throw new Error(`Provider ${provider} is not supported`);
    }

    // Validate and clean JSON response
    private validateJsonResponse(result: string): string | null {
        // Try direct parse
        try {
            JSON.parse(result);
            return result;
        } catch { /* continue */ }

        // Try extracting JSON from markdown code blocks
        const codeBlockMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
            try {
                JSON.parse(codeBlockMatch[1].trim());
                return codeBlockMatch[1].trim();
            } catch { /* continue */ }
        }

        // Try extracting JSON object/array from the response
        const jsonMatch = result.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
            try {
                JSON.parse(jsonMatch[1]);
                return jsonMatch[1];
            } catch { /* continue */ }
        }

        return null;
    }

    // Check if error is a rate limit (429)
    private isRateLimitError(error: Error): boolean {
        const msg = error.message.toLowerCase();
        return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('quota');
    }

    // Check if error is an auth error (401/403)
    private isAuthError(error: Error): boolean {
        const msg = error.message.toLowerCase();
        return msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('invalid api key');
    }

    // Log API usage to database
    // Per-call session takes precedence over this.currentSessionId for thread safety
    private async logUsage(
        provider: string, model: string, task: string,
        promptLen: number, resultLen: number,
        session?: { sessionId: string; userId: string }
    ): Promise<void> {
        const tokensIn = Math.ceil(promptLen / 4);
        const tokensOut = Math.ceil(resultLen / 4);

        const COST_PER_M: Record<string, { input: number; output: number }> = {
            gemini: { input: 0.075, output: 0.30 }, openai: { input: 2.50, output: 10.00 },
            anthropic: { input: 3.00, output: 15.00 }, groq: { input: 0.05, output: 0.08 },
            mistral: { input: 0.25, output: 0.25 }, deepseek: { input: 0.14, output: 0.28 },
            cohere: { input: 0.30, output: 0.60 }, openrouter: { input: 0.30, output: 0.60 },
        };
        // For OpenRouter, try to extract actual model cost from the model ID
        const openrouterModelRates: Record<string, { input: number; output: number }> = {
            'deepseek/deepseek-v4-pro': { input: 0.44, output: 0.87 },
            'deepseek/deepseek-v4-flash': { input: 0.10, output: 0.20 },
            'qwen/qwen3-235b-a22b': { input: 0.20, output: 0.60 },
            'qwen/qwen3-32b': { input: 0.08, output: 0.15 },
            'meta-llama/llama-4-maverick': { input: 0.15, output: 0.60 },
            'meta-llama/llama-4-scout': { input: 0.08, output: 0.30 },
            'google/gemini-2.5-flash': { input: 0.15, output: 0.60 },
            'openai/gpt-4o': { input: 2.50, output: 10.00 },
            'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
            'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
        };
        const rates = (provider === 'openrouter' && openrouterModelRates[model])
            ? openrouterModelRates[model]
            : COST_PER_M[provider] || { input: 0.10, output: 0.30 };
        const cost = (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000;

        // Per-call session takes precedence over singleton state (thread-safe)
        const sessionId = session?.sessionId ?? this.currentSessionId ?? null;
        const userId = session?.userId ?? this.currentUserId ?? null;

        try {
            const supabase = createServiceRoleClient();
            await supabase.from('api_usage').insert({
                provider, model, task,
                tokens_in: tokensIn,
                tokens_out: tokensOut,
                estimated_cost: cost,
                session_id: sessionId,
                user_id: userId,
            });
        } catch {
            // Silent fail — cost logging should never break generation
        }
    }

    // Google Gemini
    private async generateWithGemini(apiKey: string, prompt: string, options: GenerateOptions): Promise<string> {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: options.model || 'gemini-2.0-flash',
            generationConfig: {
                temperature: options.temperature || 0.7,
                maxOutputTokens: options.maxTokens || 4096,
                responseMimeType: options.jsonMode ? 'application/json' : 'text/plain',
            },
        });

        const fullPrompt = options.systemPrompt
            ? `${options.systemPrompt}\n\n${prompt}`
            : prompt;

        const result = await model.generateContent(fullPrompt);
        return result.response.text();
    }

    // OpenAI-compatible providers (OpenAI, Groq, Mistral, DeepSeek, Cohere, OpenRouter)
    private async generateWithOpenAICompatible(
        apiKey: string, config: ProviderConfig, prompt: string, options: GenerateOptions,
        extraHeaders?: Record<string, string>
    ): Promise<string> {
        const client = new OpenAI({
            apiKey,
            baseURL: config.baseUrl || undefined,
            defaultHeaders: extraHeaders,
        });

        const modelId = options.model || config.models[0]?.id || 'gpt-4o';

        const messages: { role: 'system' | 'user'; content: string }[] = [];
        if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const completion = await client.chat.completions.create({
            model: modelId,
            messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 4096,
            ...(options.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
        });

        const content = completion.choices[0]?.message?.content || '';
        if (!content.trim()) {
            console.warn(`[AIRouter] Empty response from ${modelId}. Finish reason: ${completion.choices[0]?.finish_reason}`);
            throw new Error(`Empty response from ${modelId}`);
        }
        return content;
    }

    // Anthropic Claude (uses its own message format)
    private async generateWithAnthropic(apiKey: string, prompt: string, options: GenerateOptions): Promise<string> {
        const modelId = options.model || 'claude-3-5-sonnet-20241022';

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: modelId,
                max_tokens: options.maxTokens || 4096,
                system: options.systemPrompt || '',
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        const data = await response.json();
        return data.content?.[0]?.text || '';
    }

    // ==========================================
    // Streaming support
    // ==========================================

    async * generateStream(
        taskType: TaskType,
        prompt: string,
        options: GenerateOptions = {}
    ): AsyncGenerator<string, void, unknown> {
        if (!this.keysLoaded) await this.loadKeys();

        // Extract per-call session for thread-safe cost attribution
        const session = options.session;

        const { provider, model: smartModel } = this.pickProviderAndModel(taskType, options.provider, options.model);
        const mergedOptions = { ...options, model: options.model || smartModel };
        const apiKey = this.getKey(provider);
        if (!apiKey) throw new Error(`No API key for ${PROVIDER_CONFIGS[provider].label}`);

        const config = PROVIDER_CONFIGS[provider];
        let totalOutput = '';

        if (provider === 'gemini') {
            for await (const chunk of this.streamGemini(apiKey, prompt, mergedOptions)) {
                totalOutput += chunk;
                yield chunk;
            }
        } else if (provider === 'anthropic') {
            for await (const chunk of this.streamAnthropic(apiKey, prompt, mergedOptions)) {
                totalOutput += chunk;
                yield chunk;
            }
        } else if (config.isOpenAICompatible) {
            const extraHeaders = provider === 'openrouter'
                ? { 'HTTP-Referer': 'https://rankmaster.pro', 'X-Title': 'RankMaster Pro' }
                : undefined;
            for await (const chunk of this.streamOpenAICompatible(apiKey, config, prompt, mergedOptions, extraHeaders)) {
                totalOutput += chunk;
                yield chunk;
            }
        } else {
            // Fallback: non-streaming
            const result = await this.generate(taskType, prompt, options);
            yield result;
            totalOutput = result;
        }

        // Log usage after streaming completes
        this.logUsage(provider, options.model || config.models[0]?.id || 'unknown', taskType, prompt.length, totalOutput.length, session).catch(() => { });
    }

    private async * streamGemini(apiKey: string, prompt: string, options: GenerateOptions): AsyncGenerator<string> {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: options.model || 'gemini-2.0-flash',
            generationConfig: {
                temperature: options.temperature || 0.7,
                maxOutputTokens: options.maxTokens || 4096,
                responseMimeType: options.jsonMode ? 'application/json' : 'text/plain',
            },
        });

        const fullPrompt = options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;
        const result = await model.generateContentStream(fullPrompt);

        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) yield text;
        }
    }

    private async * streamOpenAICompatible(
        apiKey: string, config: ProviderConfig, prompt: string, options: GenerateOptions,
        extraHeaders?: Record<string, string>
    ): AsyncGenerator<string> {
        const client = new OpenAI({ apiKey, baseURL: config.baseUrl || undefined, defaultHeaders: extraHeaders });
        const modelId = options.model || config.models[0]?.id || 'gpt-4o';

        const messages: { role: 'system' | 'user'; content: string }[] = [];
        if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
        messages.push({ role: 'user', content: prompt });

        const stream = await client.chat.completions.create({
            model: modelId,
            messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 4096,
            stream: true,
        });

        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) yield text;
        }
    }

    private async * streamAnthropic(apiKey: string, prompt: string, options: GenerateOptions): AsyncGenerator<string> {
        const modelId = options.model || 'claude-3-5-sonnet-20241022';

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: modelId,
                max_tokens: options.maxTokens || 4096,
                system: options.systemPrompt || '',
                messages: [{ role: 'user', content: prompt }],
                stream: true,
            }),
        });

        if (!response.ok) throw new Error(`Anthropic stream error: ${response.status}`);
        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            yield parsed.delta.text;
                        }
                    } catch { /* skip unparseable lines */ }
                }
            }
        }
    }
}

// Singleton
let routerInstance: AIRouter | null = null;

export function getAIRouter(): AIRouter {
    if (!routerInstance) {
        routerInstance = new AIRouter();
    }
    return routerInstance;
}

// Force reload keys (call after settings change)
export async function reloadAIRouter(): Promise<void> {
    routerInstance = new AIRouter();
    await routerInstance.loadKeys();
}

// Export provider configs for the admin panel
export { PROVIDER_CONFIGS };

// ── routeAI convenience function ─────────────────────────────────
// Bridges the simplified call pattern used across API routes to the
// AIRouter class. Supports both { text, provider } and
// { success, content, provider } return shapes.
export async function routeAI(opts: {
    task: string;
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    json?: boolean;
    jsonMode?: boolean;
    temperature?: number;
    provider?: AIProvider;
    model?: string;
    /** Per-call session for thread-safe cost attribution */
    session?: { sessionId: string; userId: string };
}): Promise<{ text: string; content: string; provider: string; success: boolean }> {
    const router = getAIRouter();
    const taskType = (opts.task || 'content_writing') as TaskType;
    const useJson = opts.jsonMode ?? opts.json ?? false;

    try {
        const result = await router.generate(taskType, opts.prompt, {
            systemPrompt: opts.systemPrompt,
            maxTokens: opts.maxTokens,
            jsonMode: useJson,
            temperature: opts.temperature,
            provider: opts.provider,
            model: opts.model,
            session: opts.session,
        });

        // Determine which provider was actually used (best-effort)
        const providers = router.getAvailableProviders().filter(p => p.configured);
        const usedProvider = opts.provider || providers[0]?.provider || 'unknown';

        return { text: result, content: result, provider: usedProvider, success: true };
    } catch (error) {
        console.error('[routeAI] Generation failed:', error);
        return { text: '', content: '', provider: 'none', success: false };
    }
}
