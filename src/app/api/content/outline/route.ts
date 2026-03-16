// ============================================================
// RankMaster Pro - Content Outline Preview API
// 2-step flow: generate outline → user edits → generate full article
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSERPIntelligence } from '@/lib/engines/serp-intelligence';
import { getAIRouter } from '@/lib/ai/router';
import { logger } from '@/lib/logger';
import { getAuthUser } from '@/lib/auth-guard';
import { ContentOutlineSchema } from '@/lib/api-schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ArticleOutline, OutlineSection as EngineOutlineSection } from '@/lib/engines/outline-generator';

export interface ContentOutline {
    title: string;
    metaTitle: string;
    slug: string;
    targetWordCount: number;
    sections: OutlineSection[];
    faqSuggestions: string[];
    entitySuggestions: string[];
    competitorTopics: string[];
}

interface OutlineSection {
    heading: string;
    level: 'h2' | 'h3';
    notes: string;
    estimatedWords: number;
    snippetType?: 'paragraph' | 'list' | 'table' | 'none';
}

// ── Mapper: Convert preview outline → engine ArticleOutline ───

export function toArticleOutline(preview: ContentOutline): ArticleOutline {
    const sections: EngineOutlineSection[] = [];
    let currentH2: EngineOutlineSection | null = null;

    for (const item of preview.sections) {
        if (item.level === 'h2') {
            if (currentH2) sections.push(currentH2);
            currentH2 = {
                h2: item.heading,
                h3s: [],
                targetWords: item.estimatedWords,
                contentType: 'explanation',
                snippetTarget: item.snippetType || 'none',
                keyDataPoints: [],
                competitorExcerpts: [],
                writingAngle: item.notes || 'Provide detailed explanation with examples',
            };
        } else if (item.level === 'h3' && currentH2) {
            currentH2.h3s.push(item.heading);
            currentH2.targetWords += item.estimatedWords;
        }
    }
    if (currentH2) sections.push(currentH2);

    const totalWords = sections.reduce((sum, s) => sum + s.targetWords, 0);
    return {
        title: preview.title,
        metaTitle: preview.metaTitle,
        metaDescription: '',
        introHook: `Here is what you need to know about ${preview.slug.replace(/-/g, ' ')}.`,
        sections,
        faqQuestions: preview.faqSuggestions.map(q => ({ question: q, targetWords: 80 })),
        comparisonTable: { topic: preview.title, columns: ['Feature', 'Option A', 'Option B', 'Option C'], rowDescriptions: [] },
        keyTakeaways: [],
        totalTargetWords: Math.max(totalWords, preview.targetWordCount),
    };
}

export async function POST(request: NextRequest) {
    try {
        logger.info('Outline generation started', { route: '/api/content/outline' });
        const auth = await getAuthUser();
        if (auth.error) {
            logger.warn('Outline auth failed', { route: '/api/content/outline' });
            return auth.error;
        }
        logger.info('Outline auth OK', { route: '/api/content/outline', user: auth.user.email });

        const rateLimited = checkRateLimit(auth.user.id, '/api/content/outline', { maxRequests: 10, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        const body = await request.json();
        const parsed = ContentOutlineSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const { keyword, niche, existingPosts } = parsed.data;

        const ai = getAIRouter();
        await ai.loadKeys(auth.supabase);
        const providers = ai.getAvailableProviders().filter(p => p.configured);
        logger.info('AI keys loaded', { route: '/api/content/outline', providers: providers.map(p => p.provider) });

        if (providers.length === 0) {
            return NextResponse.json(
                { error: 'No AI provider configured. Please add an API key in Settings → AI Providers.' },
                { status: 500 }
            );
        }

        const serp = getSERPIntelligence();

        // Fetch SERP data for competitor insight
        let competitorHeadings: string[] = [];
        let paaQuestions: string[] = [];

        if (serp.isConfigured()) {
            const searchResults = await serp.searchGoogle(keyword);
            paaQuestions = serp.extractPAAQuestions(searchResults.results);

            // Fetch top 5 competitor headings for richer preview data
            for (const result of searchResults.results.slice(0, 5)) {
                const pageContent = await serp.fetchPageContent(result.url);
                if (pageContent) {
                    competitorHeadings.push(
                        ...pageContent.headings.map(h => h.text)
                    );
                }
            }
            logger.info('SERP data fetched for outline', { route: '/api/content/outline', headings: competitorHeadings.length, paa: paaQuestions.length });
        } else {
            logger.info('SERP not configured, skipping', { route: '/api/content/outline' });
        }

        const prompt = `You are an expert SEO content strategist. Create a detailed content outline for an article targeting: "${keyword}"

${niche ? `Niche/Industry: ${niche}` : ''}
${competitorHeadings.length > 0 ? `\nCompetitor headings found:\n${competitorHeadings.slice(0, 20).map(h => `- ${h}`).join('\n')}` : ''}
${paaQuestions.length > 0 ? `\nPeople Also Ask questions:\n${paaQuestions.map(q => `- ${q}`).join('\n')}` : ''}
${(existingPosts?.length ?? 0) > 0 ? `\nExisting site posts (for internal linking opportunities):\n${existingPosts!.slice(0, 10).map((p: string) => `- ${p}`).join('\n')}` : ''}

Create a comprehensive outline that will:
1. Cover ALL competitor topics plus unique angles they missed
2. Include question-based headings for AEO/GEO optimization
3. Identify featured snippet opportunities (paragraph, list, or table)
4. Include E-E-A-T signals (experience, expertise, sources)
5. Target 1.3x the average competitor word count
6. Include FAQ section ideas and entity suggestions

Return JSON:
{
  "title": "SEO-optimized article title with keyword",
  "metaTitle": "60-char meta title",
  "slug": "short-keyword-rich-slug",
  "targetWordCount": 2500,
  "sections": [
    {
      "heading": "H2/H3 heading text",
      "level": "h2",
      "notes": "Brief description of what to cover in this section",
      "estimatedWords": 300,
      "snippetType": "paragraph|list|table|none"
    }
  ],
  "faqSuggestions": ["Question 1?", "Question 2?"],
  "entitySuggestions": ["entity1", "entity2"],
  "competitorTopics": ["topic covered by competitors to include"]
}`;

        const result = await ai.generate('content_writing', prompt, {
            systemPrompt: 'You are an SEO content strategist. Always respond in valid JSON.',
            jsonMode: true,
            temperature: 0.4,
        });

        let rawParsed: Record<string, unknown>;
        try {
            rawParsed = JSON.parse(result);
        } catch {
            // Try extracting JSON from markdown code block
            const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                rawParsed = JSON.parse(jsonMatch[1]);
            } else {
                throw new Error('Failed to parse outline response');
            }
        }

        // Validate and build outline with safe defaults
        const outline: ContentOutline = {
            title: typeof rawParsed.title === 'string' ? rawParsed.title : keyword,
            metaTitle: typeof rawParsed.metaTitle === 'string' ? rawParsed.metaTitle.substring(0, 70) : keyword,
            slug: typeof rawParsed.slug === 'string' ? rawParsed.slug : keyword.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            targetWordCount: typeof rawParsed.targetWordCount === 'number' ? rawParsed.targetWordCount : 2500,
            sections: Array.isArray(rawParsed.sections)
                ? rawParsed.sections.map((s: Record<string, unknown>) => ({
                    heading: typeof s.heading === 'string' ? s.heading : 'Untitled',
                    level: s.level === 'h3' ? 'h3' as const : 'h2' as const,
                    notes: typeof s.notes === 'string' ? s.notes : '',
                    estimatedWords: typeof s.estimatedWords === 'number' ? s.estimatedWords : 300,
                    snippetType: (['paragraph', 'list', 'table', 'none'].includes(s.snippetType as string)
                        ? s.snippetType as 'paragraph' | 'list' | 'table' | 'none'
                        : 'none'),
                }))
                : [],
            faqSuggestions: Array.isArray(rawParsed.faqSuggestions)
                ? rawParsed.faqSuggestions.filter((q: unknown) => typeof q === 'string') : [],
            entitySuggestions: Array.isArray(rawParsed.entitySuggestions)
                ? rawParsed.entitySuggestions.filter((e: unknown) => typeof e === 'string') : [],
            competitorTopics: Array.isArray(rawParsed.competitorTopics)
                ? rawParsed.competitorTopics.filter((t: unknown) => typeof t === 'string') : [],
        };

        if (outline.sections.length === 0) {
            throw new Error('AI returned empty sections for outline preview');
        }

        logger.info('Outline generated successfully', { route: '/api/content/outline', sections: outline.sections.length });
        return NextResponse.json({
            outline,
            paaQuestions,
            competitorHeadings: competitorHeadings.slice(0, 15),
        });
    } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Outline generation failed';
        const errorStack = error instanceof Error ? error.stack : '';
        console.error('[outline] ERROR:', rawMessage);
        console.error('[outline] STACK:', errorStack);
        const configuredProviders = getAIRouter().getAvailableProviders();
        console.error('[outline] Configured providers:', configuredProviders.map((p: { provider: string; configured: boolean }) => `${p.provider}(${p.configured ? 'OK' : 'NO KEY'})`).join(', '));
        logger.error('Outline generation failed', { route: '/api/content/outline', rawMessage, providers: configuredProviders.map((p: { provider: string }) => p.provider) }, error);

        // Detect quota / rate-limit errors and return a clean message
        const isQuota = /quota|rate.?limit|429|too many requests/i.test(rawMessage);
        if (isQuota) {
            // Extract provider name from error if present
            const providerMatch = rawMessage.match(/(?:by|for)\s+(gemini|openai|anthropic|groq|mistral|deepseek|cohere)/i);
            const providerHint = providerMatch ? ` (${providerMatch[1]})` : '';
            // Extract retry delay if present
            const retryMatch = rawMessage.match(/retry\s+(?:in\s+)?(\d+)/i);
            const retryHint = retryMatch ? ` Try again in ~${retryMatch[1]}s.` : ' Try again in a few minutes.';
            console.error(`[outline] RATE LIMIT: Provider${providerHint} quota/rate limited. Error: ${rawMessage}`);
            return NextResponse.json(
                { error: `AI provider${providerHint} quota exceeded.${retryHint} Add a backup API key in Settings → AI Providers for automatic failover.` },
                { status: 429 }
            );
        }

        // Detect auth errors
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
