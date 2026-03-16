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
    | 'mistral' | 'deepseek' | 'cohere';

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
};

// Task types for smart routing
export type TaskType = 'content_writing' | 'content_optimization' | 'content_scoring' |
    'keyword_suggestion' | 'competitor_analysis' | 'topic_research' |
    'meta_generation' | 'schema_generation' | 'outline_generation' |
    'blueprint_analysis' | 'section_writing' | 'serp_analysis' |
    'internal_linking' | 'image_analysis';

// ── Smart Task → Provider+Model Map ──────────────────────────────
// Each task type maps to an ordered list of preferred provider+model.
// The router picks the first available one based on configured API keys.
const TASK_MODEL_MAP: Record<TaskType, { provider: AIProvider; model: string }[]> = {
    // ── Content Writing (human-like prose) → Claude > GPT-4o > Gemini ──
    content_writing: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }, { provider: 'openai', model: 'gpt-4o' }, { provider: 'gemini', model: 'gemini-2.0-flash' }],
    section_writing: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }, { provider: 'openai', model: 'gpt-4o' }, { provider: 'gemini', model: 'gemini-2.0-flash' }],
    content_optimization: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }, { provider: 'openai', model: 'gpt-4o' }, { provider: 'gemini', model: 'gemini-2.0-flash' }],

    // ── Structured / Analytical (JSON, data) → Gemini Flash > GPT-4o-mini ──
    outline_generation: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }, { provider: 'anthropic', model: 'claude-3-haiku-20240307' }],
    blueprint_analysis: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }],
    content_scoring: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }],
    keyword_suggestion: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }],
    topic_research: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }],
    schema_generation: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }],
    serp_analysis: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }],
    internal_linking: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }],
    competitor_analysis: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o-mini' }],

    // ── Creative Copy (CTR-optimized) → GPT-4o > Claude > Gemini ──
    meta_generation: [{ provider: 'openai', model: 'gpt-4o' }, { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }, { provider: 'gemini', model: 'gemini-2.0-flash' }],

    // ── Multimodal (images) → GPT-4o > Gemini Pro ──
    image_analysis: [{ provider: 'openai', model: 'gpt-4o' }, { provider: 'gemini', model: 'gemini-1.5-pro' }],
};

// Retry configuration
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxProviderFallbacks: 3,
    // Rate-limit (429) specific: longer delays to let the provider reset
    rateLimitRetries: 3,
    rateLimitBaseDelayMs: 2000,
    rateLimitMaxDelayMs: 30000,
};

export interface GenerateOptions {
    systemPrompt?: string;
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    model?: string;
    provider?: AIProvider;
}

export class AIRouter {
    private providerKeys: Record<string, string> = {};
    private defaultProvider: AIProvider = 'gemini';
    private premiumProvider: AIProvider = 'openai';
    private keysLoaded = false;
    private currentSessionId: string | null = null;
    private currentUserId: string | null = null;

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

    // Load API keys from database settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async loadKeys(externalSupabase?: any): Promise<void> {
        try {
            const supabase = externalSupabase || createServiceRoleClient();
            const { data } = await supabase
                .from('settings')
                .select('key, value')
                .eq('category', 'ai');

            this.providerKeys = {};
            for (const setting of data || []) {
                if (setting.value) {
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

    // Session tracking for per-post cost grouping
    setSession(sessionId: string, userId?: string): void {
        this.currentSessionId = sessionId;
        if (userId) this.currentUserId = userId;
    }

    clearSession(): void {
        this.currentSessionId = null;
        this.currentUserId = null;
    }

    getSessionId(): string | null {
        return this.currentSessionId;
    }

    // Smart route: pick the best provider AND model for a task
    private pickProviderAndModel(
        taskType: TaskType,
        preferredProvider?: AIProvider,
        preferredModel?: string
    ): { provider: AIProvider; model: string } {
        // 1. If user explicitly specified a provider, honour it
        if (preferredProvider && this.getKey(preferredProvider)) {
            const model = preferredModel
                || TASK_MODEL_MAP[taskType]?.find(m => m.provider === preferredProvider)?.model
                || PROVIDER_CONFIGS[preferredProvider].models[0]?.id;
            return { provider: preferredProvider, model };
        }

        // 2. Consult the task model map — pick first available provider+model
        const candidates = TASK_MODEL_MAP[taskType] || [];
        for (const candidate of candidates) {
            if (this.getKey(candidate.provider)) {
                console.log(`[AIRouter] Smart route: ${taskType} → ${candidate.provider}/${candidate.model}`);
                return { provider: candidate.provider, model: preferredModel || candidate.model };
            }
        }

        // 3. Fallback to user-configured default provider
        if (this.getKey(this.defaultProvider)) {
            const model = preferredModel || PROVIDER_CONFIGS[this.defaultProvider].models[0]?.id;
            return { provider: this.defaultProvider, model };
        }

        // 4. Fallback to any available provider
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

        const { provider: primaryProvider, model: smartModel } = this.pickProviderAndModel(taskType, options.provider, options.model);
        // Inject the smart-selected model into options so downstream callProvider uses it
        const mergedOptions = { ...options, model: options.model || smartModel };
        const fallbackProviders = this.getFallbackChain(primaryProvider, taskType);
        const providersToTry = [primaryProvider, ...fallbackProviders].slice(0, RETRY_CONFIG.maxProviderFallbacks);

        let lastError: Error | null = null;

        for (const provider of providersToTry) {
            try {
                // For fallback providers, pick their best model for this task
                const fallbackOpts = provider === primaryProvider
                    ? mergedOptions
                    : { ...mergedOptions, model: TASK_MODEL_MAP[taskType]?.find(c => c.provider === provider)?.model || PROVIDER_CONFIGS[provider].models[0]?.id };
                const result = await this.generateWithRetry(provider, taskType, prompt, fallbackOpts);
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn(`[AIRouter] Provider ${provider} failed: ${lastError.message}. Trying next...`);
            }
        }

        throw lastError || new Error('All AI providers failed. Check your API keys in Settings.');
    }

    // Generate with retry logic for a single provider
    private async generateWithRetry(
        provider: AIProvider,
        taskType: TaskType,
        prompt: string,
        options: GenerateOptions
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
                        this.logUsage(provider, options.model || PROVIDER_CONFIGS[provider].models[0]?.id || 'unknown', taskType, prompt.length, result.length).catch(() => { });
                        return validated;
                    }
                    // JSON validation failed — retry
                    throw new Error('Response is not valid JSON');
                }

                // Log usage (fire-and-forget)
                this.logUsage(provider, options.model || PROVIDER_CONFIGS[provider].models[0]?.id || 'unknown', taskType, prompt.length, result.length).catch(() => { });
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

        if (provider === 'gemini') {
            return this.generateWithGemini(apiKey, prompt, options);
        } else if (provider === 'anthropic') {
            return this.generateWithAnthropic(apiKey, prompt, options);
        } else if (config.isOpenAICompatible) {
            return this.generateWithOpenAICompatible(apiKey, config, prompt, options);
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
    private async logUsage(provider: string, model: string, task: string, promptLen: number, resultLen: number): Promise<void> {
        const tokensIn = Math.ceil(promptLen / 4);
        const tokensOut = Math.ceil(resultLen / 4);

        const COST_PER_M: Record<string, { input: number; output: number }> = {
            gemini: { input: 0.075, output: 0.30 }, openai: { input: 2.50, output: 10.00 },
            anthropic: { input: 3.00, output: 15.00 }, groq: { input: 0.05, output: 0.08 },
            mistral: { input: 0.25, output: 0.25 }, deepseek: { input: 0.14, output: 0.28 },
            cohere: { input: 0.30, output: 0.60 },
        };
        const rates = COST_PER_M[provider] || { input: 0.10, output: 0.30 };
        const cost = (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000;

        try {
            const supabase = createServiceRoleClient();
            await supabase.from('api_usage').insert({
                provider, model, task,
                tokens_in: tokensIn,
                tokens_out: tokensOut,
                estimated_cost: cost,
                session_id: this.currentSessionId || null,
                user_id: this.currentUserId || null,
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

    // OpenAI-compatible providers (OpenAI, Groq, Mistral, DeepSeek, Cohere)
    private async generateWithOpenAICompatible(
        apiKey: string, config: ProviderConfig, prompt: string, options: GenerateOptions
    ): Promise<string> {
        const client = new OpenAI({
            apiKey,
            baseURL: config.baseUrl || undefined,
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

        return completion.choices[0]?.message?.content || '';
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
            for await (const chunk of this.streamOpenAICompatible(apiKey, config, prompt, mergedOptions)) {
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
        this.logUsage(provider, options.model || config.models[0]?.id || 'unknown', taskType, prompt.length, totalOutput.length).catch(() => { });
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
        apiKey: string, config: ProviderConfig, prompt: string, options: GenerateOptions
    ): AsyncGenerator<string> {
        const client = new OpenAI({ apiKey, baseURL: config.baseUrl || undefined });
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
