import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';
import { routeAI } from '@/lib/ai/router';

const ScanSchema = z.object({
    action: z.literal('scan'),
    site_id: z.string().uuid(),
    threshold: z.number().min(0.5).max(1.0).default(0.75),
});

function cosineSimilarity(a: string, b: string): number {
    const tokenize = (s: string) => s.toLowerCase().split(/\W+/).filter(Boolean);
    const wordsA = tokenize(a);
    const wordsB = tokenize(b);
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    const intersection = [...setA].filter(w => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
}

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    let q = supabase.from('duplicate_scan_results').select('*').eq('user_id', user.id).order('similarity_score', { ascending: false });
    if (siteId) q = q.eq('site_id', siteId);
    const { data } = await q.limit(50);
    return NextResponse.json({ results: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'scan') {
        const parsed = ScanSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: posts } = await supabase.from('posts')
            .select('id, title, primary_keyword, content, slug').eq('site_id', d.site_id);

        if (!posts || posts.length < 2) return NextResponse.json({ error: 'Need at least 2 posts to scan', results: [] }, { status: 400 });

        const duplicates = [];
        // Compare all pairs
        for (let i = 0; i < posts.length; i++) {
            for (let j = i + 1; j < posts.length; j++) {
                const pA = posts[i];
                const pB = posts[j];

                // Title similarity
                const titleSim = cosineSimilarity(pA.title, pB.title);
                // Keyword similarity
                const kwSim = pA.primary_keyword && pB.primary_keyword
                    ? cosineSimilarity(pA.primary_keyword, pB.primary_keyword) : 0;
                // Content similarity (first 500 chars)
                const contentSim = pA.content && pB.content
                    ? cosineSimilarity(pA.content.substring(0, 500), pB.content.substring(0, 500)) : 0;

                const overallScore = (titleSim * 0.3) + (kwSim * 0.4) + (contentSim * 0.3);

                if (overallScore >= d.threshold) {
                    duplicates.push({
                        post_a_id: pA.id, post_a_title: pA.title, post_a_slug: pA.slug,
                        post_b_id: pB.id, post_b_title: pB.title, post_b_slug: pB.slug,
                        similarity_score: Math.round(overallScore * 100) / 100,
                        title_similarity: Math.round(titleSim * 100) / 100,
                        keyword_similarity: Math.round(kwSim * 100) / 100,
                        content_similarity: Math.round(contentSim * 100) / 100,
                        recommendation: overallScore >= 0.9 ? 'merge' : overallScore >= 0.8 ? 'consolidate' : 'differentiate',
                    });
                }
            }
        }

        // AI recommendations for top duplicates
        if (duplicates.length > 0) {
            const topDupes = duplicates.slice(0, 5);
            for (const dupe of topDupes) {
                const aiPrompt = `Two blog posts appear to be near-duplicates. Recommend the best action.
Post A: "${dupe.post_a_title}"
Post B: "${dupe.post_b_title}"
Similarity: ${(dupe.similarity_score * 100).toFixed(0)}%

Return JSON: { "action": "merge"|"301_redirect"|"differentiate"|"keep_both", "reason": string, "which_to_keep": "a"|"b"|"new", "differentiation_angle": string }`;
                const { text } = await routeAI({ task: 'seo_analysis', prompt: aiPrompt, json: true });
                try {
                    const rec = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}');
                    (dupe as { ai_recommendation?: unknown }).ai_recommendation = rec;
                } catch { /* skip */ }

                await supabase.from('duplicate_scan_results').upsert({
                    user_id: user.id, site_id: d.site_id,
                    post_a_id: dupe.post_a_id, post_a_title: dupe.post_a_title,
                    post_b_id: dupe.post_b_id, post_b_title: dupe.post_b_title,
                    similarity_score: dupe.similarity_score, recommendation: dupe.recommendation,
                    ai_recommendation: (dupe as Record<string, unknown>).ai_recommendation || null, status: 'pending',
                }, { onConflict: 'user_id,post_a_id,post_b_id' });
            }
        }

        return NextResponse.json({ duplicates, scanned: posts.length, found: duplicates.length });
    }

    if (body.action === 'resolve') {
        await supabase.from('duplicate_scan_results').update({ status: body.status }).eq('id', body.result_id).eq('user_id', user.id);
        return NextResponse.json({ resolved: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
