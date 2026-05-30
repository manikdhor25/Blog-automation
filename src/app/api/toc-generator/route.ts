import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const GenerateSchema = z.object({
    action: z.literal('generate'),
    content: z.string().min(100),
    post_id: z.string().uuid().optional(),
    style: z.enum(['numbered', 'bullets', 'links']).default('links'),
    max_depth: z.enum(['h2', 'h3', 'h4']).default('h3'),
    inject_to_post: z.boolean().default(false),
});

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function extractHeadings(content: string, maxDepth: string): Array<{ level: number; text: string; id: string }> {
    const maxLevel = maxDepth === 'h2' ? 2 : maxDepth === 'h3' ? 3 : 4;
    const headings: Array<{ level: number; text: string; id: string }> = [];

    // HTML headings
    const htmlRegex = /<h([2-6])[^>]*>(.*?)<\/h\1>/gi;
    let match;
    while ((match = htmlRegex.exec(content)) !== null) {
        const level = parseInt(match[1]);
        if (level <= maxLevel) {
            const text = match[2].replace(/<[^>]+>/g, '').trim();
            headings.push({ level, text, id: slugify(text) });
        }
    }

    // Markdown headings if no HTML
    if (headings.length === 0) {
        const mdRegex = /^(#{2,4})\s+(.+)$/gm;
        while ((match = mdRegex.exec(content)) !== null) {
            const level = match[1].length;
            if (level <= maxLevel) {
                const text = match[2].trim();
                headings.push({ level, text, id: slugify(text) });
            }
        }
    }

    return headings;
}

function generateTocHtml(headings: Array<{ level: number; text: string; id: string }>, style: string): string {
    if (!headings.length) return '';

    const items = headings.map((h, i) => {
        const indent = (h.level - 2) * 20;
        const num = style === 'numbered' ? `${i + 1}. ` : style === 'bullets' ? 'â€¢ ' : '';
        const link = style === 'links' ? `<a href="#${h.id}">${h.text}</a>` : h.text;
        return `<li style="margin-left:${indent}px">${num}${link}</li>`;
    }).join('\n');

    return `<nav class="table-of-contents" aria-label="Table of Contents">
<div class="toc-title"><strong>Table of Contents</strong></div>
<ol class="toc-list">
${items}
</ol>
</nav>`;
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'generate') {
        const parsed = GenerateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const headings = extractHeadings(d.content, d.max_depth);
        if (!headings.length) return NextResponse.json({ error: 'No headings found in content', headings: [] }, { status: 400 });

        // Add IDs to heading elements in content
        let contentWithIds = d.content;
        for (const h of headings) {
            const regex = new RegExp(`(<h${h.level})(\\s[^>]*)?>`, 'i');
            contentWithIds = contentWithIds.replace(regex, `$1 id="${h.id}">`);
        }

        const tocHtml = generateTocHtml(headings, d.style);

        // Inject after first paragraph if requested
        if (d.inject_to_post && d.post_id) {
            const insertedContent = contentWithIds.replace(/(<\/p>)/, `$1\n${tocHtml}`);
            await supabase.from('posts').update({ content: insertedContent }).eq('id', d.post_id).eq('user_id', user.id);
        }

        return NextResponse.json({ headings, toc_html: tocHtml, content_with_ids: contentWithIds, heading_count: headings.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
