// ============================================================
// RankMaster Pro - Content A/B Testing Engine
// Create tests, track variants, measure performance, auto-optimize
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getAuthUser } from '@/lib/auth-guard';
import { ABTestPostSchema } from '@/lib/api-schemas';

// GET /api/ab-tests - List tests for current user
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const postId = searchParams.get('post_id');

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        let query = auth.supabase.from('ab_tests').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });

        if (status && status !== 'all') query = query.eq('status', status);
        if (postId) query = query.eq('post_id', postId);

        const { data: tests, error } = await query;
        if (error) throw error;

        // Calculate stats for each test
        const enriched = (tests || []).map((test: Record<string, unknown>) => {
            const variants = (test.variants as Array<Record<string, unknown>>) || [];
            const totalImpressions = variants.reduce((sum: number, v: Record<string, unknown>) => sum + (Number(v.impressions) || 0), 0);
            const totalClicks = variants.reduce((sum: number, v: Record<string, unknown>) => sum + (Number(v.clicks) || 0), 0);

            // Calculate confidence level (simplified chi-squared)
            let confidence = 0;
            if (variants.length === 2 && totalImpressions > 100) {
                const v1 = variants[0];
                const v2 = variants[1];
                const ctr1 = Number(v1.impressions) > 0 ? Number(v1.clicks) / Number(v1.impressions) : 0;
                const ctr2 = Number(v2.impressions) > 0 ? Number(v2.clicks) / Number(v2.impressions) : 0;
                const pooledCTR = totalClicks / totalImpressions;
                const se = Math.sqrt(pooledCTR * (1 - pooledCTR) * (1 / Number(v1.impressions || 1) + 1 / Number(v2.impressions || 1)));
                const z = se > 0 ? Math.abs(ctr1 - ctr2) / se : 0;

                // Z-score to confidence
                if (z >= 2.576) confidence = 99;
                else if (z >= 1.96) confidence = 95;
                else if (z >= 1.645) confidence = 90;
                else if (z >= 1.28) confidence = 80;
                else confidence = Math.round(z * 40);
            }

            return {
                ...test,
                stats: {
                    totalImpressions,
                    totalClicks,
                    avgCTR: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00',
                    confidence,
                    significantAt95: confidence >= 95,
                },
            };
        });

        return NextResponse.json({ tests: enriched });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch tests' },
            { status: 500 }
        );
    }
}

// POST /api/ab-tests - Create test, update variant, switch active, declare winner
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsed = ABTestPostSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const { action } = parsed.data;

        const auth = await getAuthUser();
        if (auth.error) return auth.error;
        const supabase = auth.supabase;
        const user = auth.user;

        // Create A/B test
        if (action === 'create') {
            const variants = body.variants || [];
            if (variants.length < 2) {
                return NextResponse.json({ error: 'At least 2 variants required' }, { status: 400 });
            }

            // Initialize variant metrics
            const enrichedVariants = variants.map((v: Record<string, unknown>, i: number) => ({
                id: `variant_${i + 1}`,
                name: v.name || `Variant ${String.fromCharCode(65 + i)}`,
                title: v.title || '',
                meta_description: v.meta_description || '',
                content_snippet: v.content_snippet || '',
                impressions: 0,
                clicks: 0,
                ctr: 0,
                avg_position: 0,
                is_active: i === 0, // First variant is active by default
            }));

            const { data, error } = await supabase
                .from('ab_tests')
                .insert({
                    user_id: user.id,
                    post_id: body.post_id || null,
                    site_id: body.site_id || null,
                    test_name: body.test_name || `A/B Test ${new Date().toLocaleDateString()}`,
                    test_type: body.test_type || 'title', // title, meta, content
                    variants: enrichedVariants,
                    status: 'active',
                    start_date: new Date().toISOString(),
                    min_impressions: body.min_impressions || 500,
                    auto_optimize: body.auto_optimize ?? true,
                })
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json({ test: data });
        }

        // Update variant performance (called by automation/GSC sync)
        if (action === 'update_metrics') {
            const { test_id, variant_id, impressions, clicks, avg_position } = body;
            if (!test_id || !variant_id) {
                return NextResponse.json({ error: 'test_id and variant_id required' }, { status: 400 });
            }

            const { data: test } = await supabase.from('ab_tests').select('*').eq('id', test_id).single();
            if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

            const variants = (test.variants as Array<Record<string, unknown>>) || [];
            const updated = variants.map((v: Record<string, unknown>) => {
                if (v.id === variant_id) {
                    const newImpressions = (Number(v.impressions) || 0) + (impressions || 0);
                    const newClicks = (Number(v.clicks) || 0) + (clicks || 0);
                    return {
                        ...v,
                        impressions: newImpressions,
                        clicks: newClicks,
                        ctr: newImpressions > 0 ? ((newClicks / newImpressions) * 100) : 0,
                        avg_position: avg_position || v.avg_position,
                    };
                }
                return v;
            });

            const { error } = await supabase.from('ab_tests')
                .update({ variants: updated, updated_at: new Date().toISOString() })
                .eq('id', test_id);

            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        // Switch active variant (deploy to WordPress)
        if (action === 'switch_variant') {
            const { test_id, variant_id } = body;
            if (!test_id || !variant_id) {
                return NextResponse.json({ error: 'test_id and variant_id required' }, { status: 400 });
            }

            const { data: test } = await supabase.from('ab_tests').select('*').eq('id', test_id).single();
            if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

            const variants = (test.variants as Array<Record<string, unknown>>) || [];
            const updated = variants.map((v: Record<string, unknown>) => ({
                ...v,
                is_active: v.id === variant_id,
            }));

            const activeVariant = updated.find(v => v.is_active) as Record<string, unknown> | undefined;

            // Update WordPress post if connected
            if (test.post_id && activeVariant) {
                const { data: post } = await supabase.from('posts').select('*, sites(*)').eq('id', test.post_id).single();
                if (post?.wp_post_id && post?.sites?.url) {
                    const site = post.sites;
                    try {
                        const wpUrl = `${site.url.replace(/\/$/, '')}/wp-json/wp/v2/posts/${post.wp_post_id}`;
                        const auth = Buffer.from(`${site.wp_username}:${site.wp_app_password}`).toString('base64');
                        await fetch(wpUrl, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
                            body: JSON.stringify({
                                title: String(activeVariant.title || post.title),
                                meta: {
                                    _yoast_wpseo_metadesc: String(activeVariant.meta_description || post.meta_description || ''),
                                },
                            }),
                        });
                    } catch { /* continue anyway */ }
                }
            }

            const { error } = await supabase.from('ab_tests')
                .update({ variants: updated, updated_at: new Date().toISOString() })
                .eq('id', test_id);

            if (error) throw error;
            return NextResponse.json({ success: true, active_variant: variant_id });
        }

        // Declare winner and end test
        if (action === 'declare_winner') {
            const { test_id, winner_id } = body;
            if (!test_id || !winner_id) {
                return NextResponse.json({ error: 'test_id and winner_id required' }, { status: 400 });
            }

            const { error } = await supabase.from('ab_tests')
                .update({
                    status: 'completed',
                    winner_variant: winner_id,
                    end_date: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', test_id);

            if (error) throw error;
            return NextResponse.json({ success: true, winner: winner_id });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process test' },
            { status: 500 }
        );
    }
}

// DELETE /api/ab-tests (owned by current user)
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Test ID required' }, { status: 400 });

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { error } = await auth.supabase.from('ab_tests').delete().eq('id', id).eq('user_id', auth.user.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete test' },
            { status: 500 }
        );
    }
}
