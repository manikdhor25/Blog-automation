// ============================================================
// RankMaster Pro - Competitor Post Deep Analyzer API
// Paste URL → get headings, entities, schema, links, traffic est
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['analyze', 'compare', 'list', 'delete']),
    url: z.string().url().optional(),
    your_post_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

async function fetchAndParseUrl(url: string) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankMaster/1.0)' },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Extract headings
    const h1 = (html.match(/<h1[^>]*>(.*?)<\/h1>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').trim());
    const h2 = (html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').trim());
    const h3 = (html.match(/<h3[^>]*>(.*?)<\/h3>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').trim());

    // Extract JSON-LD schema
    const schemaMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    const schemas = schemaMatches.map(s => {
        try { return JSON.parse(s.replace(/<script[^>]*>|<\/script>/g, '').trim()); }
        catch { return null; }
    }).filter(Boolean);

    // Extract outbound links
    const linkMatches = html.matchAll(/href="(https?:\/\/[^"]+)"/g);
    const outboundLinks: string[] = [];
    for (const match of linkMatches) {
        const href = match[1];
        if (!href.includes(new URL(url).hostname)) outboundLinks.push(href);
    }

    // Word count from body text
    const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const wordCount = bodyText.split(/\s+/).length;

    // Title & meta
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || '';
    const metaDesc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1]?.trim() || '';

    // Images with alt text
    const images = (html.match(/<img[^>]+>/gi) || []).length;
    const imagesWithAlt = (html.match(/<img[^>]+alt="[^"]+"/gi) || []).length;

    // Check for key EEAT elements
    const hasSchema = schemas.length > 0;
    const hasFAQ = schemas.some((s: Record<string, unknown>) => s?.['@type'] === 'FAQPage') || /<h[1-6][^>]*>.*?faq.*?<\/h[1-6]>/i.test(html);
    const hasTable = /<table/i.test(html);
    const hasVideo = /<iframe[^>]+youtube/i.test(html) || /<video/i.test(html);

    return {
        title, meta_description: metaDesc, word_count: wordCount,
        headings: { h1, h2, h3 },
        schema_types: schemas.map((s: Record<string, unknown>) => s?.['@type']).filter(Boolean),
        outbound_links: outboundLinks.slice(0, 20),
        outbound_link_count: outboundLinks.length,
        image_count: images,
        images_with_alt: imagesWithAlt,
        has_faq: hasFAQ,
        has_table: hasTable,
        has_video: hasVideo,
        has_schema: hasSchema,
        internal_link_count: (html.match(new RegExp(`href="${new URL(url).hostname}`, 'g')) || []).length,
        body_text_excerpt: bodyText.substring(0, 2000),
    };
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'analyze') {
        const { url, your_post_id } = parsed.data;
        if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

        let pageData;
        try { pageData = await fetchAndParseUrl(url); }
        catch (err) { return NextResponse.json({ error: `Fetch failed: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 400 }); }

        // AI analysis
        const prompt = `Analyze this competitor page and provide actionable insights.

URL: ${url}
Title: ${pageData.title}
Word count: ${pageData.word_count}
H2 headings: ${pageData.headings.h2.slice(0, 10).join(', ')}
Schema types: ${pageData.schema_types.join(', ') || 'none'}
Has FAQ: ${pageData.has_faq}, Has table: ${pageData.has_table}, Has video: ${pageData.has_video}
Content excerpt: ${pageData.body_text_excerpt.substring(0, 800)}

Return ONLY valid JSON:
{
  "content_angle": "main angle/approach this post takes",
  "key_entities": ["entity 1", "entity 2", "entity 3", "entity 4", "entity 5"],
  "content_gaps": ["what this post is MISSING that you could cover to beat it"],
  "strengths": ["what makes this content rank well"],
  "weaknesses": ["specific weaknesses you can exploit"],
  "estimated_difficulty_to_beat": "easy|medium|hard|very_hard",
  "beat_strategy": "specific 2-3 sentence strategy to outrank this page",
  "missing_schema": ["schema types they should have but don't"],
  "word_count_recommendation": 2500,
  "sections_to_add": ["section idea 1", "section idea 2", "section idea 3"]
}`;

        const result = await routeAI({ task: 'competitor_analysis', prompt, systemPrompt: 'SEO competitor analyst. Specific, actionable. Return only JSON.', maxTokens: 1200, jsonMode: true });

        let aiAnalysis = {};
        if (result.success && result.content) {
            try { const m = result.content.match(/\{[\s\S]*\}/); aiAnalysis = JSON.parse(m?.[0] || result.content); }
            catch { /* skip */ }
        }

        const fullAnalysis = { ...pageData, ...aiAnalysis, url, analyzed_at: new Date().toISOString() };

        // Save
        const { data: saved } = await auth.supabase.from('competitor_analyses').insert({
            user_id: auth.user.id,
            url,
            your_post_id: your_post_id || null,
            title: pageData.title,
            word_count: pageData.word_count,
            analysis_data: fullAnalysis,
        }).select('id').single();

        return NextResponse.json({ analysis: fullAnalysis, id: saved?.id, provider: result.provider });
    }

    if (action === 'compare') {
        const { url, your_post_id } = parsed.data;
        if (!url || !your_post_id) return NextResponse.json({ error: 'url and your_post_id required' }, { status: 400 });

        const { data: yourPost } = await auth.supabase.from('posts').select('title, content_markdown, content_html, seo_score, overall_score').eq('id', your_post_id).single();
        let competitorData;
        try { competitorData = await fetchAndParseUrl(url); }
        catch (err) { return NextResponse.json({ error: `Fetch failed: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 400 }); }

        const yourWordCount = (yourPost?.content_markdown || '').split(/\s+/).length;

        return NextResponse.json({
            comparison: {
                word_count: { yours: yourWordCount, theirs: competitorData.word_count, winner: yourWordCount >= competitorData.word_count ? 'yours' : 'theirs' },
                h2_count: { yours: 0, theirs: competitorData.headings.h2.length },
                has_schema: { yours: false, theirs: competitorData.has_schema },
                has_faq: { yours: false, theirs: competitorData.has_faq },
                has_video: { yours: false, theirs: competitorData.has_video },
                seo_score: { yours: yourPost?.seo_score || 0, theirs: null },
            },
            their_h2s: competitorData.headings.h2,
            their_schema: competitorData.schema_types,
            your_title: yourPost?.title,
            their_title: competitorData.title,
        });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('competitor_analyses').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('competitor_analyses').select('id, url, title, word_count, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ analyses: data || [] });
}
