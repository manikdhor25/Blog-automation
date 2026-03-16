import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAIRouter } from '@/lib/ai/router';

// POST /api/plagiarism — Check content for AI detection and originality
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

        const router = getAIRouter();
        await router.loadKeys();

        const prompt = `You are an expert content originality and AI detection analyst. Analyze this content for:
1. AI-generated patterns (repetitive phrases, generic structures, lack of personal anecdotes)
2. Originality concerns (common phrasing, likely duplicated ideas)
3. Humanization quality (natural flow, voice, personality)

Content Title: ${title || 'Untitled'}
Content (first 3000 chars):
${content.slice(0, 3000)}

Respond in valid JSON:
{
    "overall_score": 85,
    "ai_detection": {
        "score": 70,
        "risk_level": "medium",
        "patterns_found": ["Pattern 1 description", "Pattern 2"],
        "ai_likelihood": "medium"
    },
    "originality": {
        "score": 90,
        "concerns": ["Concern 1", "Concern 2"],
        "unique_elements": ["Unique element 1"]
    },
    "humanization": {
        "score": 75,
        "suggestions": ["Add personal anecdote in intro", "Use more varied sentence structures"],
        "strengths": ["Good conversational tone"]
    },
    "readability": {
        "grade_level": "10th grade",
        "avg_sentence_length": 18,
        "passive_voice_percent": 12
    },
    "recommendations": [
        "Top priority improvement 1",
        "Improvement 2",
        "Improvement 3"
    ]
}

Score ranges: 90-100 = Excellent, 70-89 = Good, 50-69 = Needs Work, <50 = High Risk.
Be honest and analytical.`;

        const result = await router.generate('content_optimization', prompt);



        let analysis;
        try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
            analysis = { raw: result };
        }

        return NextResponse.json({ analysis });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Analysis failed' },
            { status: 500 }
        );
    }
}
