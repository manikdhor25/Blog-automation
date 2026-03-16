import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAIRouter } from '@/lib/ai/router';

// POST /api/briefs — Generate a content brief for a keyword
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const rateLimited = checkRateLimit(auth.user.id, '/api/briefs', { maxRequests: 15, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const { keyword, site_id, target_audience, tone, word_count_target } = body;

        if (!keyword) {
            return NextResponse.json({ error: 'keyword required' }, { status: 400 });
        }

        let siteName = '';
        if (site_id) {
            const { data: site } = await auth.supabase.from('sites').select('name, url').eq('id', site_id).single();
            siteName = site ? `${site.name} (${site.url})` : '';
        }

        let existingPosts: string[] = [];
        if (site_id) {
            const { data: posts } = await auth.supabase
                .from('posts')
                .select('title, keyword')
                .eq('site_id', site_id)
                .limit(30);
            existingPosts = (posts || []).map(p => `"${p.title}" [${p.keyword}]`);
        }

        const prompt = `You are an expert SEO content strategist. Generate a comprehensive content brief for a writer.

Target Keyword: ${keyword}
${siteName ? `Website: ${siteName}` : ''}
${target_audience ? `Target Audience: ${target_audience}` : ''}
${tone ? `Tone: ${tone}` : 'Tone: Professional, informative'}
${word_count_target ? `Target Word Count: ${word_count_target}` : 'Target Word Count: 2000-3000'}
${existingPosts.length > 0 ? `\nExisting content (avoid overlap):\n${existingPosts.slice(0, 15).join('\n')}` : ''}

Respond in valid JSON:
{
    "title_suggestions": ["Title 1", "Title 2", "Title 3"],
    "meta_description": "SEO meta description (150-160 chars)",
    "search_intent": "informational|transactional|navigational|commercial",
    "target_audience": "Description of target reader",
    "outline": [
        {"heading": "H2 heading", "subheadings": ["H3 sub 1", "H3 sub 2"], "key_points": ["point 1", "point 2"], "suggested_word_count": 300}
    ],
    "keywords": {
        "primary": "${keyword}",
        "secondary": ["kw1", "kw2"],
        "lsi": ["related term 1", "related term 2"],
        "questions": ["People Also Ask question 1", "question 2"]
    },
    "competitor_angles": ["What competitors cover", "Gap opportunity"],
    "internal_link_opportunities": ["Topic to link to"],
    "schema_type": "BlogPosting|HowTo|FAQ|ListArticle",
    "tone_guidelines": "Specific tone instructions",
    "cta_suggestions": ["CTA idea 1", "CTA idea 2"],
    "unique_angle": "What makes this piece different"
}`;

        const router = getAIRouter();
        await router.loadKeys();
        const result = await router.generate('content_writing', prompt);

        let brief;
        try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            brief = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
            brief = { raw: result };
        }

        return NextResponse.json({ brief, keyword });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Brief generation failed' },
            { status: 500 }
        );
    }
}
