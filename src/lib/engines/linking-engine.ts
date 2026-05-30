// ============================================================
// RankMaster Pro - Smart Linking Engine
// NLP-based internal & external link suggestions
// ============================================================

import { getAIRouter } from '../ai/router';
import { createServiceRoleClient } from '../supabase';

export interface LinkSuggestion {
    anchorText: string;
    targetUrl: string;
    targetTitle: string;
    relevanceScore: number;
    type: 'internal' | 'external';
    insertAfter?: string; // text after which to insert the link
}

export class LinkingEngine {
    // Build internal link map for a site
    async buildSiteLinkGraph(siteId: string): Promise<{
        posts: { id: string; title: string; slug: string; keywords: string[] }[];
        existingLinks: { from: string; to: string; anchor: string }[];
    }> {
        const supabase = createServiceRoleClient();

        const { data: posts } = await supabase
            .from('posts')
            .select('id, title, slug, content_html, keyword')
            .eq('site_id', siteId);

        if (!posts) return { posts: [], existingLinks: [] };

        const existingLinks: { from: string; to: string; anchor: string }[] = [];

        // Extract existing links from each post
        const postsWithKeywords = posts.map(post => {
            const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
            let match;
            while ((match = linkRegex.exec(post.content_html || '')) !== null) {
                existingLinks.push({
                    from: post.id,
                    to: match[1],
                    anchor: match[2].replace(/<[^>]+>/g, ''),
                });
            }

            // Extract key topics from title + keyword for matching
            const titleWords = post.title
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter((w: string) => w.length > 3);
            const keywordWords = ((post as { keyword?: string }).keyword || '')
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter((w: string) => w.length > 3);
            const keywords = [...new Set([...titleWords, ...keywordWords])];

            return { id: post.id, title: post.title, slug: post.slug, keywords };
        });

        return { posts: postsWithKeywords, existingLinks };
    }

    // AI-powered internal link suggestions
    async suggestInternalLinks(
        content: string,
        currentPostTitle: string,
        sitePosts: { id: string; title: string; slug: string; keywords: string[] }[],
        siteUrl: string
    ): Promise<LinkSuggestion[]> {
        const ai = getAIRouter();

        // Filter out current post
        const otherPosts = sitePosts.filter(p => p.title !== currentPostTitle).slice(0, 20);

        if (otherPosts.length === 0) return [];

        const prompt = `Analyze this article content and suggest internal links to other posts on the same site.

CURRENT ARTICLE:
${content.substring(0, 2000)}

AVAILABLE POSTS TO LINK TO:
${otherPosts.map(p => `- "${p.title}" (/${p.slug})`).join('\n')}

RULES:
1. Only suggest links that are contextually relevant
2. Choose natural anchor text from the existing content (2-5 words)
3. Maximum 5 internal links
4. Don't force irrelevant links
5. The anchor text should already exist in the content naturally

Respond with JSON:
{
  "links": [
    {
      "anchorText": "exact text from content to make into a link",
      "targetSlug": "slug-of-target-post",
      "targetTitle": "Title of Target Post",
      "relevanceScore": 0.9,
      "reason": "brief reason for this link"
    }
  ]
}`;

        const result = await ai.generate('internal_linking', prompt, {
            systemPrompt: 'You are an SEO internal linking expert. Suggest only highly relevant internal links. Always respond with valid JSON.',
            jsonMode: true,
            temperature: 0.3,
        });

        try {
            const parsed = JSON.parse(result);
            return (parsed.links || []).map((link: { anchorText: string; targetSlug: string; targetTitle: string; relevanceScore: number }) => ({
                anchorText: link.anchorText,
                targetUrl: `${siteUrl}/${link.targetSlug}`,
                targetTitle: link.targetTitle,
                relevanceScore: link.relevanceScore,
                type: 'internal' as const,
            }));
        } catch {
            return [];
        }
    }

    // AI-powered external link suggestions
    async suggestExternalLinks(
        content: string,
        keyword: string
    ): Promise<LinkSuggestion[]> {
        const ai = getAIRouter();

        const prompt = `Analyze this content targeting "${keyword}" and suggest authoritative external links.

CONTENT EXCERPT:
${content.substring(0, 2000)}

RULES:
1. Suggest 3-5 authoritative external sources (.gov, .edu, industry leaders, research papers)
2. Links should add value to the reader
3. Choose anchor text from existing content
4. Prioritize data sources, research, and authoritative definitions
5. Never link to direct competitors

Respond with JSON:
{
  "links": [
    {
      "anchorText": "text to make into a link",
      "targetUrl": "https://example.com/page",
      "targetTitle": "Page Title",
      "relevanceScore": 0.9,
      "reason": "why this source is authoritative"
    }
  ]
}`;

        const result = await ai.generate('internal_linking', prompt, {
            systemPrompt: 'You are an SEO expert specializing in authoritative link building. Always respond with valid JSON.',
            jsonMode: true,
            temperature: 0.3,
        });

        try {
            const parsed = JSON.parse(result);
            const suggestions: LinkSuggestion[] = (parsed.links || []).map((link: { anchorText: string; targetUrl: string; targetTitle: string; relevanceScore: number }) => ({
                ...link,
                type: 'external' as const,
            }));

            // P1 SEO Fix: Verify URLs actually exist before returning
            return await this.verifyExternalUrls(suggestions);
        } catch {
            return [];
        }
    }

    // ── P1 SEO Fix: Verify external URLs via HEAD request ─────
    // Filters out broken/hallucinated URLs from AI suggestions
    private async verifyExternalUrls(links: LinkSuggestion[]): Promise<LinkSuggestion[]> {
        const results = await Promise.allSettled(
            links.map(async (link): Promise<LinkSuggestion | null> => {
                try {
                    const res = await fetch(link.targetUrl, {
                        method: 'HEAD',
                        signal: AbortSignal.timeout(5000),
                        redirect: 'follow',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; RankMasterBot/1.0)',
                        },
                    });
                    if (res.ok || (res.status >= 300 && res.status < 400)) {
                        return link;
                    }
                    console.log(`[LinkVerify] Filtered broken URL (${res.status}): ${link.targetUrl}`);
                    return null;
                } catch {
                    console.log(`[LinkVerify] Filtered unreachable URL: ${link.targetUrl}`);
                    return null;
                }
            })
        );

        return results
            .filter((r): r is PromiseFulfilledResult<LinkSuggestion | null> => r.status === 'fulfilled')
            .map(r => r.value)
            .filter((v): v is LinkSuggestion => v !== null);
    }

    // Insert links into content
    insertLinksIntoContent(
        content: string,
        links: LinkSuggestion[]
    ): string {
        let modifiedContent = content;

        // Sort by relevance (highest first) and limit to prevent over-linking
        const sortedLinks = [...links]
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 8);

        for (const link of sortedLinks) {
            // Only replace first occurrence; skip if inside an HTML tag or heading
            const escapedAnchor = link.anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Negative lookbehind: not inside <a>, <h1>-<h6>, <img alt="
            const regex = new RegExp(`(?<!<a[^>]*>)(?<!<h[1-6][^>]*>)${escapedAnchor}(?![^<]*<\/a>)(?![^<]*<\/h[1-6]>)`, 'i');

            const replacement = link.type === 'external'
                ? `<a href="${link.targetUrl}" target="_blank" rel="noopener noreferrer">${link.anchorText}</a>`
                : `<a href="${link.targetUrl}">${link.anchorText}</a>`;

            modifiedContent = modifiedContent.replace(regex, replacement);
        }

        return modifiedContent;
    }

    // ── #59: PageRank-Aware Link Distribution ──────────────────
    // Calculates a simple internal PageRank proxy and prioritizes linking
    // to high-authority pages that could benefit from more internal links
    calculateInternalPageRank(posts: { id: string; title: string; slug: string; keywords: string[] }[], existingLinks: { from: string; to: string; anchor: string }[]): Map<string, number> {
        const pageRank = new Map<string, number>();
        const N = posts.length;
        const dampingFactor = 0.85;

        // Initialize all pages with equal rank
        for (const post of posts) {
            pageRank.set(post.id, 1 / N);
        }

        // Build adjacency: who links TO each page
        const incomingLinks = new Map<string, string[]>();
        const outgoingCount = new Map<string, number>();

        for (const link of existingLinks) {
            // Find which post the link.to URL corresponds to
            const targetPost = posts.find(p => link.to.includes(p.slug));
            if (targetPost) {
                const existing = incomingLinks.get(targetPost.id) || [];
                existing.push(link.from);
                incomingLinks.set(targetPost.id, existing);
            }
            outgoingCount.set(link.from, (outgoingCount.get(link.from) || 0) + 1);
        }

        // Iterate PageRank algorithm (5 iterations is sufficient for internal links)
        for (let iter = 0; iter < 5; iter++) {
            const newRanks = new Map<string, number>();
            for (const post of posts) {
                const incoming = incomingLinks.get(post.id) || [];
                let sum = 0;
                for (const fromId of incoming) {
                    const fromRank = pageRank.get(fromId) || 0;
                    const fromOutgoing = outgoingCount.get(fromId) || 1;
                    sum += fromRank / fromOutgoing;
                }
                newRanks.set(post.id, (1 - dampingFactor) / N + dampingFactor * sum);
            }
            for (const [id, rank] of newRanks) {
                pageRank.set(id, rank);
            }
        }

        return pageRank;
    }

    // Sort link suggestions by target's PageRank (prefer linking to high-authority pages)
    prioritizeLinksByPageRank(
        suggestions: LinkSuggestion[],
        posts: { id: string; title: string; slug: string; keywords: string[] }[],
        existingLinks: { from: string; to: string; anchor: string }[]
    ): LinkSuggestion[] {
        const pageRanks = this.calculateInternalPageRank(posts, existingLinks);
        
        return suggestions.map(link => {
            const targetPost = posts.find(p => link.targetUrl.includes(p.slug));
            const rankBoost = targetPost ? (pageRanks.get(targetPost.id) || 0) * 100 : 0;
            return {
                ...link,
                relevanceScore: link.relevanceScore + rankBoost,
            };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    // ── #60: Bi-Directional Link Verification ──────────────────
    // Identifies orphaned pages (no incoming links) and missing reciprocal links
    verifyBidirectionalLinks(
        posts: { id: string; title: string; slug: string; keywords: string[] }[],
        existingLinks: { from: string; to: string; anchor: string }[]
    ): {
        orphanedPages: { id: string; title: string }[];
        missingReciprocals: { from: string; to: string; fromTitle: string; toTitle: string }[];
        linkHealth: number; // 0-100
    } {
        // Find pages with no incoming internal links
        const pagesWithIncomingLinks = new Set<string>();
        for (const link of existingLinks) {
            const targetPost = posts.find(p => link.to.includes(p.slug));
            if (targetPost) pagesWithIncomingLinks.add(targetPost.id);
        }

        const orphanedPages = posts
            .filter(p => !pagesWithIncomingLinks.has(p.id))
            .map(p => ({ id: p.id, title: p.title }));

        // Find missing reciprocal links (A→B exists but B→A doesn't)
        const missingReciprocals: { from: string; to: string; fromTitle: string; toTitle: string }[] = [];
        const linkPairs = new Set<string>();

        for (const link of existingLinks) {
            const targetPost = posts.find(p => link.to.includes(p.slug));
            if (targetPost) {
                linkPairs.add(`${link.from}→${targetPost.id}`);
            }
        }

        for (const link of existingLinks) {
            const targetPost = posts.find(p => link.to.includes(p.slug));
            if (!targetPost) continue;

            const reciprocal = `${targetPost.id}→${link.from}`;
            if (!linkPairs.has(reciprocal)) {
                const fromPost = posts.find(p => p.id === link.from);
                if (fromPost) {
                    // Only add unique pairs
                    const key = [link.from, targetPost.id].sort().join('-');
                    if (!missingReciprocals.some(r => [r.from, r.to].sort().join('-') === key)) {
                        missingReciprocals.push({
                            from: targetPost.id,
                            to: link.from,
                            fromTitle: targetPost.title,
                            toTitle: fromPost.title,
                        });
                    }
                }
            }
        }

        // Calculate link health score
        const orphanPenalty = posts.length > 0 ? (orphanedPages.length / posts.length) * 50 : 0;
        const reciprocalPenalty = existingLinks.length > 0 ? Math.min(missingReciprocals.length * 2, 30) : 0;
        const linkHealth = Math.max(0, Math.round(100 - orphanPenalty - reciprocalPenalty));

        return { orphanedPages, missingReciprocals, linkHealth };
    }
}

import { createSingleton } from '../singleton';

export const getLinkingEngine = createSingleton(() => new LinkingEngine());
