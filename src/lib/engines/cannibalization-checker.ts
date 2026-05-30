// ============================================================
// RankMaster Pro - Content Cannibalization Checker
// Detects keyword overlap between new and existing posts
// to prevent cannibalization that dilutes ranking potential.
// ============================================================

import { createServiceRoleClient } from '../supabase';

export interface CannibalizationWarning {
    existingPostId: string;
    existingTitle: string;
    existingKeyword: string;
    similarity: number;       // 0-1 Jaccard index
    type: 'keyword_overlap' | 'title_overlap' | 'both';
    suggestion: string;
}

export interface CannibalizationReport {
    hasCannibalization: boolean;
    warnings: CannibalizationWarning[];
    severity: 'none' | 'low' | 'medium' | 'high';
}

/**
 * Tokenize a string into cleaned word tokens for comparison.
 * Removes stop words and normalizes to lowercase.
 */
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'about', 'your', 'you',
    'we', 'our', 'my', 'its', 'it', 'they', 'them', 'this', 'that',
    'these', 'those', 'which', 'what', 'when', 'where', 'how',
]);

function tokenize(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    );
}

/**
 * Calculate Jaccard similarity between two sets of tokens.
 * Returns 0-1 where 1 = identical token sets.
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Check if a new keyword/title would cannibalize existing content
 * on the same site. Returns warnings with actionable suggestions.
 *
 * @param siteId       Site to check against
 * @param newKeyword   The target keyword for the new article
 * @param newTitle     The proposed title for the new article
 * @param excludePostId  Optional post ID to exclude (for re-optimization checks)
 */
export async function checkCannibalization(
    siteId: string,
    newKeyword: string,
    newTitle: string,
    excludePostId?: string
): Promise<CannibalizationReport> {
    const supabase = createServiceRoleClient();

    // Fetch all published/draft posts for this site
    const { data: posts } = await supabase
        .from('posts')
        .select('id, title, target_keyword, slug, status')
        .eq('site_id', siteId)
        .in('status', ['publish', 'draft']);

    if (!posts || posts.length === 0) {
        return { hasCannibalization: false, warnings: [], severity: 'none' };
    }

    const newKeywordTokens = tokenize(newKeyword);
    const newTitleTokens = tokenize(newTitle);
    const warnings: CannibalizationWarning[] = [];

    for (const post of posts) {
        // Skip the post being optimized
        if (excludePostId && post.id === excludePostId) continue;

        const existingKeyword = post.target_keyword || '';
        const existingTitle = post.title || '';

        const existingKWTokens = tokenize(existingKeyword);
        const existingTitleTokens = tokenize(existingTitle);

        const kwSimilarity = jaccardSimilarity(newKeywordTokens, existingKWTokens);
        const titleSimilarity = jaccardSimilarity(newTitleTokens, existingTitleTokens);

        // Threshold: 0.5 for keywords (tighter), 0.4 for titles
        const kwOverlap = kwSimilarity >= 0.5;
        const titleOverlap = titleSimilarity >= 0.4;

        if (kwOverlap || titleOverlap) {
            const similarity = Math.max(kwSimilarity, titleSimilarity);
            const type: CannibalizationWarning['type'] =
                kwOverlap && titleOverlap ? 'both' :
                    kwOverlap ? 'keyword_overlap' : 'title_overlap';

            let suggestion = '';
            if (similarity >= 0.8) {
                suggestion = `Very high overlap with "${existingTitle}". Consider updating the existing article instead of creating a new one, or differentiate the angle significantly.`;
            } else if (similarity >= 0.6) {
                suggestion = `Moderate overlap with "${existingTitle}". Ensure the new article targets a distinct search intent or subtopic. Add internal links between both articles.`;
            } else {
                suggestion = `Minor overlap with "${existingTitle}". Differentiate with unique headings, a different content format (listicle vs guide), or a more specific long-tail focus.`;
            }

            warnings.push({
                existingPostId: post.id,
                existingTitle,
                existingKeyword,
                similarity: Math.round(similarity * 100) / 100,
                type,
                suggestion,
            });
        }
    }

    // Sort by similarity (highest first)
    warnings.sort((a, b) => b.similarity - a.similarity);

    const severity: CannibalizationReport['severity'] =
        warnings.some(w => w.similarity >= 0.8) ? 'high' :
            warnings.some(w => w.similarity >= 0.6) ? 'medium' :
                warnings.length > 0 ? 'low' : 'none';

    return {
        hasCannibalization: warnings.length > 0,
        warnings: warnings.slice(0, 5), // Top 5 most similar
        severity,
    };
}

// ── #61: Cannibalization Resolution Strategies ────────────────
// Provides actionable resolution steps based on cannibalization severity

export interface CannibalizationResolution {
    action: 'merge' | 'redirect' | 'differentiate' | 'support_content' | 'ignore';
    description: string;
    steps: string[];
    priority: 'critical' | 'high' | 'medium' | 'low';
}

export function resolveCannibalization(report: CannibalizationReport): CannibalizationResolution[] {
    if (!report.hasCannibalization) return [];

    return report.warnings.map(warning => {
        // High similarity (>0.8) — merge or redirect
        if (warning.similarity >= 0.8) {
            return {
                action: 'merge' as const,
                description: `"${warning.existingTitle}" is nearly identical — merge into one comprehensive article`,
                steps: [
                    `Combine unique content from both articles targeting "${warning.existingKeyword}"`,
                    'Set a 301 redirect from the weaker article to the stronger one',
                    'Update all internal links pointing to the redirected URL',
                    'Re-submit the canonical URL to Search Console for re-indexing',
                ],
                priority: 'critical' as const,
            };
        }

        // Medium-high similarity (0.6-0.8) — differentiate intent
        if (warning.similarity >= 0.6) {
            if (warning.type === 'keyword_overlap') {
                return {
                    action: 'differentiate' as const,
                    description: `Differentiate search intent between this article and "${warning.existingTitle}"`,
                    steps: [
                        `Assign different search intents: one informational, one commercial/transactional`,
                        `Rewrite the title and H1 to clearly target a different angle for "${warning.existingKeyword}"`,
                        `Update meta description to reflect the unique value proposition`,
                        `Add internal links between both articles with descriptive anchor text`,
                    ],
                    priority: 'high' as const,
                };
            }
            return {
                action: 'redirect' as const,
                description: `Strong title overlap with "${warning.existingTitle}" — consider 301 redirect`,
                steps: [
                    'Determine which article has better rankings and engagement metrics',
                    'Merge unique content from the weaker article into the stronger one',
                    'Set up 301 redirect from weaker to stronger URL',
                    'Audit and update internal links that referenced the redirected page',
                ],
                priority: 'high' as const,
            };
        }

        // Lower similarity (0.35-0.6) — convert to supporting content
        if (warning.similarity >= 0.35) {
            return {
                action: 'support_content' as const,
                description: `Convert to supporting content that links up to "${warning.existingTitle}" as pillar`,
                steps: [
                    `Target a long-tail variation of "${warning.existingKeyword}" instead of the head term`,
                    `Add prominent internal link to the pillar article in the first 200 words`,
                    `Focus on a specific sub-topic or angle not covered in the pillar`,
                    `Use different content format (how-to vs listicle vs comparison)`,
                ],
                priority: 'medium' as const,
            };
        }

        // Minimal overlap — ignore
        return {
            action: 'ignore' as const,
            description: `Minor overlap with "${warning.existingTitle}" — no action needed`,
            steps: ['Monitor rankings for both pages over the next 30 days'],
            priority: 'low' as const,
        };
    });
}
