// ============================================================
// TEMPORARY: Diagnostic SSE stream test
// Tests that SSE streaming works end-to-end (frontend → backend)
// DELETE after debugging
// ============================================================

import { NextRequest } from 'next/server';
import { getAIRouter } from '@/lib/ai/router';
import { getAuthUser } from '@/lib/auth-guard';

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const keyword = body.keyword || 'test keyword';

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                console.log(`[test-stream] Sending event: ${event}, size: ${payload.length}`);
                controller.enqueue(encoder.encode(payload));
            };

            try {
                // Stage 1: Test basic SSE
                send('stage', { stage: 'test1', message: 'Testing basic SSE event...' });
                await new Promise(r => setTimeout(r, 500));

                // Stage 2: Test AI call
                send('stage', { stage: 'test2', message: 'Testing AI generation...' });
                const ai = getAIRouter();
                await ai.loadKeys(auth.supabase);

                const aiStart = Date.now();
                let aiResult = '';
                try {
                    aiResult = await ai.generate('keyword_suggestion', `Write a 2-sentence summary about "${keyword}". Return plain text only.`, {
                        temperature: 0.5,
                        maxTokens: 200,
                    });
                    console.log(`[test-stream] AI call succeeded in ${Date.now() - aiStart}ms, result length: ${aiResult.length}`);
                } catch (aiErr) {
                    const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
                    console.error(`[test-stream] AI call FAILED in ${Date.now() - aiStart}ms:`, msg);
                    send('error', { message: `AI call failed: ${msg}` });
                    controller.close();
                    return;
                }

                // Stage 3: Send content_raw (simulates the real flow)
                send('stage', { stage: 'test3', message: 'Sending content preview...' });
                send('content_raw', { content: `<h1>${keyword}</h1><p>${aiResult}</p>` });
                await new Promise(r => setTimeout(r, 300));

                // Stage 4: Send complete event (this is what was failing)
                const completePayload = {
                    content: {
                        title: keyword,
                        metaTitle: keyword,
                        metaDescription: aiResult.substring(0, 160),
                        content: `<h1>${keyword}</h1><p>${aiResult}</p><h2>Test Section</h2><p>This is a test article to verify SSE streaming works correctly.</p>`,
                        faqSection: [],
                        schemaMarkup: {},
                    },
                    score: {
                        overall: 75, seo: 70, aeo: 65, eeat: 60, readability: 80,
                        snippet: 50, schema: 40, links: 30, freshness: 70,
                        depth: 60, intent: 75, geo: 50, serpCorrelation: 0,
                        topicCoverage: 0, missingTopics: [],
                    },
                    naturalness: { score: 80, issues: [] },
                    outline: { title: keyword, sections: [] },
                    internalLinks: [],
                    externalLinks: [],
                    slug: keyword.toLowerCase().replace(/\s+/g, '-'),
                    sessionId: 'test-session',
                    metaValidation: { valid: true },
                    serpData: { results: [], paaQuestions: [], serpFeatures: {}, competitorCount: 0 },
                };

                const completeSize = JSON.stringify(completePayload).length;
                console.log(`[test-stream] Sending complete event, payload size: ${completeSize} bytes`);
                send('complete', completePayload);
                console.log(`[test-stream] Complete event sent successfully`);

            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Test stream failed';
                console.error('[test-stream] ERROR:', msg);
                send('error', { message: msg });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
