// ============================================================
// RankMaster Pro - White-Label Client Reporting API
// Generate branded PDF/JSON reports per site
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { routeAI } from '@/lib/ai/router';
import { z } from 'zod';

const ReportSchema = z.object({
    action: z.enum(['generate', 'list', 'delete', 'get_config', 'save_config']),
    site_id: z.string().uuid().optional(),
    report_type: z.enum(['seo_performance', 'affiliate_revenue', 'content_audit', 'full_report']).optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    id: z.string().uuid().optional(),
    branding: z.object({
        agency_name: z.string().max(200).optional(),
        agency_logo_url: z.string().optional(),
        agency_color: z.string().max(20).optional(),
        client_name: z.string().max(200).optional(),
        include_rankmaster_branding: z.boolean().optional(),
    }).optional(),
});

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = ReportSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'save_config') {
        if (!parsed.data.branding) return NextResponse.json({ error: 'branding required' }, { status: 400 });
        await auth.supabase.from('settings').upsert({
            user_id: auth.user.id,
            category: 'reporting',
            key: 'white_label_config',
            value: JSON.stringify(parsed.data.branding),
            is_secret: false,
        }, { onConflict: 'user_id,key' });
        return NextResponse.json({ success: true });
    }

    if (action === 'get_config') {
        const { data } = await auth.supabase.from('settings').select('value').eq('user_id', auth.user.id).eq('key', 'white_label_config').single();
        const config = data?.value ? JSON.parse(data.value) : {};
        return NextResponse.json({ config });
    }

    if (action === 'generate') {
        const { site_id, report_type = 'full_report', date_from, date_to, branding } = parsed.data;
        if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

        const dateEnd = date_to || new Date().toISOString();
        const dateStart = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Gather all site data in parallel
        const [siteRes, postsRes, keywordsRes, backlinksRes, affiliatesRes, rankRes] = await Promise.all([
            auth.supabase.from('sites').select('*').eq('id', site_id).eq('user_id', auth.user.id).single(),
            auth.supabase.from('posts').select('id, title, seo_score, overall_score, status, published_at').eq('site_id', site_id).order('published_at', { ascending: false }).limit(50),
            auth.supabase.from('keywords').select('keyword, search_volume, difficulty, status').eq('site_id', site_id).limit(100),
            auth.supabase.from('backlinks').select('domain_authority, link_type, status').eq('site_id', site_id).limit(100),
            auth.supabase.from('affiliate_links').select('clicks, conversions').eq('site_id', site_id),
            auth.supabase.from('keywords').select('keyword, search_volume').eq('site_id', site_id).eq('status', 'ranking').limit(20),
        ]);

        const site = siteRes.data;
        const posts = postsRes.data || [];
        const keywords = keywordsRes.data || [];
        const backlinks = backlinksRes.data || [];
        const affiliateLinks = affiliatesRes.data || [];
        const rankingKeywords = rankRes.data || [];

        const publishedPosts = posts.filter(p => p.status === 'published');
        const avgSeoScore = posts.length ? Math.round(posts.reduce((s, p) => s + (p.seo_score || 0), 0) / posts.length) : 0;
        const totalAffiliateClicks = affiliateLinks.reduce((s, l) => s + (l.clicks || 0), 0);
        const totalConversions = affiliateLinks.reduce((s, l) => s + (l.conversions || 0), 0);
        const avgDA = backlinks.length ? Math.round(backlinks.reduce((s, b) => s + (b.domain_authority || 0), 0) / backlinks.length) : 0;

        // AI-generated executive summary
        const summaryPrompt = `Write a concise executive summary for a ${report_type.replace('_', ' ')} report.

Site: ${site?.name || site_id}
Period: ${new Date(dateStart).toLocaleDateString()} to ${new Date(dateEnd).toLocaleDateString()}
Published posts: ${publishedPosts.length}
Avg SEO score: ${avgSeoScore}/100
Keywords ranking: ${rankingKeywords.length}
Total backlinks: ${backlinks.length}
Avg backlink DA: ${avgDA}
Affiliate clicks: ${totalAffiliateClicks}
Conversions: ${totalConversions}

Write 2-3 sentences: what was achieved, key wins, one improvement recommendation. Professional tone.`;

        const summaryResult = await routeAI({ task: 'meta_generation', prompt: summaryPrompt, maxTokens: 300 });
        const executiveSummary = summaryResult.content || 'Report generated successfully.';

        const reportData = {
            generated_at: new Date().toISOString(),
            period: { from: dateStart, to: dateEnd },
            site: { id: site_id, name: site?.name, url: site?.url, niche: site?.niche },
            branding: branding || {},
            executive_summary: executiveSummary,
            metrics: {
                content: {
                    total_posts: posts.length,
                    published: publishedPosts.length,
                    avg_seo_score: avgSeoScore,
                    avg_overall_score: posts.length ? Math.round(posts.reduce((s, p) => s + (p.overall_score || 0), 0) / posts.length) : 0,
                    top_posts: posts.slice(0, 5).map(p => ({ title: p.title, seo_score: p.seo_score, overall_score: p.overall_score })),
                },
                keywords: {
                    total: keywords.length,
                    ranking: rankingKeywords.length,
                    avg_volume: keywords.length ? Math.round(keywords.reduce((s, k) => s + (k.search_volume || 0), 0) / keywords.length) : 0,
                    top_ranking: rankingKeywords.slice(0, 10),
                },
                backlinks: {
                    total: backlinks.length,
                    avg_da: avgDA,
                    dofollow: backlinks.filter(b => b.link_type === 'dofollow').length,
                },
                affiliate: {
                    total_clicks: totalAffiliateClicks,
                    total_conversions: totalConversions,
                    conversion_rate: totalAffiliateClicks > 0 ? ((totalConversions / totalAffiliateClicks) * 100).toFixed(1) : '0.0',
                    active_links: affiliateLinks.length,
                },
            },
            recommendations: [],
        };

        // Save report to DB
        const { data: saved, error } = await auth.supabase
            .from('reports')
            .insert({
                user_id: auth.user.id,
                site_id,
                report_type,
                date_from: dateStart,
                date_to: dateEnd,
                report_data: reportData,
                client_name: branding?.client_name || site?.name || '',
                created_at: new Date().toISOString(),
            })
            .select('id, created_at')
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ report: reportData, report_id: saved.id });
    }

    if (action === 'delete') {
        if (!parsed.data.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await auth.supabase.from('reports').delete().eq('id', parsed.data.id).eq('user_id', auth.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
        const { data, error } = await auth.supabase.from('reports').select('*').eq('id', id).eq('user_id', auth.user.id).single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ report: data?.report_data, meta: { id: data?.id, created_at: data?.created_at, report_type: data?.report_type } });
    }

    const { data, error } = await auth.supabase
        .from('reports')
        .select('id, site_id, report_type, client_name, date_from, date_to, created_at')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reports: data || [] });
}
