// ============================================================
// RankMaster Pro - Topical Authority Engine
// Content clustering, pillar pages, and authority scoring
// ============================================================

import { getAIRouter } from '../ai/router';
import { createServiceRoleClient } from '../supabase';

export interface ContentCluster {
    pillarTopic: string;
    description: string;
    pillarArticle: {
        title: string;
        keyword: string;
        outline: string[];
    };
    supportingArticles: {
        title: string;
        keyword: string;
        type: 'how-to' | 'listicle' | 'comparison' | 'guide' | 'faq' | 'case-study';
    }[];
    estimatedAuthority: number;
}

export interface ContentCalendar {
    weeks: {
        weekNumber: number;
        startDate: string;
        posts: {
            day: string;
            keyword: string;
            title: string;
            type: string;
            clusterId: string;
            priority: 'high' | 'medium' | 'low';
        }[];
    }[];
}

export class TopicalAuthorityEngine {
    // Analyze a niche and identify topic clusters
    async analyzeNiche(
        siteUrl: string,
        niche: string,
        existingPosts: string[]
    ): Promise<ContentCluster[]> {
        const ai = getAIRouter();

        const prompt = `You are a topical authority strategist. Analyze this niche and create content clusters.

SITE: ${siteUrl}
NICHE: ${niche}
EXISTING POSTS: ${existingPosts.slice(0, 20).join('\n- ')}

Create 3-5 comprehensive topic clusters for building topical authority in this niche.

For each cluster:
1. Define the PILLAR TOPIC (broad, comprehensive topic)
2. Create a PILLAR ARTICLE plan (3000+ word comprehensive guide)
3. Create 5-8 SUPPORTING ARTICLES (specific subtopics that link to pillar)
4. Identify which existing posts fit into each cluster

RULES:
- Each pillar should be different enough to stand alone
- Supporting articles should cover all aspects of the pillar topic
- Mix article types: how-to, listicle, comparison, guide, FAQ, case-study
- Focus on keywords with ranking potential for affiliate/blog sites
- Consider US market search behavior

Respond with JSON:
{
  "clusters": [
    {
      "pillarTopic": "Broad Topic Name",
      "description": "What this cluster covers",
      "pillarArticle": {
        "title": "Ultimate Guide to...",
        "keyword": "main keyword",
        "outline": ["H2 sections for the pillar"]
      },
      "supportingArticles": [
        {
          "title": "Supporting Article Title",
          "keyword": "long-tail keyword",
          "type": "how-to"
        }
      ],
      "estimatedAuthority": 0.7
    }
  ]
}`;

        const result = await ai.generate('topic_research', prompt, {
            systemPrompt: 'You are a topical authority and content strategy expert for affiliate and blog sites. Always respond with valid JSON.',
            jsonMode: true,
            temperature: 0.7,
            maxTokens: 4096,
        });

        try {
            const parsed = JSON.parse(result);
            return parsed.clusters || [];
        } catch {
            return [];
        }
    }

    // Calculate topical authority score for a cluster
    async calculateAuthorityScore(siteId: string, clusterId: string): Promise<{
        score: number;
        totalArticles: number;
        publishedArticles: number;
        avgContentScore: number;
        coveragePercentage: number;
        internalLinkDensity: number;
    }> {
        console.log(`[TopicalAuthority] Calculating authority score for cluster: ${clusterId}`);
        const supabase = createServiceRoleClient();

        // Get cluster info
        const { data: cluster } = await supabase
            .from('topic_clusters')
            .select('*')
            .eq('id', clusterId)
            .single();

        if (!cluster) {
            console.warn(`[TopicalAuthority] Cluster not found: ${clusterId}`);
            return { score: 0, totalArticles: 0, publishedArticles: 0, avgContentScore: 0, coveragePercentage: 0, internalLinkDensity: 0 };
        }

        console.log(`[TopicalAuthority] Cluster pillar topic: ${cluster.pillar_topic}`);

        // Get posts in this cluster
        const { data: posts } = await supabase
            .from('posts')
            .select('id, status, overall_score, cluster_id')
            .eq('cluster_id', clusterId);

        const totalArticles = posts?.length || 0;
        const publishedArticles = posts?.filter(p => p.status === 'published').length || 0;
        const avgContentScore = posts && posts.length > 0
            ? posts.reduce((sum, p) => sum + (p.overall_score || 0), 0) / posts.length
            : 0;

        // Get keywords for this cluster
        const { data: keywords } = await supabase
            .from('keywords')
            .select('id')
            .eq('cluster_id', clusterId);

        const totalKeywords = keywords?.length || 0;
        const coveragePercentage = totalKeywords > 0 ? (publishedArticles / totalKeywords) * 100 : 0;

        // Get internal links within cluster
        const postIds = posts?.map(p => p.id) || [];
        const { data: links } = await supabase
            .from('internal_links')
            .select('id')
            .in('from_post_id', postIds)
            .in('to_post_id', postIds);

        const internalLinkDensity = totalArticles > 0
            ? (links?.length || 0) / totalArticles
            : 0;

        // DIAGNOSTIC: Log pillar-to-supporting article linking analysis
        console.log(`[TopicalAuthority] Cluster linking analysis:`);
        console.log(`  - Total internal links in cluster: ${links?.length || 0}`);
        console.log(`  - Internal link density: ${internalLinkDensity.toFixed(2)}`);
        if (internalLinkDensity < 0.5) {
            console.warn(`[TopicalAuthority] ⚠️ LOW INTERNAL LINK DENSITY - Supporting articles may not be linking to pillar article`);
        }

        // Calculate overall authority score
        const score = Math.round(
            (publishedArticles / Math.max(totalKeywords, 1)) * 30 + // Coverage
            (avgContentScore / 100) * 30 + // Content quality
            Math.min(internalLinkDensity * 10, 20) + // Internal linking
            (publishedArticles >= 5 ? 20 : (publishedArticles / 5) * 20) // Volume
        );

        return {
            score: Math.min(score, 100),
            totalArticles,
            publishedArticles,
            avgContentScore,
            coveragePercentage,
            internalLinkDensity,
        };
    }

    // Find content gaps in clusters
    async findContentGaps(siteId: string): Promise<{
        clusterId: string;
        clusterName: string;
        missingTopics: string[];
        suggestedKeywords: string[];
    }[]> {
        const ai = getAIRouter();
        const supabase = createServiceRoleClient();

        // Get all clusters and their posts
        const { data: clusters } = await supabase
            .from('topic_clusters')
            .select('id, pillar_topic, description')
            .eq('site_id', siteId);

        if (!clusters || clusters.length === 0) return [];

        const gaps = [];

        for (const cluster of clusters) {
            const { data: posts } = await supabase
                .from('posts')
                .select('title, slug')
                .eq('cluster_id', cluster.id);

            const existingTitles = posts?.map(p => p.title) || [];

            const prompt = `Analyze this content cluster and find gaps:

CLUSTER TOPIC: ${cluster.pillar_topic}
DESCRIPTION: ${cluster.description}
EXISTING ARTICLES:
${existingTitles.map(t => `- ${t}`).join('\n')}

Find 5-10 missing subtopics and suggested keywords that would strengthen this cluster's topical authority.

Respond with JSON:
{
  "missingTopics": ["topic not yet covered"],
  "suggestedKeywords": ["long-tail keyword to target"]
}`;

            const result = await ai.generate('topic_research', prompt, {
                systemPrompt: 'You are a content gap analyst. Always respond with valid JSON.',
                jsonMode: true,
                temperature: 0.5,
            });

            try {
                const parsed = JSON.parse(result);
                gaps.push({
                    clusterId: cluster.id,
                    clusterName: cluster.pillar_topic,
                    missingTopics: parsed.missingTopics || [],
                    suggestedKeywords: parsed.suggestedKeywords || [],
                });
            } catch {
                // Skip this cluster
            }
        }

        return gaps;
    }

    // Generate an AI-powered content calendar
    async generateContentCalendar(
        siteId: string,
        niche: string,
        weeks: number = 4
    ): Promise<ContentCalendar> {
        const ai = getAIRouter();
        const supabase = createServiceRoleClient();

        // Get existing clusters and posts
        const { data: clusters } = await supabase
            .from('topic_clusters')
            .select('id, pillar_topic')
            .eq('site_id', siteId);

        const { data: pendingKeywords } = await supabase
            .from('keywords')
            .select('keyword, priority_score, cluster_id')
            .eq('site_id', siteId)
            .eq('status', 'targeted')
            .order('priority_score', { ascending: false })
            .limit(20);

        const prompt = `Create a ${weeks}-week content publishing calendar for a ${niche} site.

EXISTING CLUSTERS:
${(clusters || []).map(c => `- ${c.pillar_topic} (ID: ${c.id})`).join('\n')}

PRIORITY KEYWORDS TO TARGET:
${(pendingKeywords || []).map(k => `- "${k.keyword}" (priority: ${k.priority_score})`).join('\n')}

RULES:
- Publish 3-5 posts per week
- Mix post types (how-to, listicle, comparison, reviewguide)
- Prioritize high-priority keywords
- Alternate between clusters for variety
- Include 1 pillar article per 2 weeks if clusters need them

Respond with JSON:
{
  "weeks": [
    {
      "weekNumber": 1,
      "posts": [
        {
          "day": "Monday",
          "keyword": "target keyword",
          "title": "Article Title",
          "type": "how-to",
          "clusterId": "cluster-id or 'new'",
          "priority": "high"
        }
      ]
    }
  ]
}`;

        const result = await ai.generate('topic_research', prompt, {
            systemPrompt: 'You are a content calendar strategist for SEO-focused blogs. Always respond with valid JSON.',
            jsonMode: true,
            temperature: 0.7,
        });

        try {
            const parsed = JSON.parse(result);
            // Add start dates
            const today = new Date();
            parsed.weeks = (parsed.weeks || []).map((week: { weekNumber: number; posts: unknown[] }, i: number) => ({
                ...week,
                startDate: new Date(today.getTime() + i * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            }));
            return parsed;
        } catch {
            return { weeks: [] };
        }
    }
}

import { createSingleton } from '../singleton';

export const getTopicalAuthorityEngine = createSingleton(() => new TopicalAuthorityEngine());
