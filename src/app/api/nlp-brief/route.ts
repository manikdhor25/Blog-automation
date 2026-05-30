// ============================================================
// RankMaster Pro - Advanced NLP Content Brief API
// Entity extraction from SERP → semantic coverage map → brief
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['generate', 'list', 'delete', 'export']),
    keyword: z.string().max(200).optional(),
    niche: z.string().max(200).optional(),
    competitor_urls: z.array(z.string().url()).max(5).optional(),
    target_word_count: z.number().int().min(500).max(10000).default(2000).optional(),
    content_type: z.enum(['review', 'comparison', 'how_to', 'listicle', 'guide', 'news']).optional(),
    site_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

async function scrapeCompetitorContent(url: string): Promise<{ title: string; text: string; headings: string[] }> {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankMaster/1.0)' }, signal: AbortSignal.timeout(10000) });
        const html = await res.text();
        const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || '';
        const headings = (html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').trim());
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000);
        return { title, text, headings };
    } catch { return { title: url, text: '', headings: [] }; }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const { keyword, niche, competitor_urls, target_word_count = 2000, content_type } = parsed.data;
        if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 });

        // Scrape competitor content for entity analysis
        let competitorData: Array<{ title: string; text: string; headings: string[] }> = [];
        if (competitor_urls?.length) {
            competitorData = await Promise.all(competitor_urls.slice(0, 3).map(scrapeCompetitorContent));
        }

        const competitorContext = competitorData.map((c, i) =>
            `Competitor ${i + 1}: "${c.title}"\nHeadings: ${c.headings.slice(0, 8).join(' | ')}\nContent: ${c.text.substring(0, 800)}`
        ).join('\n\n');

        const prompt = `Create an advanced NLP-optimized content brief for "${keyword}" in the ${niche || 'general'} niche.

${competitorContext ? `Competitor analysis:\n${competitorContext}` : ''}

Content type: ${content_type || 'guide'}
Target word count: ${target_word_count}

Generate a comprehensive brief that goes beyond basic SEO to include NLP entity coverage requirements.

Return ONLY valid JSON:
{
  "title_options": ["H1 option 1", "H1 option 2", "H1 option 3"],
  "meta_title": "SEO meta title (55-60 chars)",
  "meta_description": "meta description (145-155 chars)",
  "target_word_count": ${target_word_count},
  "reading_grade_level": 8,
  "search_intent": "informational|commercial|transactional",
  "target_audience": "specific audience description",
  "required_entities": [
    {
      "entity": "entity name",
      "type": "PRODUCT|BRAND|PERSON|CONCEPT|PROCESS|TOOL",
      "importance": "must_include|should_include|optional",
      "context": "how to naturally mention this entity"
    }
  ],
  "semantic_keywords": ["term 1", "term 2", "term 3"],
  "h2_structure": [
    {
      "heading": "H2 heading text",
      "type": "intro|main|comparison|faq|conclusion",
      "word_count": 300,
      "required_entities": ["entity 1"],
      "content_notes": "what to cover in this section"
    }
  ],
  "competitor_gaps": ["topic competitor misses that you should cover"],
  "paa_questions": ["people also ask question 1", "question 2"],
  "schema_types": ["Article", "FAQPage"],
  "internal_link_targets": ["anchor text → post title"],
  "cta_placement": "where to place CTA and what to say",
  "unique_angle": "what makes YOUR post different from all others",
  "content_quality_checklist": ["check 1", "check 2"]
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'NLP content brief specialist. Surfer SEO-level depth. Return only JSON.', maxTokens: 3000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            const brief = JSON.parse(m?.[0] || result.content);

            await auth.supabase.from('nlp_briefs').insert({
                user_id: auth.user.id,
                site_id: parsed.data.site_id || null,
                keyword,
                niche: niche || '',
                content_type: content_type || 'guide',
                brief_data: brief,
                entity_count: brief.required_entities?.length || 0,
                word_count_target: target_word_count,
            });

            return NextResponse.json({ brief, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'export') {
        const { id } = parsed.data;
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { data } = await auth.supabase.from('nlp_briefs').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!data) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

        const brief = data.brief_data as Record<string, unknown>;
        const entities = (brief.required_entities as Array<{ entity: string; importance: string; context: string }> || []);
        const h2s = (brief.h2_structure as Array<{ heading: string; word_count: number; content_notes: string }> || []);

        const markdown = `# Content Brief: ${data.keyword}

## Meta
- **Meta Title:** ${brief.meta_title}
- **Meta Description:** ${brief.meta_description}
- **Word Count:** ${data.word_count_target}
- **Search Intent:** ${brief.search_intent}
- **Unique Angle:** ${brief.unique_angle}

## H1 Options
${(brief.title_options as string[] || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}

## Article Structure
${h2s.map(h => `### ${h.heading}\n- Words: ~${h.word_count}\n- Notes: ${h.content_notes}`).join('\n\n')}

## Required NLP Entities (${entities.length} total)
${entities.filter(e => e.importance === 'must_include').map(e => `- **[MUST]** ${e.entity} — ${e.context}`).join('\n')}
${entities.filter(e => e.importance === 'should_include').map(e => `- [SHOULD] ${e.entity} — ${e.context}`).join('\n')}

## Semantic Keywords
${(brief.semantic_keywords as string[] || []).join(', ')}

## PAA Questions to Answer
${(brief.paa_questions as string[] || []).map(q => `- ${q}`).join('\n')}

## Competitor Gaps (cover these)
${(brief.competitor_gaps as string[] || []).map(g => `- ${g}`).join('\n')}`;

        return NextResponse.json({ markdown, keyword: data.keyword });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('nlp_briefs').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('nlp_briefs').select('id, keyword, niche, content_type, entity_count, word_count_target, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ briefs: data || [] });
}
