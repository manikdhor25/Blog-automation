import { NextRequest, NextResponse } from 'next/server';
import { getAIRouter } from '@/lib/ai/router';
import { getAuthUser } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';

// POST /api/theme-scanner — Analyze WordPress theme for SEO issues
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const rateLimited = checkRateLimit(auth.user.id, '/api/theme-scanner', { maxRequests: 10, windowMs: 60_000 });
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const { site_url } = body;

        if (!site_url) {
            return NextResponse.json({ error: 'site_url required' }, { status: 400 });
        }

        // Fetch the homepage HTML
        let html = '';
        try {
            const res = await fetch(site_url, {
                headers: { 'User-Agent': 'RankMasterPro/1.0 SEO-Scanner' },
            });
            html = await res.text();
        } catch {
            return NextResponse.json({ error: 'Could not fetch site. Check URL and try again.' }, { status: 400 });
        }

        // Extract key SEO elements
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i);
        const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["'](.*?)["']/i);
        const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
        const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
        const imgCount = (html.match(/<img[\s>]/gi) || []).length;
        const imgNoAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
        const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
        const hasRobots = /<meta[^>]*name=["']robots["']/i.test(html);
        const hasOG = /<meta[^>]*property=["']og:/i.test(html);
        const hasTwitterCard = /<meta[^>]*name=["']twitter:/i.test(html);
        const hasSchema = /application\/ld\+json/i.test(html);
        const hasGTM = /googletagmanager\.com/i.test(html);
        const hasGA = /google-analytics\.com|gtag/i.test(html);
        const hasSitemap = /sitemap/i.test(html);
        const scriptCount = (html.match(/<script[\s>]/gi) || []).length;
        const cssCount = (html.match(/<link[^>]*stylesheet/gi) || []).length;

        // Build issues list
        const issues: Array<{ severity: 'critical' | 'warning' | 'info'; category: string; message: string }> = [];

        if (!titleMatch || !titleMatch[1]) issues.push({ severity: 'critical', category: 'Meta', message: 'Missing <title> tag' });
        else if (titleMatch[1].length > 60) issues.push({ severity: 'warning', category: 'Meta', message: `Title too long (${titleMatch[1].length} chars, target: ≤60)` });

        if (!metaDesc) issues.push({ severity: 'critical', category: 'Meta', message: 'Missing meta description' });
        if (!canonicalMatch) issues.push({ severity: 'warning', category: 'Meta', message: 'Missing canonical URL' });
        if (h1Count === 0) issues.push({ severity: 'critical', category: 'Headings', message: 'No H1 tag found' });
        if (h1Count > 1) issues.push({ severity: 'warning', category: 'Headings', message: `Multiple H1 tags found (${h1Count})` });
        if (h2Count === 0) issues.push({ severity: 'warning', category: 'Headings', message: 'No H2 tags found' });
        if (imgNoAlt > 0) issues.push({ severity: 'warning', category: 'Images', message: `${imgNoAlt} of ${imgCount} images missing alt text` });
        if (!hasViewport) issues.push({ severity: 'critical', category: 'Mobile', message: 'Missing viewport meta tag (not mobile-friendly)' });
        if (!hasRobots) issues.push({ severity: 'info', category: 'Meta', message: 'No robots meta tag (defaults to index/follow)' });
        if (!hasOG) issues.push({ severity: 'warning', category: 'Social', message: 'Missing Open Graph tags' });
        if (!hasTwitterCard) issues.push({ severity: 'info', category: 'Social', message: 'Missing Twitter Card tags' });
        if (!hasSchema) issues.push({ severity: 'warning', category: 'Schema', message: 'No JSON-LD structured data found' });
        if (scriptCount > 15) issues.push({ severity: 'warning', category: 'Performance', message: `${scriptCount} scripts loaded — may slow page` });
        if (cssCount > 8) issues.push({ severity: 'info', category: 'Performance', message: `${cssCount} CSS files loaded` });

        // Calculate score
        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;
        const score = Math.max(0, 100 - (criticalCount * 15) - (warningCount * 5));

        return NextResponse.json({
            url: site_url,
            score,
            issues,
            summary: {
                critical: criticalCount,
                warnings: warningCount,
                info: issues.filter(i => i.severity === 'info').length,
            },
            seo_elements: {
                title: titleMatch?.[1] || null,
                meta_description: metaDesc?.[1] || null,
                canonical: canonicalMatch?.[1] || null,
                h1_count: h1Count,
                h2_count: h2Count,
                images: { total: imgCount, missing_alt: imgNoAlt },
                mobile_friendly: hasViewport,
                has_schema: hasSchema,
                has_og: hasOG,
                has_twitter: hasTwitterCard,
                has_analytics: hasGA || hasGTM,
                scripts: scriptCount,
                stylesheets: cssCount,
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Scan failed' },
            { status: 500 }
        );
    }
}
