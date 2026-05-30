// ============================================================
// RankMaster Pro - User Profile API
// GET  /api/user/profile  — Fetch current user's profile
// PUT  /api/user/profile  — Update profile fields
// ============================================================

import { NextResponse, NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

export async function GET() {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { user, supabase } = auth;

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error && error.code === 'PGRST116') {
            // Profile doesn't exist yet — create it
            const { data: newProfile, error: insertError } = await supabase
                .from('profiles')
                .insert({ id: user.id, email: user.email })
                .select()
                .single();

            if (insertError) {
                console.error('[profile] Failed to auto-create profile:', insertError);
                return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
            }

            return NextResponse.json({ profile: newProfile });
        }

        if (error) {
            console.error('[profile] Fetch error:', error);
            return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
        }

        return NextResponse.json({ profile });
    } catch (err) {
        console.error('[profile] Exception:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { user, supabase } = auth;

    try {
        const body = await request.json();

        // Whitelist of updatable fields
        const allowedFields = ['display_name', 'bio', 'timezone', 'date_format', 'theme'];
        const updates: Record<string, unknown> = {};

        for (const field of allowedFields) {
            if (field in body) {
                updates[field] = body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        // Validate theme value
        if (updates.theme && !['dark', 'light', 'system'].includes(updates.theme as string)) {
            return NextResponse.json({ error: 'Invalid theme value' }, { status: 400 });
        }

        // Validate display_name length
        if (updates.display_name && (updates.display_name as string).length > 100) {
            return NextResponse.json({ error: 'Display name must be 100 characters or less' }, { status: 400 });
        }

        // Validate bio length
        if (updates.bio && (updates.bio as string).length > 500) {
            return NextResponse.json({ error: 'Bio must be 500 characters or less' }, { status: 400 });
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .single();

        if (error) {
            console.error('[profile] Update error:', error);
            return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
        }

        return NextResponse.json({ profile });
    } catch (err) {
        console.error('[profile] Exception:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
