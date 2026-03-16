// ============================================================
// RankMaster Pro - Multi-Site Content Syndication API
// Repurpose content across sites with AI uniqueness rewriting
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';
import { getAIRouter } from '@/lib/ai/router';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';

// GET /api/syndication - List syndicated content (authenticated)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const postId = searchParams.get('post_id');
        const siteId = searchParams.get('site_id');

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        let query = auth.supabase.from('syndications').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });

        if (postId) query = query.eq('source_post_id', postId);
        if (siteId) query = query.eq('target_site_id', siteId);

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json({ syndications: data || [] });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch syndications' },
            { status: 500 }
        );
    }
}

// POST /api/syndication - Syndicate content to another site
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const rateLimited = checkRateLimit(auth.user.id, '/api/syndication', { maxRequests: 10, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        // Rewrite content for uniqueness
        if (action === 'rewrite') {
            const { content, target_niche, target_audience } = body;
            if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

            const ai = getAIRouter();
            const prompt = `Rewrite the following content to be unique for a ${target_niche || 'general'} audience (${target_audience || 'general readers'}).

Requirements:
- Maintain the same key points and facts
- Change sentence structure and word choice significantly (aim for <20% overlap)
- Adapt tone and examples for the target audience
- Keep the same H2/H3 heading structure but rephrase headings
- Preserve any data/statistics but cite differently
- Do NOT add or remove major sections

Original content:
${content.substring(0, 8000)}

Return the rewritten HTML content only, no explanation.`;

            const result = await ai.generate('content_writing', prompt, {
                systemPrompt: 'You are an expert content rewriter. Produce unique, high-quality content that avoids duplicate content penalties.',
                temperature: 0.7,
            });

            return NextResponse.json({ rewritten_content: result, source: 'ai' });
        }

        // Syndicate to target site
        if (action === 'syndicate') {
            const { source_post_id, target_site_id, content, title, canonical_url } = body;
            if (!source_post_id || !target_site_id || !content) {
                return NextResponse.json({ error: 'source_post_id, target_site_id, and content required' }, { status: 400 });
            }

            // Get target site for WP publishing
            const { data: targetSite } = await auth.supabase.from('sites').select('*').eq('id', target_site_id).single();
            if (!targetSite) return NextResponse.json({ error: 'Target site not found' }, { status: 404 });

            let wpPostId: number | null = null;
            let wpUrl: string | null = null;

            // Publish to WordPress if credentials available
            if (targetSite.wp_username && targetSite.wp_app_password) {
                try {
                    const wpApiUrl = `${targetSite.url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
                    const auth = Buffer.from(`${targetSite.wp_username}:${targetSite.wp_app_password}`).toString('base64');

                    const wpRes = await fetch(wpApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
                        body: JSON.stringify({
                            title: title || 'Syndicated Post',
                            content,
                            status: 'draft', // Syndicated content starts as draft
                            meta: {
                                _yoast_wpseo_canonical: canonical_url || '',
                            },
                        }),
                    });

                    if (wpRes.ok) {
                        const wpData = await wpRes.json();
                        wpPostId = wpData.id;
                        wpUrl = wpData.link;
                    }
                } catch (wpErr) {
                    console.warn('[Syndication] WordPress publish failed:', wpErr);
                }
            }

            // Save syndication record
            const { data, error } = await auth.supabase
                .from('syndications')
                .insert({
                    user_id: auth.user.id,
                    source_post_id,
                    target_site_id,
                    title: title || 'Syndicated Post',
                    content,
                    canonical_url: canonical_url || null,
                    wp_post_id: wpPostId,
                    wp_url: wpUrl,
                    status: wpPostId ? 'published_draft' : 'pending',
                    uniqueness_score: 0, // Calculated later
                })
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json({ syndication: data });
        }

        // Check uniqueness between original and rewritten
        if (action === 'check_uniqueness') {
            const { original, rewritten } = body;
            if (!original || !rewritten) {
                return NextResponse.json({ error: 'original and rewritten required' }, { status: 400 });
            }

            // Simple word overlap check
            const origWords = new Set(original.toLowerCase().replace(/<[^>]+>/g, ' ').match(/\b\w{4,}\b/g) || []);
            const rewriteWords = new Set(rewritten.toLowerCase().replace(/<[^>]+>/g, ' ').match(/\b\w{4,}\b/g) || []);

            let overlap = 0;
            for (const word of rewriteWords) {
                if (origWords.has(word)) overlap++;
            }

            const overlapRatio = rewriteWords.size > 0 ? overlap / rewriteWords.size : 1;
            const uniqueness = Math.round((1 - overlapRatio) * 100);

            return NextResponse.json({
                uniqueness_score: uniqueness,
                overlap_ratio: (overlapRatio * 100).toFixed(1),
                verdict: uniqueness >= 70 ? 'Good - Low duplicate risk' :
                    uniqueness >= 50 ? 'Moderate - Consider more rewriting' :
                        'High risk - Significant overlap detected',
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process syndication' },
            { status: 500 }
        );
    }
}
