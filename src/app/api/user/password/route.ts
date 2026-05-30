// ============================================================
// RankMaster Pro - Password Change API
// PUT /api/user/password — Change current user's password
// ============================================================

import { NextResponse, NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

export async function PUT(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { supabase } = auth;

    try {
        const body = await request.json();
        const { new_password } = body;

        // Validate new password
        if (!new_password || typeof new_password !== 'string') {
            return NextResponse.json({ error: 'New password is required' }, { status: 400 });
        }

        if (new_password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }

        // Check password strength
        const hasLetter = /[a-zA-Z]/.test(new_password);
        const hasNumber = /[0-9]/.test(new_password);

        if (!hasLetter || !hasNumber) {
            return NextResponse.json(
                { error: 'Password must contain at least one letter and one number' },
                { status: 400 }
            );
        }

        // Update password via Supabase Auth
        const { error } = await supabase.auth.updateUser({
            password: new_password,
        });

        if (error) {
            console.error('[password] Update error:', error);

            // Handle common Supabase auth errors
            if (error.message.includes('same')) {
                return NextResponse.json(
                    { error: 'New password must be different from current password' },
                    { status: 400 }
                );
            }

            return NextResponse.json(
                { error: error.message || 'Failed to update password' },
                { status: 400 }
            );
        }

        return NextResponse.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('[password] Exception:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
