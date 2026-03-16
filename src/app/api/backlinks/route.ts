// ============================================================
// RankMaster Pro - Backlinks API Route (Enhanced with Moz)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getBacklinkEngine } from '@/lib/engines/backlink-engine';
import { getAuthUser } from '@/lib/auth-guard';
import { BacklinkPostSchema } from '@/lib/api-schemas';

// GET /api/backlinks - List backlinks for current user
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const siteId = searchParams.get('site_id');
        const status = searchParams.get('status');

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        let query = auth.supabase.from('backlinks').select('*').eq('user_id', auth.user.id).order('first_seen', { ascending: false });

        if (siteId) query = query.eq('site_id', siteId);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;

        const entries = data || [];
        const stats = {
            total: entries.length,
            active: entries.filter((b: Record<string, unknown>) => b.status === 'active').length,
            lost: entries.filter((b: Record<string, unknown>) => b.status === 'lost').length,
            new: entries.filter((b: Record<string, unknown>) => b.status === 'new').length,
            dofollow: entries.filter((b: Record<string, unknown>) => b.link_type === 'dofollow').length,
            nofollow: entries.filter((b: Record<string, unknown>) => b.link_type === 'nofollow').length,
            uniqueDomains: new Set(entries.map((b: Record<string, unknown>) => b.source_domain)).size,
        };

        return NextResponse.json({ backlinks: entries, stats });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch backlinks' },
            { status: 500 }
        );
    }
}

// POST /api/backlinks - Discover backlinks via Moz/AI or add manually
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsed = BacklinkPostSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const { action, site_id } = parsed.data;

        const auth = await getAuthUser();
        if (auth.error) return auth.error;
        const supabase = auth.supabase;
        const user = auth.user;

        const engine = await getBacklinkEngine();

        // Discover real backlinks via Moz
        if (action === 'discover') {
            const { data: site } = await supabase.from('sites').select('*').eq('id', site_id).single();
            if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

            if (engine.isConfigured()) {
                const { backlinks, source } = await engine.getBacklinks(site.url, 50);
                // Save discovered backlinks to DB
                for (const bl of backlinks.slice(0, 30)) {
                    await supabase.from('backlinks').upsert({
                        user_id: user.id,
                        site_id,
                        source_url: bl.sourceUrl,
                        source_domain: bl.sourceDomain,
                        target_url: bl.targetUrl,
                        anchor_text: bl.anchorText,
                        link_type: bl.linkType,
                        status: 'active',
                        domain_authority: bl.domainAuthority,
                        page_authority: bl.pageAuthority,
                        spam_score: bl.spamScore,
                        first_seen: bl.firstSeen,
                        data_source: 'moz',
                    }, { onConflict: 'source_url,target_url' });
                }
                return NextResponse.json({ backlinks, source, saved: Math.min(backlinks.length, 30) });
            } else {
                // Fallback to AI suggestions
                const { opportunities, source } = await engine.discoverOpportunities(site.url, site.niche || 'general');
                return NextResponse.json({ opportunities, source });
            }
        }

        // Get domain authority
        if (action === 'authority') {
            const domain = body.domain;
            if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400 });
            const { metrics, source } = await engine.getDomainMetrics(domain);
            return NextResponse.json({ metrics, source });
        }

        // Competitor backlink gap analysis
        if (action === 'gap') {
            const { your_domain, competitor_domain } = body;
            if (!your_domain || !competitor_domain) {
                return NextResponse.json({ error: 'your_domain and competitor_domain required' }, { status: 400 });
            }
            const result = await engine.getBacklinkGap(your_domain, competitor_domain);
            return NextResponse.json(result);
        }

        // Manual backlink addition
        if (!site_id || !body.source_url || !body.target_url) {
            return NextResponse.json({ error: 'site_id, source_url, and target_url required' }, { status: 400 });
        }

        const domain = new URL(body.source_url).hostname.replace('www.', '');

        const { data, error } = await supabase
            .from('backlinks')
            .insert({
                user_id: user.id,
                site_id,
                source_url: body.source_url,
                source_domain: domain,
                target_url: body.target_url,
                anchor_text: body.anchor_text || '',
                link_type: body.link_type || 'dofollow',
                status: body.status || 'active',
                domain_authority: body.domain_authority || null,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ backlink: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process backlinks' },
            { status: 500 }
        );
    }
}

// DELETE /api/backlinks - Remove backlink (owned by current user)
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Backlink ID required' }, { status: 400 });

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { error } = await auth.supabase.from('backlinks').delete().eq('id', id).eq('user_id', auth.user.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete backlink' },
            { status: 500 }
        );
    }
}
