// ============================================================
// TEMPORARY: AI Provider Test Endpoint
// DELETE after debugging — tests each configured provider
// ============================================================

import { NextResponse } from 'next/server';
import { getAIRouter } from '@/lib/ai/router';
import { getAuthUser } from '@/lib/auth-guard';

export async function GET() {
    try {
        const auth = await getAuthUser();
        if (auth.error) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const ai = getAIRouter();
        await ai.loadKeys(auth.supabase);

        const providers = ai.getAvailableProviders();
        const results: Record<string, unknown> = {};

        for (const p of providers) {
            if (!p.configured) {
                results[p.provider] = { status: 'NO_KEY', message: 'No API key configured' };
                continue;
            }

            try {
                const start = Date.now();
                const response = await ai.generate('keyword_suggestion', 'Reply with exactly: HELLO_OK', {
                    provider: p.provider as NonNullable<Parameters<typeof ai.generate>[2]>['provider'],
                    temperature: 0,
                    maxTokens: 20,
                });
                const elapsed = Date.now() - start;
                results[p.provider] = {
                    status: 'OK',
                    message: `Working! Response: "${response.substring(0, 50)}"`,
                    latencyMs: elapsed,
                };
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                const is429 = /429|rate.?limit|too many|quota/i.test(msg);
                const isAuth = /401|403|unauthorized|invalid.*key/i.test(msg);
                results[p.provider] = {
                    status: is429 ? 'RATE_LIMITED' : isAuth ? 'BAD_KEY' : 'ERROR',
                    message: msg.substring(0, 200),
                };
            }
        }

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            results,
            summary: Object.entries(results).map(
                ([k, v]) => `${k}: ${(v as { status: string }).status}`
            ).join(', '),
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Test failed' },
            { status: 500 }
        );
    }
}
