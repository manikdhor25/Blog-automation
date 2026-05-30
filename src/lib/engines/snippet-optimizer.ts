// ============================================================
// RankMaster Pro - Featured Snippet Optimizer Engine
// Detect snippet type → generate optimal content format
// ============================================================

import { getAIRouter } from '@/lib/ai/router';

export type SnippetType = 'paragraph' | 'numbered_list' | 'bulleted_list' | 'table' | 'definition' | 'how_to' | 'none';

export interface SnippetOpportunity {
    keyword: string;
    detected_type: SnippetType;
    confidence: 'high' | 'medium' | 'low';
    optimized_content: string;
    html: string;
    word_count: number;
    reasoning: string;
}

function detectSnippetType(keyword: string): { type: SnippetType; confidence: 'high' | 'medium' | 'low' } {
    const kw = keyword.toLowerCase();

    // Definition patterns
    if (/^what is |^what are |^define |^meaning of /.test(kw)) return { type: 'definition', confidence: 'high' };

    // How-to patterns
    if (/^how to |^how do you |^how can i |steps to /.test(kw)) return { type: 'how_to', confidence: 'high' };

    // List patterns
    if (/^(best|top|types of|list of|ways to|reasons why|tips for|examples of)/.test(kw)) return { type: 'bulleted_list', confidence: 'high' };

    // Numbered list
    if (/^\d+ |^step[s]? |^process of /.test(kw)) return { type: 'numbered_list', confidence: 'high' };

    // Table patterns
    if (/^compare|vs\.? |difference between|comparison of /.test(kw)) return { type: 'table', confidence: 'high' };

    // Paragraph fallback for questions
    if (/\?$|^why |^when |^where |^who |^which /.test(kw)) return { type: 'paragraph', confidence: 'medium' };

    return { type: 'paragraph', confidence: 'low' };
}

export async function optimizeForSnippet(
    keyword: string,
    currentContent: string,
    existingSnippetType?: SnippetType
): Promise<SnippetOpportunity | null> {
    const { type: detectedType, confidence } = existingSnippetType
        ? { type: existingSnippetType, confidence: 'high' as const }
        : detectSnippetType(keyword);

    const snippetInstructions: Record<SnippetType, string> = {
        paragraph: 'Write a direct, concise answer paragraph: 40-50 words, starts with the keyword, defines/answers clearly, no intro fluff.',
        definition: 'Write a definition: "[keyword] is..." format, 30-40 words, factual, includes what it is + why it matters.',
        numbered_list: 'Write a numbered list: 5-8 items, each item max 10 words, ordered by importance/sequence, no intro sentence.',
        bulleted_list: 'Write a bulleted list: 5-8 bullet points, each max 12 words, parallel structure, most important first.',
        table: 'Create a comparison table: 3-5 rows, 3-4 columns with clear headers, concise cell values (1-5 words each).',
        how_to: 'Write step-by-step instructions: numbered steps, each step 1 sentence, action verb starts each step, 5-8 steps max.',
        none: 'Write a direct answer paragraph: 40-50 words, starts with the keyword.',
    };

    const prompt = `You are a featured snippet SEO expert. Optimize content for a "${detectedType}" featured snippet.

Target keyword: "${keyword}"
Snippet type: ${detectedType}
Current content excerpt: ${currentContent.substring(0, 500)}

${snippetInstructions[detectedType]}

Return ONLY valid JSON:
{
  "optimized_content": "the optimized text content (plain text, no HTML)",
  "html": "the same content formatted in clean HTML appropriate for snippet type",
  "word_count": 45,
  "reasoning": "why this format/length wins the snippet",
  "placement_tip": "where exactly in the article to place this for best snippet chance"
}`;

    const ai = getAIRouter();
    const result = await ai.generate('content_optimization', prompt, {
        systemPrompt: 'Featured snippet optimization expert. Precise, actionable. Return only JSON.',
        maxTokens: 800,
        jsonMode: true,
    });

    if (!result) return null;

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        const data = JSON.parse(jsonMatch?.[0] || result);
        return {
            keyword,
            detected_type: detectedType,
            confidence,
            optimized_content: data.optimized_content,
            html: data.html,
            word_count: data.word_count,
            reasoning: data.reasoning,
        };
    } catch { return null; }
}

export async function analyzeSnippetOpportunities(
    keywords: string[],
    siteContent: string
): Promise<SnippetOpportunity[]> {
    const results = [];
    for (const kw of keywords.slice(0, 10)) {
        const opp = await optimizeForSnippet(kw, siteContent);
        if (opp) results.push(opp);
    }
    return results;
}
