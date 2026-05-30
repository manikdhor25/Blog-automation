// ============================================================
// RankMaster Pro - Content Generation API (v2)
// Full pipeline: SERP → deep extract → blueprint → outline →
//                section-by-section write → assemble → score
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSERPIntelligence, DeepPageContent, CompetitorBlueprint } from '@/lib/engines/serp-intelligence';
import { SERPResult } from '@/lib/types';
import { getContentWriter } from '@/lib/engines/content-writer';
import { countWordsInHTML, detectSearchIntent } from '@/lib/engines/content-utils';
import { getContentScorer } from '@/lib/engines/content-scorer';
import { getLinkingEngine, LinkSuggestion } from '@/lib/engines/linking-engine';
import { generateSEOSlug, validateMeta, calculateDynamicWordCount, injectSchemaJsonLD } from '@/lib/utils/seo-utils';
import { getAuthUser } from '@/lib/auth-guard';
import { ContentGenerateSchema } from '@/lib/api-schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAIRouter } from '@/lib/ai/router';
import { logger } from '@/lib/logger';
import { checkFactuality } from '@/lib/engines/factuality-checker';
import { scoreNaturalness } from '@/lib/engines/naturalness-scorer';
import { generateOutline } from '@/lib/engines/outline-generator';
import { runQualityControl } from '@/lib/engines/quality-control-engine';
import { buildUnifiedScore } from '@/lib/engines/score-normalizer';
import { getPostCostReport } from '@/lib/engines/cost-calculator';

export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const rateLimited = checkRateLimit(auth.user.id, '/api/content/generate', { maxRequests: 5, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        const body = await request.json();
        const parsed = ContentGenerateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const { keyword, site_id, action, language, is_cluster, content_type } = parsed.data;
        const existing_outline = body.existing_outline; // Not in schema, but accepted as passthrough

        // Track generation start time for content records
        const generationStartTime = Date.now();

        const serp = getSERPIntelligence();
        const writer = getContentWriter();
        const scorer = getContentScorer();
        const linker = getLinkingEngine();

        // Pre-load AI keys
        const ai = getAIRouter();
        await ai.loadKeys(auth.supabase);

        // Start cost-tracking session for this generation
        const sessionId = randomUUID();
        ai.setSession(sessionId, auth.user.id);

        try {

            // ── Step 1-3: Research (skip if we have an outline) ────
            let searchResults: { results: Omit<SERPResult, 'id' | 'keyword_id' | 'fetched_at'>[]; totalResults: number; searchTime: number } = { results: [], totalResults: 0, searchTime: 0 };
            let competitors: DeepPageContent[] = [];
            let blueprint: CompetitorBlueprint;
            let paaQuestions: string[] = [];

            if (!existing_outline?.sections?.length) {
                searchResults = serp.isConfigured()
                    ? await serp.searchGoogle(keyword, { num: 10 })
                    : { results: [], totalResults: 0, searchTime: 0 };

                const fetchPromises = searchResults.results.slice(0, 10).map(async (result) => {
                    const deep = await serp.deepExtractContent(result.url, result.title);
                    if (deep) competitors.push(deep);
                });
                await Promise.all(fetchPromises);

                blueprint = await serp.buildCompetitorBlueprint(competitors, keyword);
                paaQuestions = serp.extractPAAQuestions(searchResults.results);
            } else {
                blueprint = {
                    avgWordCount: 0, avgSectionCount: 0,
                    consensusHeadings: [], contentGaps: [], uniqueAngles: [],
                    snippetFormats: [], keyStatistics: [],
                    faqPatterns: [], tableTopics: [], topCompetitorSections: [],
                };
            }

            if (action === 'research_only') {
                return NextResponse.json({
                    searchResults: searchResults.results,
                    blueprint,
                    competitors: competitors.map(c => ({
                        url: c.url,
                        title: c.title,
                        wordCount: c.totalWordCount,
                        sectionCount: c.headings.filter(h => h.level === 2).length,
                        hasTables: c.hasTables,
                        faqCount: c.faqQuestions.length,
                        statistics: c.statistics.slice(0, 5),
                    })),
                    paaQuestions,
                    serpFeatures: serp.analyzeSERPFeatures(keyword, searchResults.results),
                });
            }

            // ── Step 4: Get site info for context ──────────────────
            let siteNiche = '';
            let sitePosts: { id: string; title: string; slug: string; keywords: string[] }[] = [];
            let siteUrl = '';

            if (site_id) {
                const { data: site } = await auth.supabase
                    .from('sites').select('*').eq('id', site_id).eq('user_id', auth.user.id).single();
                if (site) {
                    siteNiche = site.niche;
                    siteUrl = site.url;
                    const linkGraph = await linker.buildSiteLinkGraph(site_id);
                    sitePosts = linkGraph.posts;
                }
            }

            // ── Step 5: Generate or reuse outline ──────────────────
            const isCluster = is_cluster || false;
            let outline;
            let minWords = 1500;

            if (existing_outline?.sections?.length) {
                console.log(`[generate] Using existing outline: "${existing_outline.title}", ${existing_outline.sections.length} sections`);
                outline = existing_outline;
                minWords = existing_outline.totalTargetWords || 1500;
            } else {
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

            // ── Step 6: Section-by-section content generation ──────
            const generated = await writer.generateFromOutline(keyword, outline, {
                language: language || 'en',
                niche: siteNiche,
                isCluster,
                siteId: site_id || undefined,
            });

            // ── Step 7: Suggest & insert links (PARALLELIZED) ──
            let internalLinks: LinkSuggestion[] = [];
            let externalLinks: LinkSuggestion[] = [];

            const [internalResult, externalResult] = await Promise.all([
                (site_id && sitePosts.length > 0)
                    ? linker.suggestInternalLinks(generated.content, generated.title, sitePosts, siteUrl)
                    : Promise.resolve([] as LinkSuggestion[]),
                linker.suggestExternalLinks(generated.content, keyword),
            ]);
            internalLinks = internalResult;
            externalLinks = externalResult;

            const allLinks = [...internalLinks, ...externalLinks];
            if (allLinks.length > 0) {
                generated.content = linker.insertLinksIntoContent(generated.content, allLinks);
            }

            // ── Step 8: Score content + analyses (PARALLELIZED) ──
            // Build legacy competitorData for scorer compatibility
            const competitorData = competitors.map(c => ({
                title: c.title,
                content: c.sections.map(s => s.content).join(' ').substring(0, 5000),
                wordCount: c.totalWordCount,
                headings: c.headings.map(h => h.text),
            }));

            const [score, factuality, naturalnessResult] = await Promise.all([
                scorer.scoreContent(generated.content, keyword, {
                    competitorWordCounts: competitorData.map(c => c.wordCount),
                    competitorContents: competitorData.map(c => c.content),
                    hasSchema: Object.keys(generated.schemaMarkup).length > 0,
                    internalLinkCount: internalLinks.length,
                    externalLinkCount: externalLinks.length,
                }),
                checkFactuality(generated.content, keyword),
                Promise.resolve(scoreNaturalness(generated.content)),
            ]);
            const naturalness = naturalnessResult;

            // ── Step 9: Schema injection + SEO slug + meta ─────────
            if (generated.schemaMarkup && Object.keys(generated.schemaMarkup).length > 0) {
                generated.content = injectSchemaJsonLD(generated.content, generated.schemaMarkup);
            }

            const slug = generateSEOSlug(keyword);
            const metaValidation = validateMeta(
                generated.metaTitle || generated.title,
                generated.metaDescription || '',
                keyword,
                slug
            );

            // ── Save content record to database ─────────────────
            const generationDuration = Date.now() - generationStartTime;
            const wordCount = countWordsInHTML(generated.content);

            // Get site info for denormalized storage
            let recordSiteName = '';
            if (site_id) {
                const { data: siteInfo } = await auth.supabase
                    .from('sites').select('name').eq('id', site_id).single();
                if (siteInfo) recordSiteName = siteInfo.name || '';
            }

            const availableProviders = ai.getAvailableProviders().filter(p => p.configured);
            const usedProvider = availableProviders.length > 0 ? availableProviders[0].provider : 'unknown';

            try {
                await auth.supabase.from('content_records').insert({
                    user_id: auth.user.id,
                    site_id: site_id || null,
                    keyword,
                    title: generated.title || keyword,
                    slug,
                    content_type: content_type || (isCluster ? 'cluster' : 'article'),
                    language: language || 'en',
                    ai_provider: usedProvider,
                    ai_model: '',
                    word_count_target: outline.totalTargetWords || minWords,
                    word_count_actual: wordCount,
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
                            h2: s.h2, targetWords: s.targetWords, contentType: s.contentType,
                        })),
                    },
                    blueprint_data: {
                        avgWordCount: blueprint.avgWordCount,
                        consensusHeadings: blueprint.consensusHeadings.slice(0, 10).map((h: { heading: string }) => h.heading),
                        contentGaps: blueprint.contentGaps,
                    },
                    score_details: score,
                    meta_title: generated.metaTitle || generated.title || '',
                    meta_description: generated.metaDescription || '',
                    site_name: recordSiteName,
                    site_url: siteUrl,
                    publish_status: 'generated',
                    content_html: generated.content,
                });
            } catch (recordErr) {
                console.error('[generate] Failed to save content record:', recordErr);
            }

            // ── Step 10: Unified scoring (QC + ContentScorer) ────
            const qcReport = runQualityControl({
                primaryKeyword: keyword,
                secondaryKeywords: [],
                searchIntent: detectSearchIntent(keyword),
                targetAudience: 'general',
                content: generated.content,
            });
            const unifiedScore = buildUnifiedScore(score, qcReport);

            // ── Step 11: Get cost report for this generation ─────
            let costReport = null;
            try {
                costReport = await getPostCostReport(sessionId, auth.user.id);
            } catch (costErr) {
                console.error('[generate] Failed to get cost report:', costErr);
            }

            return NextResponse.json({
                content: generated,
                score: unifiedScore,
                outline,
                blueprint,
                costReport,
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
                factuality,
                naturalness,
                qualityMetrics: generated.qualityMetrics || null,
                serpData: {
                    results: searchResults.results,
                    paaQuestions,
                    serpFeatures: serp.analyzeSERPFeatures(keyword, searchResults.results),
                    competitorCount: competitors.length,
                },
            });
        } finally {
            ai.clearSession();
        }
    } catch (error) {
        getAIRouter().clearSession();
        const rawMessage = error instanceof Error ? error.message : 'Content generation failed';
        console.error('[generate] ERROR:', rawMessage);
        logger.error('Content generation failed', { route: '/api/content/generate' }, error);

        const isQuota = /quota|rate.?limit|429|too many requests/i.test(rawMessage);
        if (isQuota) {
            const retryMatch = rawMessage.match(/retry\s+(?:in\s+)?(\d+)/i);
            const retryHint = retryMatch ? ` Try again in ~${retryMatch[1]}s.` : ' Try again in a few minutes.';
            return NextResponse.json(
                { error: `AI provider quota exceeded.${retryHint} Add a backup API key in Settings → AI Providers for automatic failover.` },
                { status: 429 }
            );
        }

        const isAuth = /401|403|unauthorized|invalid.*api.*key/i.test(rawMessage);
        if (isAuth) {
            return NextResponse.json(
                { error: 'AI API key is invalid or expired. Please update it in Settings → AI Providers.' },
                { status: 401 }
            );
        }

        return NextResponse.json(
            { error: rawMessage },
            { status: 500 }
        );
    }
}
