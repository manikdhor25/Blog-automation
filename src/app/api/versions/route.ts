// ============================================================
// RankMaster Pro - Content Versioning API Route
// Track content changes and enable rollback
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getAuthUser } from '@/lib/auth-guard';

// GET /api/versions - Get version history (optionally filtered by post_id)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const postId = searchParams.get('post_id');

        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        if (postId) {
            // Filtered: versions for a specific post
            const { data, error } = await auth.supabase
                .from('content_versions')
                .select('*')
                .eq('post_id', postId)
                .order('version_number', { ascending: false });

            if (error) throw error;
            return NextResponse.json({ versions: data || [] });
        }

        // Unfiltered: return ALL versions for this user, newest first
        const { data, error } = await auth.supabase
            .from('content_versions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;
        return NextResponse.json({ versions: data || [] });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch versions' },
            { status: 500 }
        );
    }
}

// POST /api/versions - Save a new version
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { post_id, title, content, meta_title, meta_description, score, change_summary } = body;

        if (!post_id || !title || !content) {
            return NextResponse.json({ error: 'post_id, title, and content required' }, { status: 400 });
        }

        const auth = await getAuthUser();
        if (auth.error) return auth.error;
        const supabase = auth.supabase;
        const user = auth.user;

        // Get next version number
        const { data: latest } = await supabase
            .from('content_versions')
            .select('version_number')
            .eq('post_id', post_id)
            .order('version_number', { ascending: false })
            .limit(1);

        const nextVersion = (latest?.[0]?.version_number || 0) + 1;

        const { data, error } = await supabase
            .from('content_versions')
            .insert({
                user_id: user.id,
                post_id,
                title,
                content,
                meta_title: meta_title || null,
                meta_description: meta_description || null,
                score: score || 0,
                change_summary: change_summary || `Version ${nextVersion}`,
                version_number: nextVersion,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ version: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to save version' },
            { status: 500 }
        );
    }
}
