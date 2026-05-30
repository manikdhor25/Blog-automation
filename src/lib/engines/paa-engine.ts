// ============================================================
// RankMaster Pro - PAA (People Also Ask) Domination Engine
// #44 — Systematically captures PAA boxes across SERPs
// Mines questions, optimizes content, and generates hub articles
// ============================================================

import { getAIRouter } from '../ai/router';
import { createSingleton } from '../singleton';

// ── Types ──────────────────────────────────────────────────────

export interface PAAQuestion {
    question: string;
    category: string;       // e.g., 'definition', 'comparison', 'how-to', 'why', 'cost'
    searchVolume: 'high' | 'medium' | 'low' | 'unknown';
    priority: number;       // 1-10 (10 = highest)
    isAnswered?: boolean;   // Whether current content answers this
    suggestedFormat?: 'paragraph' | 'list' | 'table';
}

export interface PAAAnalysis {
    keyword: string;
    totalQuestions: number;
    answeredQuestions: number;
    unansweredQuestions: PAAQuestion[];
    coverageScore: number;  // 0-100
    recommendations: string[];
}

export interface PAAHubArticle {
    title: string;
    metaTitle: string;
    metaDescription: string;
    content: string;
    questionsAnswered: number;
    faqSchema: { question: string; answer: string }[];
}

// ── PAA Engine Class ──────────────────────────────────────────

export class PAAEngine {

    /**
     * Mine PAA questions for a keyword using AI
     * Generates a comprehensive question tree organized by subtopic
     */
    async minePAAQuestions(
        keyword: string,
        existingPAA?: string[],
        niche?: string
    ): Promise<PAAQuestion[]> {
        const ai = getAIRouter();

        const existingContext = existingPAA && existingPAA.length > 0
            ? `\nEXISTING PAA QUESTIONS ALREADY KNOWN:\n${existingPAA.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nGenerate ADDITIONAL questions not in this list.`
            : '';

        const prompt = `You are a PAA (People Also Ask) research specialist. Generate a comprehensive list of questions people ask about "${keyword}".
${niche ? `\nNICHE: ${niche}` : ''}${existingContext}

REQUIREMENTS:
1. Generate 20-30 unique questions organized by category
2. Categories: definition, comparison, how-to, why, cost/pricing, best-of, troubleshooting, alternatives
3. Include questions at different depth levels:
   - Level 1: Basic/beginner questions ("What is [keyword]?")
   - Level 2: Intermediate questions ("How does [keyword] compare to [alternative]?")
   - Level 3: Advanced/specific questions ("What are the [keyword] [specific metric] benchmarks for [industry]?")
4. Each question should match a real search query format
5. Prioritize questions by search likelihood (1-10)

Return JSON:
{
  "questions": [
    {
      "question": "What is [keyword]?",
      "category": "definition",
      "searchVolume": "high",
      "priority": 10,
      "suggestedFormat": "paragraph"
    }
  ]
}`;

        try {
            const result = await ai.generate('paa_mining', prompt, {
                systemPrompt: 'You are a PAA research specialist. Generate realistic search questions. Return valid JSON.',
                jsonMode: true,
                temperature: 0.4,
            });

            const parsed = JSON.parse(result);
            return (parsed.questions || []).map((q: PAAQuestion) => ({
                question: q.question,
                category: q.category || 'general',
                searchVolume: q.searchVolume || 'unknown',
                priority: q.priority || 5,
                suggestedFormat: q.suggestedFormat || 'paragraph',
            }));
        } catch {
            return [];
        }
    }

    /**
     * Analyze which PAA questions are answered in content
     */
    optimizeForPAA(content: string, questions: PAAQuestion[]): PAAAnalysis {
        const textContent = content.replace(/<[^>]+>/g, ' ').toLowerCase();
        const headings = content.match(/<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/gi) || [];
        const headingTexts = headings.map(h => h.replace(/<[^>]+>/g, '').toLowerCase().trim());

        const answeredQuestions: PAAQuestion[] = [];
        const unansweredQuestions: PAAQuestion[] = [];

        for (const q of questions) {
            const qLower = q.question.toLowerCase();
            // Check if question or close variant appears in headings or content
            const keyWords = qLower
                .replace(/\b(what|how|why|when|where|which|who|is|are|do|does|can|should)\b/gi, '')
                .split(/\s+/)
                .filter(w => w.length > 3);

            const matchedKeywords = keyWords.filter(w => textContent.includes(w));
            const matchRatio = keyWords.length > 0 ? matchedKeywords.length / keyWords.length : 0;

            // Check if there's a heading that matches the question
            const headingMatch = headingTexts.some(h => {
                const hWords = h.split(/\s+/).filter(w => w.length > 3);
                const overlap = hWords.filter(w => keyWords.includes(w)).length;
                return overlap >= Math.min(2, keyWords.length);
            });

            if (headingMatch || matchRatio >= 0.7) {
                answeredQuestions.push({ ...q, isAnswered: true });
            } else {
                unansweredQuestions.push({ ...q, isAnswered: false });
            }
        }

        const coverageScore = questions.length > 0
            ? Math.round((answeredQuestions.length / questions.length) * 100)
            : 0;

        const recommendations: string[] = [];
        if (coverageScore < 50) {
            recommendations.push('Add H2/H3 sections addressing unanswered PAA questions');
        }
        if (unansweredQuestions.filter(q => q.priority >= 8).length > 0) {
            recommendations.push('High-priority PAA questions are unanswered — add them as FAQ items');
        }
        if (answeredQuestions.length > 0 && coverageScore < 80) {
            recommendations.push('Content covers some PAA topics but needs more depth on remaining questions');
        }

        // Sort unanswered by priority
        unansweredQuestions.sort((a, b) => b.priority - a.priority);

        return {
            keyword: '',
            totalQuestions: questions.length,
            answeredQuestions: answeredQuestions.length,
            unansweredQuestions,
            coverageScore,
            recommendations,
        };
    }

    /**
     * Generate a comprehensive hub article answering 10-15 PAA questions
     */
    async generatePAAArticle(
        questions: PAAQuestion[],
        keyword: string,
        niche?: string
    ): Promise<PAAHubArticle> {
        const ai = getAIRouter();
        const topQuestions = questions
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 15);

        const prompt = `Create a comprehensive FAQ hub article about "${keyword}" that answers these People Also Ask questions:

${topQuestions.map((q, i) => `${i + 1}. ${q.question} [Format: ${q.suggestedFormat}]`).join('\n')}
${niche ? `\nNICHE: ${niche}` : ''}

REQUIREMENTS:
1. H1 title: Use format "[Keyword]: [Number] Questions Answered" or "Everything About [Keyword]: FAQ Guide"
2. Brief intro (80-100 words) explaining what this guide covers
3. Each question as an H2 heading (in question format)
4. Each answer: 60-100 words, starting with a direct statement
5. Use the suggested format (paragraph/list/table) for each answer
6. Include cross-links between related questions
7. End with a brief summary section
8. ALL content in valid HTML format

Return JSON:
{
  "title": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "content": "<full HTML>",
  "faqSchema": [{ "question": "...", "answer": "..." }]
}`;

        try {
            const result = await ai.generate('paa_article', prompt, {
                systemPrompt: 'You create comprehensive FAQ hub articles optimized for PAA boxes. Return valid JSON.',
                jsonMode: true,
                temperature: 0.4,
            });

            const parsed = JSON.parse(result);
            return {
                title: parsed.title || `${keyword}: Frequently Asked Questions`,
                metaTitle: parsed.metaTitle || `${keyword} FAQ - ${topQuestions.length} Questions Answered`,
                metaDescription: parsed.metaDescription || `Get answers to the most common questions about ${keyword}. Expert-verified answers covering ${topQuestions.length} topics.`,
                content: parsed.content || '',
                questionsAnswered: topQuestions.length,
                faqSchema: parsed.faqSchema || topQuestions.map(q => ({ question: q.question, answer: '' })),
            };
        } catch {
            return {
                title: `${keyword}: Frequently Asked Questions`,
                metaTitle: `${keyword} FAQ`,
                metaDescription: `Answers to common questions about ${keyword}.`,
                content: '',
                questionsAnswered: 0,
                faqSchema: [],
            };
        }
    }

    /**
     * Format an answer to match Google's preferred PAA answer format
     * #45 — PAA-Aware FAQ answer formatting
     */
    formatPAAAnswer(answer: string): string {
        let formatted = answer.trim();

        // Remove hedging starters
        formatted = formatted
            .replace(/^(Well,?\s*|It depends,?\s*|Generally speaking,?\s*|That's a great question\.?\s*|Good question\.?\s*)/i, '')
            .trim();

        // Ensure starts with capital letter
        formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

        // Trim to snippet-eligible length (40-60 words)
        const words = formatted.split(/\s+/);
        if (words.length > 65) {
            // Find the nearest sentence end within 40-65 words
            const text = words.slice(0, 65).join(' ');
            const lastSentence = text.lastIndexOf('. ');
            if (lastSentence > 0 && lastSentence > text.length * 0.5) {
                formatted = text.substring(0, lastSentence + 1);
            } else {
                formatted = words.slice(0, 60).join(' ') + '.';
            }
        }

        return formatted;
    }
}

export const getPAAEngine = createSingleton(() => new PAAEngine());
