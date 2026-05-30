// ============================================================
// RankMaster Pro - Duplicate Title Detector API
// Find posts with duplicate or near-duplicate meta titles
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

function normalizeTitle(t: string): string {
    return t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string): number {
    const na = normalizeTitle(a), nb = normalizeTitle(b);
    if (na === nb) return 1;
    const wordsA = new Set(na.split(' '));
    const wordsB = new Set(nb.split(' '));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return intersection / union;
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const threshold = parseFloat(searchParams.get('threshold') || '0.85');

    let query = auth.supabase.from('posts').select('id, title, meta_title, slug, site_id, overall_score').eq('user_id', auth.user.id);
    if (siteId) query = query.eq('site_id', siteId);
    const { data: posts, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const duplicateGroups: Array<{
        type: string;
        posts: Array<{ id: string; title: string; meta_title: string; slug: string; score: number }>;
        similarity: number;
    }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < (posts || []).length; i++) {
        for (let j = i + 1; j < (posts || []).length; j++) {
            const a = posts![i], b = posts![j];
            const pairKey = [a.id, b.id].sort().join('-');
            if (seen.has(pairKey)) continue;

            const titleSim = similarity(a.title, b.title);
            const metaSim = a.meta_title && b.meta_title ? similarity(a.meta_title, b.meta_title) : 0;

            if (titleSim >= threshold || metaSim >= threshold) {
                seen.add(pairKey);
                duplicateGroups.push({
                    type: titleSim >= threshold ? 'title' : 'meta_title',
                    similarity: Math.max(titleSim, metaSim),
                    posts: [
                        { id: a.id, title: a.title, meta_title: a.meta_title || '', slug: a.slug, score: a.overall_score || 0 },
                        { id: b.id, title: b.title, meta_title: b.meta_title || '', slug: b.slug, score: b.overall_score || 0 },
                    ],
                });
            }
        }
    }

    duplicateGroups.sort((a, b) => b.similarity - a.similarity);

    // Also detect exact duplicates
    const titleMap = new Map<string, typeof posts>();
    for (const post of posts || []) {
        const norm = normalizeTitle(post.title);
        if (!titleMap.has(norm)) titleMap.set(norm, []);
        titleMap.get(norm)!.push(post);
    }
    const exactDuplicates = [...titleMap.values()].filter(g => g.length > 1);

    return NextResponse.json({
        duplicate_groups: duplicateGroups.slice(0, 50),
        exact_duplicates: exactDuplicates.map(g => g.map(p => ({ id: p.id, title: p.title, slug: p.slug }))),
        summary: {
            total_posts: (posts || []).length,
            near_duplicate_pairs: duplicateGroups.length,
            exact_duplicate_groups: exactDuplicates.length,
            affected_posts: new Set(duplicateGroups.flatMap(g => g.posts.map(p => p.id))).size,
        },
    });
}
