// ============================================================
// RankMaster Pro - Disclosure Audit API
// Scan all posts for missing FTC affiliate disclosures
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

const DISCLOSURE_PATTERNS = [
    /affiliate\s+disclosure/i,
    /affiliate\s+link/i,
    /we\s+may\s+earn/i,
    /commission(?:\s+if|\s+when|\s+for)/i,
    /paid\s+partnership/i,
    /sponsored\s+(?:post|content|by)/i,
    /\bsponsored\b/i,
    /disclosure:/i,
    /affiliate-disclosure/i,
    /#ad\b/i,
    /\bad\s+disclosure/i,
];

const AFFILIATE_LINK_PATTERNS = [
    /amazon\.[a-z.]+\/[^\s"']*tag=/i,
    /amzn\.to\//i,
    /shareasale\.com/i,
    /\/go\//,
    /affiliate/i,
    /ref=.*aff/i,
];

function hasDisclosure(content: string): boolean {
    return DISCLOSURE_PATTERNS.some(p => p.test(content));
}

function hasAffiliateLinks(content: string): boolean {
    return AFFILIATE_LINK_PATTERNS.some(p => p.test(content));
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');

    let query = auth.supabase.from('posts').select('id, title, slug, content_html, content_markdown, site_id').eq('user_id', auth.user.id).eq('status', 'published');
    if (siteId) query = query.eq('site_id', siteId);
    const { data: posts, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = (posts || []).map(post => {
        const content = post.content_markdown || post.content_html?.replace(/<[^>]+>/g, ' ') || '';
        const hasAff = hasAffiliateLinks(content);
        const hasDisc = hasDisclosure(content);

        return {
            post_id: post.id,
            title: post.title,
            slug: post.slug,
            site_id: post.site_id,
            has_affiliate_links: hasAff,
            has_disclosure: hasDisc,
            needs_disclosure: hasAff && !hasDisc,
            status: hasAff && !hasDisc ? 'missing' : hasAff && hasDisc ? 'compliant' : 'no_affiliate',
        };
    });

    const missing = results.filter(r => r.needs_disclosure);
    const compliant = results.filter(r => r.status === 'compliant');

    return NextResponse.json({
        results,
        summary: {
            total_posts: results.length,
            missing_disclosure: missing.length,
            compliant: compliant.length,
            no_affiliate_links: results.filter(r => r.status === 'no_affiliate').length,
            compliance_rate: results.length > 0 ? Math.round((compliant.length / Math.max(compliant.length + missing.length, 1)) * 100) : 100,
        },
        missing_posts: missing.slice(0, 50),
    });
}
