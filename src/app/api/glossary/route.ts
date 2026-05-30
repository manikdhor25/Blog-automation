// ============================================================
// RankMaster Pro - Glossary / Topic Wiki Builder API
// Auto-generate niche glossary → schema → internal link injection
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['generate', 'save', 'publish_to_wp', 'inject_links', 'list', 'delete']),
    niche: z.string().max(200).optional(),
    term_count: z.number().int().min(10).max(100).default(30).optional(),
    site_id: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'generate') {
        const { niche, term_count = 30 } = parsed.data;
        if (!niche) return NextResponse.json({ error: 'niche required' }, { status: 400 });

        const prompt = `Create a comprehensive glossary for the "${niche}" niche with ${term_count} terms.

Each term should be something that:
1. Appears frequently in your blog posts
2. Readers might need defined
3. Can be linked from related posts

Return ONLY valid JSON:
{
  "glossary_title": "${niche} Glossary: Complete A-Z Guide",
  "glossary_intro": "2-3 sentence intro for the glossary page",
  "terms": [
    {
      "term": "term name",
      "slug": "term-name",
      "short_definition": "10-15 word plain-English definition",
      "full_definition": "2-3 paragraph detailed definition (200-300 words)",
      "example": "real-world example of how this term is used",
      "related_terms": ["term 1", "term 2"],
      "category": "category within the niche",
      "schema_definition": "crisp 1-sentence definition for schema markup"
    }
  ],
  "schema_markup_template": "JSON-LD DefinedTermSet schema as string"
}`;

        const result = await routeAI({ task: 'content_writing', prompt, systemPrompt: 'SEO glossary writer. Comprehensive, accessible, linkable. Return only JSON.', maxTokens: 4000, jsonMode: true });
        if (!result.success || !result.content) return NextResponse.json({ error: 'Generation failed' }, { status: 500 });

        try {
            const m = result.content.match(/\{[\s\S]*\}/);
            const glossary = JSON.parse(m?.[0] || result.content);

            const { data: saved } = await auth.supabase.from('glossaries').insert({
                user_id: auth.user.id,
                site_id: parsed.data.site_id || null,
                niche,
                title: glossary.glossary_title,
                term_count: glossary.terms?.length || 0,
                glossary_data: glossary,
            }).select('id').single();

            return NextResponse.json({ glossary, id: saved?.id, provider: result.provider });
        } catch { return NextResponse.json({ error: 'Parse failed' }, { status: 500 }); }
    }

    if (action === 'inject_links') {
        const { id, site_id } = parsed.data;
        if (!id || !site_id) return NextResponse.json({ error: 'id and site_id required' }, { status: 400 });

        const { data: glossary } = await auth.supabase.from('glossaries').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (!glossary) return NextResponse.json({ error: 'Glossary not found' }, { status: 404 });

        const terms = (glossary.glossary_data as { terms?: Array<{ term: string; slug: string }> })?.terms || [];
        const { data: site } = await auth.supabase.from('sites').select('url').eq('id', site_id).single();
        const glossaryUrl = `${site?.url?.replace(/\/$/, '')}/glossary/`;

        // Get all published posts
        const { data: posts } = await auth.supabase.from('posts').select('id, title, content_html').eq('site_id', site_id).eq('user_id', auth.user.id).eq('status', 'published').limit(50);

        let totalLinksInjected = 0;
        for (const post of posts || []) {
            let html = post.content_html || '';
            let modified = false;

            for (const term of terms.slice(0, 30)) {
                const termRegex = new RegExp(`\\b(${term.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b(?![^<]*>)`, 'gi');
                if (termRegex.test(html) && !html.includes(`href="${glossaryUrl}#${term.slug}"`)) {
                    // Only link first occurrence
                    html = html.replace(termRegex, `<a href="${glossaryUrl}#${term.slug}" title="${term.slug.replace(/-/g, ' ')}">${term.term}</a>`);
                    modified = true;
                    totalLinksInjected++;
                }
            }

            if (modified) {
                await auth.supabase.from('posts').update({ content_html: html, updated_at: new Date().toISOString() }).eq('id', post.id);
            }
        }

        return NextResponse.json({ links_injected: totalLinksInjected, posts_updated: (posts || []).length });
    }

    if (action === 'publish_to_wp') {
        const { id, site_id } = parsed.data;
        if (!id || !site_id) return NextResponse.json({ error: 'id and site_id required' }, { status: 400 });

        const [glossaryRes, siteRes] = await Promise.all([
            auth.supabase.from('glossaries').select('*').eq('id', id).single(),
            auth.supabase.from('sites').select('url, username, app_password_encrypted').eq('id', site_id).single(),
        ]);

        const glossary = glossaryRes.data;
        const site = siteRes.data;
        if (!glossary || !site) return NextResponse.json({ error: 'Glossary or site not found' }, { status: 404 });

        const terms = (glossary.glossary_data as { terms?: Array<{ term: string; slug: string; full_definition: string; example: string; schema_definition: string }> })?.terms || [];

        // Build HTML content
        const glossaryHtml = `<h2>Quick Navigation</h2>
${[...new Set(terms.map(t => t.term[0].toUpperCase()))].sort().map(letter =>
    `<a href="#${letter}">${letter}</a>`
).join(' | ')}

${terms.sort((a, b) => a.term.localeCompare(b.term)).map(term => `
<h3 id="${term.slug}"><dfn>${term.term}</dfn></h3>
<p>${term.full_definition}</p>
${term.example ? `<p><strong>Example:</strong> ${term.example}</p>` : ''}
`).join('\n')}

<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    'name': glossary.title,
    'hasDefinedTerm': terms.map(t => ({
        '@type': 'DefinedTerm',
        'name': t.term,
        'description': t.schema_definition,
    })),
})}
</script>`;

        const credentials = Buffer.from(`${site.username}:${site.app_password_encrypted}`).toString('base64');
        const res = await fetch(`${site.url.replace(/\/$/, '')}/wp-json/wp/v2/pages`, {
            method: 'POST',
            headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: { raw: glossary.title }, content: { raw: glossaryHtml }, status: 'draft', slug: 'glossary' }),
            signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
            const data = await res.json();
            return NextResponse.json({ success: true, wp_page_id: data.id, edit_url: `${site.url}/wp-admin/post.php?post=${data.id}&action=edit` });
        }
        return NextResponse.json({ error: 'WordPress publish failed' }, { status: 500 });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('glossaries').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase.from('glossaries').select('id, niche, title, term_count, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ glossaries: data || [] });
}
