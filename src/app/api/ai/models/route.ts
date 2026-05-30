// =============================================================
// GET /api/ai/models?provider=openrouter
// Returns the list of available models for a given AI provider.
// Fetches live from providers that support /v1/models, falls back
// to a curated static list for providers that don't.
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/supabase';

interface ModelEntry { id: string; name: string; }

// Static fallback lists (used when live fetch fails or provider has no list API)
const STATIC_MODELS: Record<string, ModelEntry[]> = {
    gemini: [
        { id: 'gemini-2.0-flash',           name: 'Gemini 2.0 Flash' },
        { id: 'gemini-2.0-flash-lite',       name: 'Gemini 2.0 Flash Lite' },
        { id: 'gemini-1.5-pro',             name: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash',           name: 'Gemini 1.5 Flash' },
        { id: 'gemini-1.5-flash-8b',        name: 'Gemini 1.5 Flash 8B' },
    ],
    anthropic: [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022',  name: 'Claude 3.5 Haiku' },
        { id: 'claude-3-opus-20240229',     name: 'Claude 3 Opus' },
        { id: 'claude-3-sonnet-20240229',   name: 'Claude 3 Sonnet' },
        { id: 'claude-3-haiku-20240307',    name: 'Claude 3 Haiku' },
    ],
    cohere: [
        { id: 'command-r-plus',   name: 'Command R+' },
        { id: 'command-r',        name: 'Command R' },
        { id: 'command-light',    name: 'Command Light' },
        { id: 'command',          name: 'Command' },
    ],
};

// Providers that support the OpenAI-compatible /v1/models endpoint
const OPENAI_COMPAT_LIST: Record<string, string> = {
    openai:     'https://api.openai.com/v1/models',
    groq:       'https://api.groq.com/openai/v1/models',
    mistral:    'https://api.mistral.ai/v1/models',
    deepseek:   'https://api.deepseek.com/v1/models',
    openrouter: 'https://openrouter.ai/api/v1/models',
};

// Friendly display name helper (strips provider prefix, cleans up ID)
function toDisplayName(id: string): string {
    // For OpenRouter format: "openai/gpt-4o" → "GPT-4o (OpenAI)"
    if (id.includes('/')) {
        const [provider, model] = id.split('/');
        const cleanModel = model
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        return `${cleanModel} (${provider.replace(/\b\w/g, c => c.toUpperCase())})`;
    }
    return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const provider = searchParams.get('provider');

        if (!provider) {
            return NextResponse.json({ error: 'provider query param required' }, { status: 400 });
        }

        // Load API key from DB
        const supabase = createServiceRoleClient();
        const { data: setting } = await supabase
            .from('settings')
            .select('value')
            .eq('key', `${provider}_api_key`)
            .single();

        const apiKey = setting?.value;

        // Return static list if no key configured, EXCEPT for providers with public model lists
        if (!apiKey && provider !== 'openrouter') {
            const staticList = STATIC_MODELS[provider] || [];
            return NextResponse.json({ models: staticList, source: 'static' });
        }

        // --- Providers with OpenAI-compatible model list endpoint ---
        const listUrl = OPENAI_COMPAT_LIST[provider];
        if (listUrl) {
            try {
                const headers: Record<string, string> = {};
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                
                // OpenRouter requires these headers
                if (provider === 'openrouter') {
                    headers['HTTP-Referer'] = 'https://rankmaster.pro';
                    headers['X-Title'] = 'RankMaster Pro';
                }

                const res = await fetch(listUrl, { headers, next: { revalidate: 300 } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();
                const rawModels: { id: string; name?: string; display_name?: string }[] =
                    data.data || data.models || [];

                const models: ModelEntry[] = rawModels
                    .map(m => ({
                        id: m.id,
                        name: m.display_name || m.name || toDisplayName(m.id),
                    }))
                    .sort((a, b) => a.id.localeCompare(b.id));

                return NextResponse.json({ models, source: 'live' });
            } catch (err) {
                // Fall through to static
                console.warn(`[ai/models] Live fetch failed for ${provider}:`, err);
            }
        }

        // --- Gemini: use the REST list API ---
        if (provider === 'gemini') {
            try {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
                    { next: { revalidate: 300 } }
                );
                if (res.ok) {
                    const data = await res.json();
                    const models: ModelEntry[] = (data.models || [])
                        .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
                            m.supportedGenerationMethods?.includes('generateContent')
                        )
                        .map((m: { name: string; displayName?: string }) => ({
                            id: m.name.replace('models/', ''),
                            name: m.displayName || m.name.replace('models/', ''),
                        }));
                    return NextResponse.json({ models, source: 'live' });
                }
            } catch {
                // Fall through to static
            }
        }

        // Final fallback: static list
        const staticList = STATIC_MODELS[provider] || [];
        return NextResponse.json({ models: staticList, source: 'static' });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch models' },
            { status: 500 }
        );
    }
}
