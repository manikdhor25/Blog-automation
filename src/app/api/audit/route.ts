// ============================================================
// RankMaster Pro - Technical SEO Audit API Route
// Crawls WordPress site and checks for SEO issues
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getAuthUser } from '@/lib/auth-guard';

interface AuditIssue {
    type: 'error' | 'warning' | 'info';
    category: string;
    message: string;
    url?: string;
    details?: string;
}

// POST /api/audit - Run SEO audit on a site (authenticated)
export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const body = await request.json();
        const { site_id } = body;

        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        // Verify site ownership
        const { data: site } = await auth.supabase.from('sites').select('*').eq('id', site_id).eq('user_id', auth.user.id).single();
        if (!site) return NextResponse.json({ error: 'Site not found or access denied' }, { status: 404 });

        const baseUrl = site.url.replace(/\/$/, '');
        const issues: AuditIssue[] = [];
        const checks = { total: 0, passed: 0, failed: 0, warnings: 0 };

        // 1. Check robots.txt
        checks.total++;
        try {
            const robotsRes = await fetch(`${baseUrl}/robots.txt`, { signal: AbortSignal.timeout(10000) });
            if (robotsRes.ok) {
                const robotsText = await robotsRes.text();
                checks.passed++;
                if (robotsText.includes('Disallow: /')) {
                    issues.push({ type: 'info', category: 'Crawlability', message: 'robots.txt contains Disallow rules', url: `${baseUrl}/robots.txt` });
                }
                if (!robotsText.toLowerCase().includes('sitemap')) {
                    issues.push({ type: 'warning', category: 'Crawlability', message: 'robots.txt does not reference a sitemap', url: `${baseUrl}/robots.txt` });
                    checks.warnings++;
                }
            } else {
                issues.push({ type: 'warning', category: 'Crawlability', message: 'robots.txt not found (404)', url: `${baseUrl}/robots.txt` });
                checks.warnings++;
            }
        } catch {
            issues.push({ type: 'error', category: 'Crawlability', message: 'Failed to fetch robots.txt', url: `${baseUrl}/robots.txt` });
            checks.failed++;
        }

        // 2. Check sitemap.xml
        checks.total++;
        let sitemapUrls: string[] = [];
        try {
            const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`, { signal: AbortSignal.timeout(10000) });
            if (sitemapRes.ok) {
                const sitemapText = await sitemapRes.text();
                checks.passed++;
                // Count URLs in sitemap
                const urlMatches = sitemapText.match(/<loc>/g);
                const urlCount = urlMatches?.length || 0;
                issues.push({ type: 'info', category: 'Crawlability', message: `Sitemap found with ${urlCount} URLs`, url: `${baseUrl}/sitemap.xml` });

                // Extract some URLs for further checks
                const locRegex = /<loc>(.*?)<\/loc>/g;
                let match;
                while ((match = locRegex.exec(sitemapText)) !== null && sitemapUrls.length < 10) {
                    sitemapUrls.push(match[1]);
                }
            } else {
                issues.push({ type: 'error', category: 'Crawlability', message: 'sitemap.xml not found (404)', url: `${baseUrl}/sitemap.xml` });
                checks.failed++;
            }
        } catch {
            issues.push({ type: 'error', category: 'Crawlability', message: 'Failed to fetch sitemap.xml' });
            checks.failed++;
        }

        // 3. Check HTTPS
        checks.total++;
        if (baseUrl.startsWith('https://')) {
            checks.passed++;
        } else {
            issues.push({ type: 'error', category: 'Security', message: 'Site is not using HTTPS', url: baseUrl });
            checks.failed++;
        }

        // 4. Fetch homepage and check meta tags
        checks.total++;
        try {
            const homeRes = await fetch(baseUrl, { signal: AbortSignal.timeout(15000) });
            if (homeRes.ok) {
                const homeHtml = await homeRes.text();
                checks.passed++;

                // Check title tag
                checks.total++;
                const titleMatch = homeHtml.match(/<title>(.*?)<\/title>/i);
                if (titleMatch) {
                    const titleLen = titleMatch[1].length;
                    if (titleLen < 30) {
                        issues.push({ type: 'warning', category: 'Meta Tags', message: `Title tag too short (${titleLen} chars)`, details: titleMatch[1] });
                        checks.warnings++;
                    } else if (titleLen > 60) {
                        issues.push({ type: 'warning', category: 'Meta Tags', message: `Title tag too long (${titleLen} chars)`, details: titleMatch[1] });
                        checks.warnings++;
                    } else {
                        checks.passed++;
                    }
                } else {
                    issues.push({ type: 'error', category: 'Meta Tags', message: 'No title tag found on homepage' });
                    checks.failed++;
                }

                // Check meta description
                checks.total++;
                const descMatch = homeHtml.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
                if (descMatch) {
                    const descLen = descMatch[1].length;
                    if (descLen < 70) {
                        issues.push({ type: 'warning', category: 'Meta Tags', message: `Meta description too short (${descLen} chars)` });
                        checks.warnings++;
                    } else if (descLen > 160) {
                        issues.push({ type: 'warning', category: 'Meta Tags', message: `Meta description too long (${descLen} chars)` });
                        checks.warnings++;
                    } else {
                        checks.passed++;
                    }
                } else {
                    issues.push({ type: 'warning', category: 'Meta Tags', message: 'No meta description on homepage' });
                    checks.warnings++;
                }

                // Check viewport
                checks.total++;
                if (homeHtml.includes('viewport')) {
                    checks.passed++;
                } else {
                    issues.push({ type: 'error', category: 'Mobile', message: 'No viewport meta tag — site may not be mobile-friendly' });
                    checks.failed++;
                }

                // Check canonical
                checks.total++;
                if (homeHtml.includes('canonical')) {
                    checks.passed++;
                } else {
                    issues.push({ type: 'warning', category: 'SEO', message: 'No canonical tag on homepage' });
                    checks.warnings++;
                }

                // Check Open Graph
                checks.total++;
                if (homeHtml.includes('og:title') || homeHtml.includes('og:description')) {
                    checks.passed++;
                } else {
                    issues.push({ type: 'warning', category: 'Social', message: 'No Open Graph tags found' });
                    checks.warnings++;
                }

                // Check structured data
                checks.total++;
                if (homeHtml.includes('application/ld+json')) {
                    checks.passed++;
                    issues.push({ type: 'info', category: 'Schema', message: 'Structured data (JSON-LD) detected on homepage' });
                } else {
                    issues.push({ type: 'warning', category: 'Schema', message: 'No structured data found on homepage' });
                    checks.warnings++;
                }

                // Check H1
                checks.total++;
                const h1Matches = homeHtml.match(/<h1[^>]*>/gi);
                if (!h1Matches) {
                    issues.push({ type: 'error', category: 'Content', message: 'No H1 tag found on homepage' });
                    checks.failed++;
                } else if (h1Matches.length > 1) {
                    issues.push({ type: 'warning', category: 'Content', message: `Multiple H1 tags on homepage (${h1Matches.length} found)` });
                    checks.warnings++;
                } else {
                    checks.passed++;
                }
            }
        } catch {
            issues.push({ type: 'error', category: 'Accessibility', message: 'Failed to fetch homepage' });
            checks.failed++;
        }

        // 5. Check some internal pages for broken links
        for (const url of sitemapUrls.slice(0, 5)) {
            checks.total++;
            try {
                const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
                if (res.ok) {
                    checks.passed++;
                } else {
                    issues.push({ type: 'error', category: 'Broken Links', message: `Page returns ${res.status}`, url });
                    checks.failed++;
                }
            } catch {
                issues.push({ type: 'warning', category: 'Broken Links', message: 'Failed to check page', url });
                checks.warnings++;
            }
        }

        const score = checks.total > 0 ? Math.round((checks.passed / checks.total) * 100) : 0;

        return NextResponse.json({
            score,
            checks,
            issues: issues.sort((a, b) => {
                const order = { error: 0, warning: 1, info: 2 };
                return order[a.type] - order[b.type];
            }),
            site: { name: site.name, url: baseUrl },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Audit failed' },
            { status: 500 }
        );
    }
}
