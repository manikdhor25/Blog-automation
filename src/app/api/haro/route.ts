// ============================================================
// RankMaster Pro - HARO / Connectively Automation API
// Fetch journalist queries → AI-match expertise → draft response
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['fetch_queries', 'generate_pitch', 'save_response', 'list', 'mark_sent', 'mark_placed']),
    niche: z.string().max(200).optional(),
    expertise: z.string().max(1000).optional(),
    your_name: z.string().max(200).optional(),
    your_credentials: z.string().max(500).optional(),
    your_website: z.string().max(500).optional(),
    query_id: z.string().uuid().optional(),
    query_text: z.string().max(3000).optional(),
    query_category: z.string().max(100).optional(),
    journalist_email: z.string().email().optional(),
    publication: z.string().max(200).optional(),
    deadline: z.string().optional(),
    id: z.string().uuid().optional(),
});

// Simulated HARO query sources (real implementation would parse HARO emails)
const SAMPLE_QUERIES = [
    { category: 'business', text: 'Looking for financial advisors or affiliate marketers who can speak to strategies for earning passive income online. Need responses by end of day.', publication: 'Forbes', deadline_hours: 24 },
    { category: 'technology', text: 'Seeking SEO experts who have successfully ranked blog posts in competitive niches. What\'s your most effective strategy? Include revenue results.', publication: 'Inc.', deadline_hours: 48 },
    { category: 'personal finance', text: 'Looking for bloggers who earn $5K+ per month from affiliate marketing. Share your story and top earning category.', publication: 'Business Insider', deadline_hours: 72 },
    { category: 'lifestyle', text: 'Seeking content creators who use AI tools to grow their blog traffic. What tools do you use and what were the results?', publication: 'Entrepreneur', deadline_hours: 36 },
    { category: 'marketing', text: 'Need experts to comment on email marketing conversion rates for content businesses. Include specific percentages.', publication: 'HubSpot Blog', deadline_hours: 24 },
];

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'fetch_queries') {
        const { niche } = parsed.data;

        // In production: parse HARO digest emails from configured email
        // For now: return AI-generated relevant queries based on niche
        const prompt = `Generate 10 realistic HARO (Help A Reporter Out) journalist queries that a ${niche || 'affiliate blogger'} expert could answer.

These should be genuine-sounding journalist requests from major publications like Forbes, Inc., Entrepreneur, Business Insider, etc.

Return ONLY valid JSON array:
[
  {
    "category": "business|finance|technology|lifestyle|marketing|health",
    "text": "journalist's question/request text (2-4 sentences)",
    "publication": "Forbes|Inc|Entrepreneur|etc",
    "deadline_hours": 24,
    "relevance_score": 85,
    "link_potential": "high|medium|low",
    "domain_authority_estimate": 90
  }
]`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'HARO expert. Realistic journalist queries. Return only JSON array.', maxTokens: 2000, jsonMode: true });

        let queries = SAMPLE_QUERIES.map((q, i) => ({ id: `sample-${i}`, ...q, relevance_score: 75, link_potential: 'high', domain_authority_estimate: 85 }));

        if (result.success && result.content) {
            try {
                const m = result.content.match(/\[[\s\S]*\]/);
                const aiQueries = JSON.parse(m?.[0] || '[]');
                queries = aiQueries;
            } catch { /* use samples */ }
        }

        // Save to DB
        if (queries.length > 0) {
            await auth.supabase.from('haro_queries').insert(
                queries.map((q: { category: string; text: string; publication: string; deadline_hours?: number; relevance_score?: number; link_potential?: string; domain_authority_estimate?: number }) => ({
                    user_id: auth.user.id,
                    category: q.category,
                    query_text: q.text,
                    publication: q.publication,
                    deadline_hours: q.deadline_hours || 48,
                    relevance_score: q.relevance_score || 70,
                    link_potential: q.link_potential || 'medium',
                    da_estimate: q.domain_authority_estimate || 70,
                    status: 'new',
                }))
            );
        }

        return NextResponse.json({ queries, count: queries.length, provider: result.provider });
    }

    if (action === 'generate_pitch') {
        const { query_id, query_text, query_category, your_name, your_credentials, your_website, expertise, publication } = parsed.data;
        if (!query_text) return NextResponse.json({ error: 'query_text required' }, { status: 400 });

        const prompt = `Write a HARO pitch response that will get published and earn a backlink.

Journalist query: "${query_text}"
Publication: ${publication || 'Unknown publication'}
Category: ${query_category || 'general'}

Expert details:
Name: ${your_name || 'Your Name'}
Credentials: ${your_credentials || 'Blogger & Affiliate Marketer'}
Website: ${your_website || 'yoursite.com'}
Expertise: ${expertise || 'Content marketing, SEO, affiliate marketing'}

HARO pitch rules:
1. First 2 sentences must immediately answer the question with specific data
2. Include ONE specific statistic or concrete example
3. 150-250 words total — journalists ignore long pitches
4. End with bio (1 sentence, name + title + website)
5. No "I hope this helps" or filler
6. Never start with "I"

Return ONLY valid JSON:
{
  "subject_line": "compelling email subject for journalist",
  "pitch": "full pitch email body",
  "key_quote": "the 1-2 sentence pull quote most likely to be used",
  "bio": "one-sentence bio with name, credentials, website",
  "word_count": 180,
  "confidence_score": 78
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'HARO pitch expert. Gets published in major outlets. Specific, concise. Return only JSON.', maxTokens: 800, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            const pitch = JSON.parse(m?.[0] || result.content);

            // Update query status if query_id provided
            if (query_id) {
                await auth.supabase.from('haro_queries').update({ generated_pitch: pitch, status: 'drafted' }).eq('id', query_id).eq('user_id', auth.user.id);
            }

            return NextResponse.json({ pitch, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'mark_sent') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('haro_queries').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    if (action === 'mark_placed') {
        const { id, your_website } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('haro_queries').update({ status: 'placed', placed_at: new Date().toISOString(), link_url: your_website || null }).eq('id', id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const status = new URL(request.url).searchParams.get('status') || 'new';
    let query = auth.supabase.from('haro_queries').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (status !== 'all') query = query.eq('status', status);

    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const all = await auth.supabase.from('haro_queries').select('status').eq('user_id', auth.user.id);
    const stats = { new: 0, drafted: 0, sent: 0, placed: 0 };
    for (const q of all.data || []) stats[q.status as keyof typeof stats] = (stats[q.status as keyof typeof stats] || 0) + 1;

    return NextResponse.json({ queries: data || [], stats });
}
