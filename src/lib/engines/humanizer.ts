// ============================================================
// RankMaster Pro - AI Content Humanizer Engine
// Remove AI patterns, vary structure, inject authentic voice
// ============================================================

import { getAIRouter } from '@/lib/ai/router';

export interface HumanizerResult {
    original_text: string;
    humanized_text: string;
    changes_made: string[];
    ai_score_before: number;
    ai_score_after: number;
    word_count_delta: number;
    techniques_applied: string[];
}

const HUMANIZATION_PROMPT = (text: string) => `You are an expert human writer and editor. Humanize this AI-generated content by applying ALL of these techniques:

1. VARY sentence length dramatically — mix 3-word sentences with 25-word ones
2. ADD contractions (it's, you'll, won't, that's, they're)
3. INJECT first-person voice where natural ("I've found", "In my experience", "When I tested")
4. BREAK up "topic sentence → explanation → example" AI pattern structure
5. ADD rhetorical questions that flow naturally
6. REMOVE transition words (Furthermore, Moreover, In conclusion, In addition, Additionally)
7. REPLACE passive voice with active voice
8. ADD specific numbers, dates, personal anecdotes
9. START some sentences with "And", "But", "So", "Yet" — like humans write
10. VARY paragraph length — some single sentence paragraphs
11. REMOVE hedging phrases ("It's worth noting", "It's important to", "One might argue")
12. ADD colloquialisms appropriate to the niche

IMPORTANT: Keep all factual information accurate. Don't change meaning. Don't add fake facts.

Content to humanize:
${text.substring(0, 4000)}

Return ONLY valid JSON:
{
  "humanized_text": "the fully humanized version",
  "changes_made": ["specific change 1", "change 2"],
  "techniques_applied": ["technique name 1", "technique 2"],
  "estimated_ai_score_reduction": 35
}`;

export async function humanizeContent(text: string): Promise<HumanizerResult | null> {
    if (!text || text.length < 100) return null;

    // Estimate before score (heuristic)
    const aiBefore = estimateAIScore(text);

    const ai = getAIRouter();
    const result = await ai.generate('content_writing', HUMANIZATION_PROMPT(text), {
        systemPrompt: 'Expert human editor. Make content sound authentically human. Never fabricate facts. Return only JSON.',
        maxTokens: Math.min(4000, text.length * 2),
        jsonMode: true,
    });

    if (!result) return null;

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        const data = JSON.parse(jsonMatch?.[0] || result);

        const aiAfter = estimateAIScore(data.humanized_text || '');
        const originalWords = text.split(/\s+/).length;
        const newWords = (data.humanized_text || '').split(/\s+/).length;

        return {
            original_text: text,
            humanized_text: data.humanized_text || text,
            changes_made: data.changes_made || [],
            ai_score_before: aiBefore,
            ai_score_after: aiAfter,
            word_count_delta: newWords - originalWords,
            techniques_applied: data.techniques_applied || [],
        };
    } catch { return null; }
}

function estimateAIScore(text: string): number {
    // Heuristic AI pattern detector
    let score = 0;

    const patterns = [
        { pattern: /\bfurthermore\b|\bmoreover\b|\badditionally\b|\bin conclusion\b/gi, weight: 10 },
        { pattern: /\bit(?:'s| is) (?:worth|important to|crucial to|essential)\b/gi, weight: 8 },
        { pattern: /\bin today(?:'s| s) (?:fast-paced|digital|modern)\b/gi, weight: 15 },
        { pattern: /^\s*(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|finally),/gm, weight: 7 },
        { pattern: /\bone might\b|\bone can\b|\bone should\b/gi, weight: 8 },
        { pattern: /\bit is (?:worth noting|important to note)\b/gi, weight: 12 },
        { pattern: /\bI (?:cannot|am unable to)\b/gi, weight: 20 },
        { pattern: /\bcertainly\b|\bundoubtedly\b|\binherently\b/gi, weight: 6 },
        { pattern: /\bAs an AI\b|\bAs a language model\b/gi, weight: 40 },
    ];

    for (const { pattern, weight } of patterns) {
        const matches = (text.match(pattern) || []).length;
        score += matches * weight;
    }

    // Sentence length uniformity (AI tends to write similar-length sentences)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 3) {
        const lengths = sentences.map(s => s.split(/\s+/).length);
        const avg = lengths.reduce((a, b) => a + b) / lengths.length;
        const variance = lengths.reduce((s, l) => s + Math.pow(l - avg, 2), 0) / lengths.length;
        if (variance < 10) score += 20; // Low variance = uniform = AI
    }

    return Math.min(100, score);
}
