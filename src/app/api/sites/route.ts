// ============================================================
// RankMaster Pro - Sites API Route
// CRUD operations for WordPress sites (user-scoped)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createWordPressClient } from '@/lib/wordpress/client';
import { SiteFormData } from '@/lib/types';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/sites - List sites for current user
export async function GET() {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { data: sites, error } = await auth.supabase
            .from('sites')
            .select('*')
            .eq('user_id', auth.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ sites: sites || [] });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch sites' },
            { status: 500 }
        );
    }
}

// POST /api/sites - Add a new site
export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const body: SiteFormData = await request.json();

        // Validate required fields
        if (!body.name || !body.url || !body.username || !body.app_password) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Test WordPress connection first
        const testSite = {
            id: '', name: body.name, url: body.url, username: body.username,
            app_password_encrypted: body.app_password, niche: body.niche, created_at: '',
        };
        const wp = createWordPressClient(testSite);
        const connectionTest = await wp.testConnection();

        if (!connectionTest.success) {
            return NextResponse.json(
                { error: `WordPress connection failed: ${connectionTest.message}` },
                { status: 400 }
            );
        }

        // Save site to database with user_id
        const { data: site, error } = await auth.supabase
            .from('sites')
            .insert({
                user_id: auth.user.id,
                name: body.name,
                url: body.url.replace(/\/$/, ''),
                username: body.username,
                app_password_encrypted: body.app_password,
                niche: body.niche || '',
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ site, connectionTest });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to add site' },
            { status: 500 }
        );
    }
}

// DELETE /api/sites - Delete a site (only if owned by current user)
export async function DELETE(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Site ID required' }, { status: 400 });
        }

        // Delete only if owned by current user
        const { error } = await auth.supabase
            .from('sites')
            .delete()
            .eq('id', id)
            .eq('user_id', auth.user.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete site' },
            { status: 500 }
        );
    }
}

