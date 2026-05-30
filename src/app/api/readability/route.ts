// ============================================================
// RankMaster Pro - Readability Improver API
// Flesch-Kincaid scoring + AI rewrites for clarity
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['score', 'improve', 'improve_post']),
    text: z.string().min(50).max(20000).optional(),
    post_id: z.string().uuid().optional(),
    target_grade: z.number().min(5).max(16).default(8).optional(),
    section: z.enum(['full', 'intro', 'conclusion', 'all_paragraphs']).default('full').optional(),
});

function fleschKincaid(text: string): { score: number; grade_level: number; reading_ease: string; avg_sentence_len: number; avg_syllables: number } {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllableCount = (word: string) => {
        word = word.toLowerCase().replace(/[^a-z]/g, '');
        if (word.length <= 3) return 1;
        const vowels = word.match(/[aeiouy]+/g) || [];
        let count = vowels.length;
        if (word.endsWith('e')) count--;
        if (word.endsWith('le') && word.length > 2) count++;
        return Math.max(1, count);
    };

    if (sentences.length === 0 || words.length === 0) return { score: 0, grade_level: 0, reading_ease: 'Unknown', avg_sentence_len: 0, avg_syllables: 0 };

    const avgSentenceLen = words.length / sentences.length;
    const totalSyllables = words.reduce((s, w) => s + syllableCount(w), 0);
    const avgSyllables = totalSyllables / words.length;

    // Flesch Reading Ease
    const score = 206.835 - (1.015 * avgSentenceLen) - (84.6 * avgSyllables);
    // Flesch-Kincaid Grade Level
    const grade = (0.39 * avgSentenceLen) + (11.8 * avgSyllables) - 15.59;

    const ease = score >= 90 ? 'Very Easy' : score >= 80 ? 'Easy' : score >= 70 ? 'Fairly Easy' : score >= 60 ? 'Standard' : score >= 50 ? 'Fairly Difficult' : score >= 30 ? 'Difficult' : 'Very Difficult';

    return {
        score: parseFloat(Math.max(0, Math.min(100, score)).toFixed(1)),
        grade_level: parseFloat(Math.max(1, grade).toFixed(1)),
        reading_ease: ease,
        avg_sentence_len: parseFloat(avgSentenceLen.toFixed(1)),
        avg_syllables: parseFloat(avgSyllables.toFixed(2)),
    };
}

function findDifficultSentences(text: string, maxGrade: number): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.filter(s => {
        const words = s.trim().split(/\s+/);
        return words.length > 25 || words.some(w => w.length > 12);
    }).slice(0, 5);
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'score') {
        const { text, post_id } = parsed.data;
        let content = text || '';
        if (post_id && !content) {
            const { data: post } = await auth.supabase.from('posts').select('content_markdown, content_html').eq('id', post_id).eq('user_id', auth.user.id).single();
            content = post?.content_markdown || post?.content_html?.replace(/<[^>]+>/g, ' ') || '';
        }
        if (!content) return NextResponse.json({ error: 'text or post_id required' }, { status: 400 });

        const scores = fleschKincaid(content);
        const difficultSentences = findDifficultSentences(content, parsed.data.target_grade || 8);

        return NextResponse.json({
            ...scores,
            target_grade: parsed.data.target_grade || 8,
            needs_improvement: scores.grade_level > (parsed.data.target_grade || 8),
            difficult_sentences: difficultSentences,
            word_count: content.split(/\s+/).length,
            recommendations: [
                scores.avg_sentence_len > 20 ? `Average sentence length is ${scores.avg_sentence_len} words — aim for under 20` : null,
                scores.grade_level > 10 ? `Grade level ${scores.grade_level} is too high for general audiences — target grade 6-8` : null,
                scores.score < 60 ? 'Rewrite long sentences as 2 shorter ones' : null,
                scores.avg_syllables > 1.6 ? 'Replace polysyllabic words with simpler alternatives' : null,
            ].filter(Boolean),
        });
    }

    if (action === 'improve' || action === 'improve_post') {
        const { text, post_id, target_grade = 8, section = 'full' } = parsed.data;
        let content = text || '';
        if (post_id && !content) {
            const { data: post } = await auth.supabase.from('posts').select('content_markdown, content_html').eq('id', post_id).eq('user_id', auth.user.id).single();
            content = post?.content_markdown || post?.content_html?.replace(/<[^>]+>/g, ' ') || '';
            if (section === 'intro') content = content.split('\n\n').slice(0, 2).join('\n\n');
        }
        if (!content) return NextResponse.json({ error: 'text or post_id required' }, { status: 400 });

        const before = fleschKincaid(content);

        const prompt = `Improve the readability of this text to target Grade ${target_grade} (Flesch-Kincaid).
Current grade level: ${before.grade_level}, Current reading ease: ${before.score}/100

Rules:
1. Break sentences over 25 words into 2 shorter ones
2. Replace complex words: utilize→use, implement→do, facilitate→help, leverage→use, commence→start
3. Convert passive to active voice where possible
4. Keep ALL factual information exactly the same
5. Keep all links, numbers, and names unchanged
6. Target: grade ${target_grade}, aim for 70+ reading ease score

Text to improve:
${content.substring(0, 5000)}

Return ONLY valid JSON:
{
  "improved_text": "the improved version",
  "changes_made": ["specific change 1", "change 2"],
  "estimated_grade_after": ${Math.max(5, target_grade - 1)},
  "estimated_ease_after": ${Math.min(100, before.score + 15)}
}`;

        const result = await routeAI({ task: 'content_optimization', prompt, systemPrompt: 'Readability expert. Simplify without losing meaning. Return only JSON.', maxTokens: Math.min(4000, content.length * 2), jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Improvement failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            const data = JSON.parse(m?.[0] || result.content);
            const after = fleschKincaid(data.improved_text || content);
            return NextResponse.json({ ...data, score_before: before, score_after: after, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
