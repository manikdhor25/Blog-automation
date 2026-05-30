// ============================================================
// RankMaster Pro - Keyword Density / TF-IDF API
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { analyzeKeywordDensity } from '@/lib/engines/keyword-density';
import { z } from 'zod';

const Schema = z.object({
    content: z.string().min(50).max(50000).optional(),
    post_id: z.string().uuid().optional(),
    primary_keyword: z.string().max(200),
    secondary_keywords: z.array(z.string()).max(10).optional(),
    title: z.string().max(500).optional(),
    headings: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { content, post_id, primary_keyword, secondary_keywords, title, headings } = parsed.data;

    let analysisContent = content || '';
    let analysisTitle = title || '';
    let analysisHeadings = headings || [];

    if (post_id && !analysisContent) {
        const { data: post } = await auth.supabase.from('posts').select('title, content_markdown, content_html').eq('id', post_id).eq('user_id', auth.user.id).single();
        if (post) {
            analysisContent = post.content_markdown || post.content_html?.replace(/<[^>]+>/g, ' ') || '';
            if (!analysisTitle) analysisTitle = post.title;

            // Extract headings from HTML
            const headingMatches = post.content_html?.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi) || [];
            analysisHeadings = headingMatches.map((h: string) => h.replace(/<[^>]+>/g, '').trim());
        }
    }

    if (!analysisContent) return NextResponse.json({ error: 'content or post_id required' }, { status: 400 });

    const report = analyzeKeywordDensity(analysisContent, primary_keyword, secondary_keywords, analysisTitle, analysisHeadings);

    return NextResponse.json({ report });
}
