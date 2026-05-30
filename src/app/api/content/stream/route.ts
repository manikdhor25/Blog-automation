// ============================================================
// RankMaster Pro - SSE Streaming Content Generation API (v2)
// Pipeline: SERP → deep extract → blueprint → outline →
//           section-by-section write → assemble → score
// Streams progress events for each stage
// ============================================================

import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getSERPIntelligence, DeepPageContent, CompetitorBlueprint } from '@/lib/engines/serp-intelligence';
import { SERPResult } from '@/lib/types';
import { getContentWriter, countWordsInHTML } from '@/lib/engines/content-writer';
import { detectSearchIntent } from '@/lib/engines/content-utils';
import { getContentScorer } from '@/lib/engines/content-scorer';
import { getLinkingEngine } from '@/lib/engines/linking-engine';
import { getAIRouter } from '@/lib/ai/router';
import { generateSEOSlug, validateMeta, calculateDynamicWordCount } from '@/lib/utils/seo-utils';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';
import { scoreNaturalness } from '@/lib/engines/naturalness-scorer';
import { generateOutline } from '@/lib/engines/outline-generator';
// RP-1: cleanAIPatterns import removed — no longer called directly here (runs inside quality gate)
import { runQualityControl } from '@/lib/engines/quality-control-engine';
import { buildUnifiedScore } from '@/lib/engines/score-normalizer';
import { getPostCostReport } from '@/lib/engines/cost-calculator';

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const rateLimited = checkRateLimit(auth.user.id, '/api/content/stream', { maxRequests: 5, windowMs: 60_000 });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { keyword, site_id, language, is_cluster, content_type, existing_outline } = body;

    if (!keyword) {
        return new Response(JSON.stringify({ error: 'Keyword is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const pipelineStart = Date.now();
            const send = (event: string, data: unknown) => {
                const payload = JSON.stringify(data);
                const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
                console.log(`[stream][${elapsed}s] Sending event: ${event}, payload: ${payload.length} bytes`);
                controller.enqueue(
                    encoder.encode(`event: ${event}\ndata: ${payload}\n\n`)
                );
            };

            // Track generation start time
            const generationStartTime = Date.now();

            try {
                // Pre-load AI keys first
                const ai = getAIRouter();
                await ai.loadKeys(auth.supabase);

                // Start cost-tracking session for this generation
                const sessionId = randomUUID();
                ai.setSession(sessionId, auth.user.id);

                let siteNiche = '';
                let siteUrl = '';
                let sitePosts: { id: string; title: string; slug: string; keywords: string[] }[] = [];

                if (site_id) {
                    const { data: site } = await auth.supabase
                        .from('sites').select('*').eq('id', site_id).eq('user_id', auth.user.id).single();
                    if (site) {
                        siteNiche = site.niche;
                        siteUrl = site.url;
                        const linker = getLinkingEngine();
                        const linkGraph = await linker.buildSiteLinkGraph(site_id);
                        sitePosts = linkGraph.posts;
                    }
                }

                const isCluster = is_cluster || false;

                // ── Fast path: Reuse existing outline ──────────
                // If the frontend already generated an outline, skip the expensive
                // SERP research + blueprint + outline pipeline (saves 3-5 AI calls).
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let outline: any;
                let competitors: DeepPageContent[] = [];
                let blueprint: CompetitorBlueprint = {
                    avgWordCount: 0, avgSectionCount: 0,
                    consensusHeadings: [],
                    contentGaps: [],
                    uniqueAngles: [],
                    snippetFormats: [],
                    keyStatistics: [],
                    faqPatterns: [],
                    tableTopics: [],
                    topCompetitorSections: [],
                };
                let searchResults: { results: Omit<SERPResult, 'id' | 'keyword_id' | 'fetched_at'>[]; totalResults: number; searchTime: number } = { results: [], totalResults: 0, searchTime: 0 };
                let paaQuestions: string[] = [];
                let minWords = 1500;

                if (existing_outline && existing_outline.sections && existing_outline.sections.length > 0) {
                    // ✅ FAST PATH: Outline already exists
                    console.log(`[stream] Using existing outline: "${existing_outline.title}", ${existing_outline.sections.length} sections`);
                    send('stage', { stage: 'writing', message: 'Using your approved outline — skipping research...' });
                    outline = existing_outline;
                    minWords = existing_outline.totalTargetWords || 1500;
                } else {
                    // ── Slow path: Full pipeline from scratch ──────

                    // ── Stage 1: SERP Research (10 results) ────────
                    send('stage', { stage: 'research', message: 'Searching Google US for top 10 ranked pages...' });

                    const serp = getSERPIntelligence();
                    searchResults = serp.isConfigured()
                        ? await serp.searchGoogle(keyword, { num: 10 })
                        : { results: [], totalResults: 0, searchTime: 0 };

                    send('stage', { stage: 'extracting', message: `Deep-extracting ${Math.min(searchResults.results.length, 10)} competitor pages...` });

                    // ── Stage 2: Deep extract competitors ──────────
                    const fetchPromises = searchResults.results.slice(0, 10).map(async (result) => {
                        const deep = await serp.deepExtractContent(result.url, result.title);
                        if (deep) competitors.push(deep);
                    });
                    await Promise.all(fetchPromises);

                    send('stage', { stage: 'blueprint', message: `Building competitor blueprint from ${competitors.length} pages...` });

                    // ── Stage 3: Build competitor blueprint ────────
                    blueprint = await serp.buildCompetitorBlueprint(competitors, keyword);
                    paaQuestions = serp.extractPAAQuestions(searchResults.results);

                    send('competitor_insight', {
                        avgWordCount: blueprint.avgWordCount,
                        avgSectionCount: blueprint.avgSectionCount,
                        consensusTopics: blueprint.consensusHeadings.length,
                        contentGaps: blueprint.contentGaps.length,
                        competitorCount: competitors.length,
                    });

                    // ── Stage 4: Generate AI outline ───────────────
                    send('stage', { stage: 'outline', message: 'Generating article outline from competitor blueprint...' });

                    const competitorCounts = competitors.map(c => c.totalWordCount).filter(w => w > 0);
                    minWords = calculateDynamicWordCount(competitorCounts, isCluster);

                    outline = await generateOutline(keyword, blueprint, competitors, {
                        niche: siteNiche,
                        language: language || 'en',
                        isCluster,
                        paaQuestions,
                        minWordCount: minWords,
                        contentType: content_type || undefined,
                    });
                }

                send('outline', {
                    title: outline.title,
                    sectionCount: outline.sections.length,
                    totalTargetWords: outline.totalTargetWords,
                    sections: outline.sections.map((s: { h2: string; targetWords: number; contentType: string }) => ({
                        h2: s.h2,
                        targetWords: s.targetWords,
                        contentType: s.contentType,
                    })),
                });

                // ── Stage 5: Section-by-section writing ────────
                send('stage', { stage: 'writing', message: `Writing ${outline.sections.length} sections individually...` });

                const writer = getContentWriter();
                console.log(`[stream] Starting generateFromOutline: ${outline.sections.length} sections`);
                const writeStart = Date.now();
                const generated = await writer.generateFromOutline(keyword, outline, {
                    language: language || 'en',
                    niche: siteNiche,
                    isCluster,
                    siteId: site_id || undefined,
                });
                console.log(`[stream] generateFromOutline completed in ${((Date.now() - writeStart) / 1000).toFixed(1)}s, content length: ${generated.content?.length || 0}`);

                // Send content progress
                send('content_raw', { content: generated.content });

                // ── Stage 6: Word count check ──────────────────
                const wordCount = countWordsInHTML(generated.content);
                if (wordCount < minWords) {
                    send('stage', { stage: 'expanding', message: `Expanding content (${wordCount}/${minWords} words)...` });
                    generated.content = await writer.enforceMinimumWordCount(
                        generated.content, keyword, minWords, language || 'en', isCluster
                    );
                }

                // ── Stage 6.5: Quality Metrics ────────────────────
                // SE-1 FIX: Quality gate already runs inside generateFromOutline() at content-writer.ts L717.
                // RP-1 FIX: cleanAIPatterns also runs inside the quality gate — no need to call it again.
                // We extract the metrics from the internal gate run instead of running a duplicate.
                const qualityMetrics = generated.qualityMetrics;

                send('quality_gate', {
                    naturalnessScore: qualityMetrics?.naturalnessScore ?? 0,
                    factualityScore: qualityMetrics?.factualityScore ?? 0,
                    readabilityGrade: qualityMetrics?.readabilityGrade ?? 0,
                    aiPhraseCount: qualityMetrics?.aiPhraseCount ?? 0,
                    gatePasses: qualityMetrics?.qualityGatePasses ?? 0,
                    sentenceRewrites: qualityMetrics?.sentenceRewrites ?? 0,
                });

                // ── Stage 7: Post-processing ───────────────────
                send('stage', { stage: 'optimizing', message: 'Scoring, linking, and optimizing...' });

                // Generate meta tags (use outline meta if available)
                const metaTitle = outline.metaTitle || generated.metaTitle || keyword;
                const metaDescription = outline.metaDescription || generated.metaDescription || '';
                const slug = generateSEOSlug(keyword);

                // Post-processing: wrap in try/catch so a failure in scoring/linking
                // doesn't prevent the user from getting their generated content.
                let internalLinks: { anchorText: string; targetUrl: string; targetTitle: string; relevanceScore: number; type: 'internal' | 'external' }[] = [];
                let externalLinks: { anchorText: string; targetUrl: string; targetTitle: string; relevanceScore: number; type: 'internal' | 'external' }[] = [];
                let linkedContent = generated.content;
                let unifiedScore = { overall: 0, seo: 0, aeo: 0, eeat: 0, readability: 0, snippet: 0, schema: 0, links: 0, freshness: 0, depth: 0, intent: 0, geo: 0, serpCorrelation: 0, topicCoverage: 0, missingTopics: [] as string[] };
                let naturalness = { score: 0, issues: [] as string[] };
                let missingStructure: string[] = [];
                let metaValidation = validateMeta(metaTitle, metaDescription, keyword, slug);

                try {
                    // ── SPEED OPT: Parallelize link suggestions ────
                    const linker = getLinkingEngine();
                    const [internalResult, externalResult] = await Promise.all([
                        (site_id && sitePosts.length > 0)
                            ? linker.suggestInternalLinks(generated.content, keyword, sitePosts, siteUrl)
                            : Promise.resolve([]),
                        linker.suggestExternalLinks(generated.content, keyword),
                    ]);
                    internalLinks = internalResult as typeof internalLinks;
                    externalLinks = externalResult as typeof externalLinks;

                    // Insert links
                    const allLinks = [...internalLinks, ...externalLinks];
                    if (allLinks.length > 0) {
                        linkedContent = linker.insertLinksIntoContent(generated.content, allLinks);
                    }

                    // Build legacy competitor data for scorer
                    const competitorData = competitors.map(c => ({
                        content: c.sections.map(s => s.content).join(' ').substring(0, 5000),
                        wordCount: c.totalWordCount,
                    }));

                    // ── SPEED OPT: Run scoring + local analyses in parallel ────
                    const scorer = getContentScorer();
                    const detectedIntent = detectSearchIntent(keyword);

                    const [score, naturalnessResult, structureResult, qcReport] = await Promise.all([
                        // AI-based scoring (async)
                        scorer.scoreContent(linkedContent, keyword, {
                            competitorWordCounts: competitorData.map(c => c.wordCount),
                            competitorContents: competitorData.map(c => c.content),
                            hasSchema: true,
                            internalLinkCount: internalLinks.length,
                            externalLinkCount: externalLinks.length,
                        }),
                        // Local naturalness scoring (sync but wrapped for Promise.all)
                        Promise.resolve(scoreNaturalness(linkedContent)),
                        // Local structure validation (sync but wrapped for Promise.all)
                        Promise.resolve(writer.validateStructure(linkedContent)),
                        // Local QC report (sync but wrapped for Promise.all)
                        Promise.resolve(runQualityControl({
                            primaryKeyword: keyword,
                            secondaryKeywords: [],
                            searchIntent: detectedIntent,
                            targetAudience: 'general',
                            content: linkedContent,
                        })),
                    ]);

                    naturalness = naturalnessResult || naturalness;
                    missingStructure = structureResult;

                    // Build unified score (merges ContentScorer 0-100 + QC Engine 0-10)
                    unifiedScore = buildUnifiedScore(score, qcReport);
                } catch (postError) {
                    console.error('[stream] Post-processing failed (content still available):', postError instanceof Error ? postError.message : postError);
                    // Continue with raw content + default scores
                }

                // ── Stage 8: Get cost report for this generation ──
                let costReport = null;
                try {
                    costReport = await getPostCostReport(sessionId, auth.user.id);
                } catch (costErr) {
                    console.error('[stream] Failed to get cost report:', costErr);
                }

                // ── Stage 9: Complete ──────────────────────────
                send('complete', {
                    content: {
                        title: outline.title,
                        metaTitle,
                        metaDescription,
                        content: linkedContent,
                        faqSection: [],
                        schemaMarkup: generated.schemaMarkup || { '@graph': [] },
                        suggestedInternalLinks: internalLinks.map((l: { anchorText: string }) => l.anchorText),
                        suggestedExternalLinks: externalLinks.map((l: { targetUrl: string }) => l.targetUrl),
                    },
                    score: unifiedScore,
                    naturalness,
                    qualityMetrics,
                    missingStructure,
                    costReport,
                    outline,
                    blueprint: {
                        avgWordCount: blueprint.avgWordCount,
                        consensusHeadings: blueprint.consensusHeadings.slice(0, 10),
                        contentGaps: blueprint.contentGaps,
                        uniqueAngles: blueprint.uniqueAngles,
                    },
                    competitorInsight: {
                        avgWordCount: blueprint.avgWordCount,
                        commonHeadings: blueprint.consensusHeadings.map(h => h.heading),
                        commonTopics: blueprint.consensusHeadings.slice(0, 10).map(h => h.heading),
                        contentGaps: blueprint.contentGaps,
                        snippetOpportunities: blueprint.snippetFormats.map(s => `${s.type}: ${s.keyword}`),
                        keyEntities: blueprint.keyStatistics.map(s => s.stat),
                    },
                    internalLinks,
                    externalLinks,
                    slug,
                    sessionId,
                    metaValidation,
                    serpData: {
                        results: searchResults.results,
                        paaQuestions,
                        serpFeatures: searchResults.results.length > 0
                            ? getSERPIntelligence().analyzeSERPFeatures(keyword, searchResults.results)
                            : {},
                        competitorCount: competitors.length,
                    },
                });

                // ── Save content record to database ─────────
                const generationDuration = Date.now() - generationStartTime;
                const finalWordCount = countWordsInHTML(linkedContent);

                // Get site info for denormalized storage
                let recordSiteName = '';
                if (site_id) {
                    const { data: siteInfo } = await auth.supabase
                        .from('sites').select('name, url').eq('id', site_id).single();
                    if (siteInfo) {
                        recordSiteName = siteInfo.name || '';
                    }
                }

                // Detect the AI provider that was used
                const availableProviders = ai.getAvailableProviders().filter(p => p.configured);
                const usedProvider = availableProviders.length > 0 ? availableProviders[0].provider : 'unknown';

                try {
                    await auth.supabase.from('content_records').insert({
                        user_id: auth.user.id,
                        site_id: site_id || null,
                        keyword,
                        title: outline.title,
                        slug,
                        content_type: content_type || (isCluster ? 'cluster' : 'article'),
                        language: language || 'en',
                        ai_provider: usedProvider,
                        ai_model: '',
                        word_count_target: outline.totalTargetWords || minWords,
                        word_count_actual: finalWordCount,
                        competitor_count: competitors.length,
                        section_count: outline.sections.length,
                        internal_link_count: internalLinks.length,
                        external_link_count: externalLinks.length,
                        generation_duration_ms: generationDuration,
                        session_id: sessionId,
                        overall_score: unifiedScore.overall || 0,
                        seo_score: unifiedScore.seo || 0,
                        aeo_score: unifiedScore.aeo || 0,
                        eeat_score: unifiedScore.eeat || 0,
                        readability_score: unifiedScore.readability || 0,
                        naturalness_score: naturalness?.score || 0,
                        outline_data: {
                            title: outline.title,
                            sections: outline.sections.map((s: { h2: string; targetWords: number; contentType: string }) => ({
                                h2: s.h2,
                                targetWords: s.targetWords,
                                contentType: s.contentType,
                            })),
                        },
                        blueprint_data: {
                            avgWordCount: blueprint.avgWordCount,
                            consensusHeadings: blueprint.consensusHeadings.slice(0, 10).map((h: { heading: string }) => h.heading),
                            contentGaps: blueprint.contentGaps,
                            uniqueAngles: blueprint.uniqueAngles,
                        },
                        score_details: unifiedScore,
                        meta_title: metaTitle,
                        meta_description: metaDescription,
                        site_name: recordSiteName,
                        site_url: siteUrl,
                        publish_status: 'generated',
                        content_html: linkedContent,
                    });
                } catch (recordErr) {
                    console.error('[stream] Failed to save content record:', recordErr);
                    // Don't block the stream on record save failure
                }
            } catch (error) {
                const rawMessage = error instanceof Error ? error.message : 'Content generation failed';
                console.error('[stream] ERROR:', rawMessage);

                const isQuota = /quota|rate.?limit|429|too many requests/i.test(rawMessage);
                let userMessage = rawMessage;
                if (isQuota) {
                    const retryMatch = rawMessage.match(/retry\s+(?:in\s+)?(\d+)/i);
                    const retryHint = retryMatch ? ` Try again in ~${retryMatch[1]}s.` : ' Try again in a few minutes.';
                    userMessage = `AI provider quota exceeded.${retryHint} Add a backup API key in Settings → AI Providers for automatic failover.`;
                } else if (/401|403|unauthorized|invalid.*api.*key/i.test(rawMessage)) {
                    userMessage = 'AI API key is invalid or expired. Please update it in Settings → AI Providers.';
                }

                send('error', { message: userMessage });
            } finally {
                getAIRouter().clearSession();
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
