// ============================================================
// RankMaster Pro - Trending Topic Detector Engine
// #43 — Detects trending topics for rapid content creation
// Identifies content velocity opportunities in your niche
// ============================================================

import { getAIRouter } from '../ai/router';
import { createSingleton } from '../singleton';

// ── Types ──────────────────────────────────────────────────────

export interface TrendingTopic {
    topic: string;
    volumeEstimate: 'explosive' | 'high' | 'medium' | 'emerging';
    competition: 'low' | 'medium' | 'high';
    relevance: number;              // 0-100 relevance to niche
    contentType: 'news' | 'how-to' | 'comparison' | 'listicle' | 'explainer' | 'opinion';
    urgency: 'publish_now' | 'this_week' | 'this_month' | 'evergreen';
    reasoning: string;
    suggestedTitle?: string;
    suggestedAngle?: string;
}

export interface TrendingBrief {
    topic: string;
    title: string;
    metaTitle: string;
    metaDescription: string;
    targetKeyword: string;
    outline: { heading: string; points: string[] }[];
    competitiveAdvantage: string;
    estimatedWordCount: number;
    contentType: string;
}

export interface TrendingReport {
    niche: string;
    generatedAt: string;
    topics: TrendingTopic[];
    topPriority: TrendingTopic[];     // Filtered to publish_now + this_week
    contentGaps: string[];
}

// ── Trending Detector Class ───────────────────────────────────

export class TrendingDetector {

    /**
     * Detect currently trending topics in a niche using AI analysis
     */
    async detectTrending(
        niche: string,
        existingKeywords: string[],
        maxTopics: number = 15
    ): Promise<TrendingReport> {
        const ai = getAIRouter();

        const existingContext = existingKeywords.length > 0
            ? `\nEXISTING CONTENT KEYWORDS (avoid duplicates):\n${existingKeywords.slice(0, 30).join(', ')}`
            : '';

        const prompt = `You are a content strategist specializing in "${niche}". Identify ${maxTopics} currently trending or emerging topics that would drive traffic.

${existingContext}

Consider:
1. Recent industry developments, product launches, regulatory changes
2. Seasonal trends and upcoming events
3. Emerging technologies or methodologies
4. Common questions spiking in search volume
5. Topics where competition is low but interest is growing

For each topic, assess:
- Volume: explosive (viral), high (thousands searching), medium (hundreds), emerging (growing fast from low base)
- Competition: how saturated are SERPs for this topic?
- Content type: what format would work best?
- Urgency: how quickly should we publish?

Return JSON:
{
  "topics": [
    {
      "topic": "Topic name/keyword",
      "volumeEstimate": "high",
      "competition": "low",
      "relevance": 85,
      "contentType": "explainer",
      "urgency": "this_week",
      "reasoning": "Why this is trending and why we should cover it",
      "suggestedTitle": "Suggested article title",
      "suggestedAngle": "Unique angle to take"
    }
  ],
  "contentGaps": ["Broader gap areas in the niche"]
}`;

        try {
            const result = await ai.generate('trending_detection', prompt, {
                systemPrompt: 'You are a trend detection specialist. Identify real, actionable trending topics. Return valid JSON.',
                jsonMode: true,
                temperature: 0.5,
            });

            const parsed = JSON.parse(result);
            const topics: TrendingTopic[] = (parsed.topics || []).map((t: TrendingTopic) => ({
                topic: t.topic,
                volumeEstimate: t.volumeEstimate || 'medium',
                competition: t.competition || 'medium',
                relevance: t.relevance || 50,
                contentType: t.contentType || 'explainer',
                urgency: t.urgency || 'this_month',
                reasoning: t.reasoning || '',
                suggestedTitle: t.suggestedTitle,
                suggestedAngle: t.suggestedAngle,
            }));

            // Filter out topics too similar to existing keywords
            const filteredTopics = topics.filter(t => {
                const topicLower = t.topic.toLowerCase();
                return !existingKeywords.some(k =>
                    k.toLowerCase() === topicLower ||
                    topicLower.includes(k.toLowerCase()) ||
                    k.toLowerCase().includes(topicLower)
                );
            });

            const topPriority = filteredTopics.filter(t =>
                t.urgency === 'publish_now' || t.urgency === 'this_week'
            );

            return {
                niche,
                generatedAt: new Date().toISOString(),
                topics: filteredTopics,
                topPriority,
                contentGaps: parsed.contentGaps || [],
            };
        } catch {
            return {
                niche,
                generatedAt: new Date().toISOString(),
                topics: [],
                topPriority: [],
                contentGaps: [],
            };
        }
    }

    /**
     * Score a trending topic's relevance to existing site content
     */
    scoreTrendingRelevance(topic: TrendingTopic, siteTopics: string[]): number {
        if (siteTopics.length === 0) return topic.relevance;

        const topicWords = topic.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        let matchCount = 0;

        for (const siteTopic of siteTopics) {
            const siteWords = siteTopic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const overlap = topicWords.filter(w => siteWords.includes(w)).length;
            if (overlap > 0) matchCount++;
        }

        const contextRelevance = Math.min(100, Math.round((matchCount / siteTopics.length) * 200));
        return Math.round((topic.relevance + contextRelevance) / 2);
    }

    /**
     * Generate a content brief for a trending topic
     */
    async generateTrendingBrief(topic: TrendingTopic): Promise<TrendingBrief> {
        const ai = getAIRouter();

        const prompt = `Create a content brief for this trending topic:

TOPIC: ${topic.topic}
CONTENT TYPE: ${topic.contentType}
ANGLE: ${topic.suggestedAngle || 'Choose the best angle'}
URGENCY: ${topic.urgency}

Create a complete brief including:
1. SEO-optimized title (using CTR formula)
2. Meta title (≤60 chars)
3. Meta description (≤155 chars)
4. Target keyword
5. Article outline (6-10 H2 sections with 2-4 key points each)
6. Competitive advantage: what makes this article better than what exists
7. Estimated word count

Return JSON:
{
  "title": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "targetKeyword": "...",
  "outline": [{ "heading": "H2 heading", "points": ["point 1", "point 2"] }],
  "competitiveAdvantage": "...",
  "estimatedWordCount": 2000
}`;

        try {
            const result = await ai.generate('trending_detection', prompt, {
                systemPrompt: 'You create actionable content briefs for trending topics. Return valid JSON.',
                jsonMode: true,
                temperature: 0.4,
            });

            const parsed = JSON.parse(result);
            return {
                topic: topic.topic,
                title: parsed.title || topic.suggestedTitle || topic.topic,
                metaTitle: parsed.metaTitle || '',
                metaDescription: parsed.metaDescription || '',
                targetKeyword: parsed.targetKeyword || topic.topic,
                outline: parsed.outline || [],
                competitiveAdvantage: parsed.competitiveAdvantage || '',
                estimatedWordCount: parsed.estimatedWordCount || 1800,
                contentType: topic.contentType,
            };
        } catch {
            return {
                topic: topic.topic,
                title: topic.suggestedTitle || topic.topic,
                metaTitle: '',
                metaDescription: '',
                targetKeyword: topic.topic,
                outline: [],
                competitiveAdvantage: '',
                estimatedWordCount: 1800,
                contentType: topic.contentType,
            };
        }
    }
}

export const getTrendingDetector = createSingleton(() => new TrendingDetector());
