// ============================================================
// RankMaster Pro - SSE Streaming Content Generation API (v2)
// Pipeline: SERP → deep extract → blueprint → outline →
//           section-by-section write → assemble → score
// Streams progress events for each stage
// ============================================================

import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getSERPIntelligence, DeepPageContent } from '@/lib/engines/serp-intelligence';
import { getContentWriter, countWordsInHTML, runQualityGate } from '@/lib/engines/content-writer';
import { getContentScorer } from '@/lib/engines/content-scorer';
import { getLinkingEngine } from '@/lib/engines/linking-engine';
import { getAIRouter } from '@/lib/ai/router';
import { generateSEOSlug, validateMeta, calculateDynamicWordCount } from '@/lib/utils/seo-utils';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';
import { scoreNaturalness } from '@/lib/engines/naturalness-scorer';
import { generateOutline } from '@/lib/engines/outline-generator';
import { cleanAIPatterns } from '@/lib/engines/human-writing-rules';
import { runQualityControl } from '@/lib/engines/quality-control-engine';
import { buildUnifiedScore } from '@/lib/engines/score-normalizer';

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const rateLimited = checkRateLimit(auth.user.id, '/api/content/stream', { maxRequests: 5, windowMs: 60_000 });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { keyword, site_id, language, is_cluster } = body;

    if (!keyword) {
        return new Response(JSON.stringify({ error: 'Keyword is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                controller.enqueue(
                    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
                );
            };

            // Track generation start time
            const generationStartTime = Date.now();

            try {
                // ── Stage 1: SERP Research (10 results) ────────
                send('stage', { stage: 'research', message: 'Searching Google US for top 10 ranked pages...' });

                const serp = getSERPIntelligence();
                const searchResults = serp.isConfigured()
                    ? await serp.searchGoogle(keyword, { num: 10 })
                    : { results: [], totalResults: 0, searchTime: 0 };

                send('stage', { stage: 'extracting', message: `Deep-extracting ${Math.min(searchResults.results.length, 10)} competitor pages...` });

                // ── Stage 2: Deep extract competitors ──────────
                const competitors: DeepPageContent[] = [];
                const fetchPromises = searchResults.results.slice(0, 10).map(async (result) => {
                    const deep = await serp.deepExtractContent(result.url, result.title);
                    if (deep) competitors.push(deep);
                });
                await Promise.all(fetchPromises);

                send('stage', { stage: 'blueprint', message: `Building competitor blueprint from ${competitors.length} pages...` });

                // ── Stage 3: Build competitor blueprint ────────
                const blueprint = await serp.buildCompetitorBlueprint(competitors, keyword);
                const paaQuestions = serp.extractPAAQuestions(searchResults.results);

                send('competitor_insight', {
                    avgWordCount: blueprint.avgWordCount,
                    avgSectionCount: blueprint.avgSectionCount,
                    consensusTopics: blueprint.consensusHeadings.length,
                    contentGaps: blueprint.contentGaps.length,
                    competitorCount: competitors.length,
                });

                // ── Stage 4: Generate AI outline ───────────────
                send('stage', { stage: 'outline', message: 'Generating article outline from competitor blueprint...' });

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
                const competitorCounts = competitors.map(c => c.totalWordCount).filter(w => w > 0);
                const minWords = calculateDynamicWordCount(competitorCounts, isCluster);

                const outline = await generateOutline(keyword, blueprint, competitors, {
                    niche: siteNiche,
                    language: language || 'en',
                    isCluster,
                    paaQuestions,
                    minWordCount: minWords,
                });

                send('outline', {
                    title: outline.title,
                    sectionCount: outline.sections.length,
                    totalTargetWords: outline.totalTargetWords,
                    sections: outline.sections.map(s => ({
                        h2: s.h2,
                        targetWords: s.targetWords,
                        contentType: s.contentType,
                    })),
                });

                // ── Stage 5: Section-by-section writing ────────
                send('stage', { stage: 'writing', message: `Writing ${outline.sections.length} sections individually...` });

                const writer = getContentWriter();
                const generated = await writer.generateFromOutline(keyword, outline, {
                    language: language || 'en',
                    niche: siteNiche,
                    isCluster,
                    siteId: site_id || undefined,
                });

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

                // ── Stage 6.5: Quality Gate ────────────────────
                // Clean AI patterns + run quality gate loop (section rewrites + sentence rewriting)
                send('stage', { stage: 'quality_gate', message: 'Running quality gate — cleaning AI patterns and rewriting weak sections...' });

                generated.content = cleanAIPatterns(generated.content);
                const { content: gatedContent, metrics: qualityMetrics } = await runQualityGate(
                    generated.content, keyword, language || 'en'
                );
                generated.content = gatedContent;

                send('quality_gate', {
                    naturalnessScore: qualityMetrics.naturalnessScore,
                    factualityScore: qualityMetrics.factualityScore,
                    readabilityGrade: qualityMetrics.readabilityGrade,
                    aiPhraseCount: qualityMetrics.aiPhraseCount,
                    gatePasses: qualityMetrics.qualityGatePasses,
                    sentenceRewrites: qualityMetrics.sentenceRewrites,
                });

                // ── Stage 7: Post-processing ───────────────────
                send('stage', { stage: 'optimizing', message: 'Scoring, linking, and optimizing...' });

                // Generate meta tags (use outline meta if available)
                const metaTitle = outline.metaTitle || generated.metaTitle || keyword;
                const metaDescription = outline.metaDescription || generated.metaDescription || '';

                // Linking
                const linker = getLinkingEngine();
                let internalLinks: { anchorText: string; targetUrl: string; targetTitle: string; relevanceScore: number; type: 'internal' | 'external' }[] = [];
                if (site_id && sitePosts.length > 0) {
                    internalLinks = await linker.suggestInternalLinks(generated.content, keyword, sitePosts, siteUrl);
                }
                const externalLinks = await linker.suggestExternalLinks(generated.content, keyword);

                // Insert links
                const allLinks = [...internalLinks, ...externalLinks];
                let linkedContent = generated.content;
                if (allLinks.length > 0) {
                    linkedContent = linker.insertLinksIntoContent(generated.content, allLinks);
                }

                // Build legacy competitor data for scorer
                const competitorData = competitors.map(c => ({
                    content: c.sections.map(s => s.content).join(' ').substring(0, 5000),
                    wordCount: c.totalWordCount,
                }));

                // Score
                const scorer = getContentScorer();
                const score = await scorer.scoreContent(linkedContent, keyword, {
                    competitorWordCounts: competitorData.map(c => c.wordCount),
                    competitorContents: competitorData.map(c => c.content),
                    hasSchema: true,
                    internalLinkCount: internalLinks.length,
                    externalLinkCount: externalLinks.length,
                });

                // SEO slug + meta validation
                const slug = generateSEOSlug(keyword);
                const metaValidation = validateMeta(metaTitle, metaDescription, keyword, slug);

                // Structure validation
                const missingStructure = writer.validateStructure(linkedContent);

                // Naturalness scoring (final, post-quality-gate)
                const naturalness = scoreNaturalness(linkedContent);

                // 9-dimension QC report
                const qcReport = runQualityControl({
                    primaryKeyword: keyword,
                    secondaryKeywords: [],
                    searchIntent: 'informational',
                    targetAudience: 'general',
                    content: linkedContent,
                });

                // Build unified score (merges ContentScorer 0-100 + QC Engine 0-10)
                const unifiedScore = buildUnifiedScore(score, qcReport);

                // ── Stage 8: Complete ──────────────────────────
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
                        serpFeatures: serp.analyzeSERPFeatures(keyword, searchResults.results),
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
                        content_type: isCluster ? 'cluster' : 'article',
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
                        overall_score: score.overall || 0,
                        seo_score: score.seo || 0,
                        aeo_score: score.aeo || 0,
                        eeat_score: score.eeat || 0,
                        readability_score: score.readability || 0,
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
                        score_details: score,
                        meta_title: metaTitle,
                        meta_description: metaDescription,
                        site_name: recordSiteName,
                        site_url: siteUrl,
                        publish_status: 'generated',
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
