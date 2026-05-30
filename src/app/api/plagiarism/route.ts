import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAIRouter } from '@/lib/ai/router';

// ── N-Gram Fingerprinting ─────────────────────────────────────
// Algorithmic plagiarism detection using shingling + Jaccard similarity

function extractNgrams(text: string, n: number = 5): Set<string> {
    const words = text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2);
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
        ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

// Extract distinctive phrases (6+ word sequences) for web verification
function extractDistinctivePhrases(text: string, count: number = 5): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 30);
    // Pick sentences with specific claims, numbers, or unique phrasing
    const scored = sentences.map(s => {
        const trimmed = s.trim();
        let score = 0;
        if (/\d+/.test(trimmed)) score += 2; // Has numbers
        if (trimmed.length > 60 && trimmed.length < 200) score += 1; // Good length
        if (/"[^"]+"/.test(trimmed)) score += 3; // Has quotes
        if (/according to|study|research|report/i.test(trimmed)) score += 2; // Has citations
        return { text: trimmed, score };
    });
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(s => s.text.substring(0, 100));
}

// Check for self-plagiarism against existing posts
async function checkSelfPlagiarism(
    content: string,
    supabase: any,
    userId: string
): Promise<{ duplicates: { title: string; similarity: number }[]; maxSimilarity: number }> {
    const contentNgrams = extractNgrams(content);
    const duplicates: { title: string; similarity: number }[] = [];

    // Fetch user's existing posts (last 100)
    const { data: posts } = await supabase
        .from('posts')
        .select('title, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (posts && posts.length > 0) {
        for (const post of posts) {
            if (!post.content) continue;
            const postText = post.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            const postNgrams = extractNgrams(postText);
            const similarity = jaccardSimilarity(contentNgrams, postNgrams);
            if (similarity > 0.15) {
                duplicates.push({ title: post.title || 'Untitled', similarity: Math.round(similarity * 100) });
            }
        }
    }

    duplicates.sort((a, b) => b.similarity - a.similarity);
    const maxSimilarity = duplicates.length > 0 ? duplicates[0].similarity : 0;
    return { duplicates: duplicates.slice(0, 5), maxSimilarity };
}

// POST /api/plagiarism — Combined algorithmic + AI plagiarism check
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const rateLimited = checkRateLimit(auth.user.id, '/api/plagiarism', { maxRequests: 10, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const { content, title } = body;

        if (!content || content.length < 100) {
            return NextResponse.json({ error: 'Content must be at least 100 characters' }, { status: 400 });
        }

        const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        // ── Algorithmic Checks (reliable, deterministic) ──────────

        // 1. Self-plagiarism detection via n-gram fingerprinting
        const selfPlagiarism = await checkSelfPlagiarism(plainText, auth.supabase, auth.user.id);

        // 2. Extract distinctive phrases for manual web verification
        const distinctivePhrases = extractDistinctivePhrases(plainText);

        // 3. Content repetition analysis (internal duplication)
        const sentences = plainText.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
        const sentenceSet = new Set<string>();
        const duplicateSentences: string[] = [];
        for (const sentence of sentences) {
            const normalized = sentence.trim().toLowerCase();
            if (sentenceSet.has(normalized)) {
                duplicateSentences.push(sentence.trim());
            } else {
                sentenceSet.add(normalized);
            }
        }

        // 4. Paragraph-level similarity (catch copy-pasted blocks)
        const paragraphs = plainText.split(/\n{2,}/).filter((p: string) => p.trim().length > 50);
        const paragraphDuplicates: { text: string; count: number }[] = [];
        const paraMap = new Map<string, number>();
        for (const para of paragraphs) {
            const key = para.trim().toLowerCase().substring(0, 200);
            paraMap.set(key, (paraMap.get(key) || 0) + 1);
        }
        for (const [text, count] of paraMap) {
            if (count > 1) {
                paragraphDuplicates.push({ text: text.substring(0, 100) + '...', count });
            }
        }

        // ── AI Analysis (supplementary, with explicit disclaimer) ──

        const router = getAIRouter();
        await router.loadKeys();

        const prompt = `You are an expert content analyst. Analyze this content for AI-generated patterns and writing quality.

IMPORTANT: You CANNOT detect actual plagiarism or check the web. Only analyze writing patterns.

Content Title: ${title || 'Untitled'}
Content (first 3000 chars):
${plainText.slice(0, 3000)}

Analyze ONLY:
1. AI-generated patterns (repetitive phrases, generic structures, lack of personality)
2. Writing quality indicators (voice consistency, natural flow)
3. Humanization quality (does it read like a real person wrote it?)

Respond in valid JSON:
{
    "ai_detection": {
        "score": 70,
        "risk_level": "medium",
        "patterns_found": ["Pattern 1", "Pattern 2"]
    },
    "writing_quality": {
        "score": 75,
        "strengths": ["Good tone"],
        "weaknesses": ["Generic structure"]
    },
    "humanization_suggestions": ["Add personal anecdote", "Use more varied sentence structures"]
}

Score ranges: 90-100 = Excellent, 70-89 = Good, 50-69 = Needs Work, <50 = High Risk.`;

        let aiAnalysis: Record<string, unknown> = {};
        try {
            const result = await router.generate('content_optimization', prompt);
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            aiAnalysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
            aiAnalysis = { error: 'AI analysis unavailable' };
        }

        // ── Combined Report ────────────────────────────────────────

        const selfPlagiarismRisk = selfPlagiarism.maxSimilarity > 50 ? 'high' :
            selfPlagiarism.maxSimilarity > 25 ? 'medium' : 'low';

        const overallScore = Math.round(
            (selfPlagiarism.maxSimilarity > 50 ? 30 : selfPlagiarism.maxSimilarity > 25 ? 60 : 90) * 0.4 +
            (duplicateSentences.length > 3 ? 40 : duplicateSentences.length > 0 ? 70 : 95) * 0.2 +
            ((aiAnalysis as any)?.ai_detection?.score || 70) * 0.4
        );

        return NextResponse.json({
            analysis: {
                overall_score: overallScore,

                // Algorithmic results (reliable)
                self_plagiarism: {
                    risk_level: selfPlagiarismRisk,
                    max_similarity: selfPlagiarism.maxSimilarity,
                    similar_posts: selfPlagiarism.duplicates,
                },
                internal_duplication: {
                    duplicate_sentences: duplicateSentences.length,
                    duplicate_paragraphs: paragraphDuplicates.length,
                    details: duplicateSentences.slice(0, 3),
                },
                verification_phrases: {
                    note: 'Search these phrases in Google to manually verify originality',
                    phrases: distinctivePhrases,
                },

                // AI analysis (supplementary — clearly labeled)
                ai_pattern_analysis: {
                    disclaimer: 'AI pattern detection is heuristic and may not be 100% accurate. Use algorithmic results above as primary indicators.',
                    ...aiAnalysis,
                },

                recommendations: [
                    ...(selfPlagiarism.maxSimilarity > 25 ? [`High similarity (${selfPlagiarism.maxSimilarity}%) with existing post "${selfPlagiarism.duplicates[0]?.title}". Rewrite overlapping sections.`] : []),
                    ...(duplicateSentences.length > 0 ? [`${duplicateSentences.length} duplicate sentence(s) found within the content. Remove repetition.`] : []),
                    'Search the verification phrases in Google to check for external plagiarism.',
                    ...(paragraphDuplicates.length > 0 ? [`${paragraphDuplicates.length} duplicate paragraph block(s) detected.`] : []),
                ],
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Analysis failed' },
            { status: 500 }
        );
    }
}
