// ============================================================
// RankMaster Pro - AI Playground API
// Test prompts against all 8 providers side-by-side
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    prompt: z.string().min(1).max(10000),
    providers: z.array(z.enum(['gemini', 'openai', 'anthropic', 'groq', 'mistral', 'deepseek', 'cohere', 'openrouter'])).min(1).max(8).default(['openai', 'gemini']),
    task: z.enum(['content_writing', 'outline_generation', 'content_scoring', 'meta_generation', 'keyword_suggestion', 'competitor_analysis', 'content_optimization']).default('content_writing'),
    max_tokens: z.number().int().min(50).max(4000).default(500),
    system_prompt: z.string().max(1000).optional(),
    json_mode: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { prompt, providers, task, max_tokens, system_prompt, json_mode } = parsed.data;

    const results = await Promise.allSettled(
        providers.map(async (provider) => {
            const start = Date.now();
            const result = await routeAI({
                task,
                prompt,
                systemPrompt: system_prompt,
                maxTokens: max_tokens,
                jsonMode: json_mode,
                provider: provider as Parameters<typeof routeAI>[0]['provider'],
            });
            const duration = Date.now() - start;
            return {
                provider,
                success: result.success,
                content: result.content || '',
                error: result.success ? null : 'Generation failed',
                duration_ms: duration,
                model: provider,
            };
        })
    );

    const responses = results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return { provider: providers[i], success: false, content: '', error: String(r.reason), duration_ms: 0, model: providers[i] };
    });

    // Log usage
    await auth.supabase.from('playground_runs').insert({
        user_id: auth.user.id,
        prompt: prompt.substring(0, 500),
        task,
        providers_tested: providers,
        success_count: responses.filter(r => r.success).length,
    });

    return NextResponse.json({ responses, prompt_length: prompt.length });
}
