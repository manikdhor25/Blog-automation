// ============================================================
// RankMaster Pro - Avatar Upload API
// POST /api/user/avatar — Upload avatar image
// ============================================================

import { NextResponse, NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { user, supabase } = auth;

    try {
        const formData = await request.formData();
        const file = formData.get('avatar') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate type
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Allowed: JPG, PNG, WebP' },
                { status: 400 }
            );
        }

        // Validate size
        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: 'File too large. Maximum size is 2MB' },
                { status: 400 }
            );
        }

        // Generate file path
        const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
        const filePath = `${user.id}/avatar.${ext}`;

        // Upload to Supabase Storage
        const fileBuffer = await file.arrayBuffer();
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, fileBuffer, {
                contentType: file.type,
                upsert: true, // Overwrite existing
            });

        if (uploadError) {
            console.error('[avatar] Upload error:', uploadError);

            // If bucket doesn't exist, provide helpful error
            if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
                return NextResponse.json(
                    { error: 'Avatar storage not configured. Create an "avatars" bucket in Supabase Storage.' },
                    { status: 500 }
                );
            }

            return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        // Add cache-busting param
        const avatarUrl = `${publicUrl}?t=${Date.now()}`;

        // Update profile with new avatar URL
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: avatarUrl })
            .eq('id', user.id);

        if (updateError) {
            console.error('[avatar] Profile update error:', updateError);
            return NextResponse.json({ error: 'Avatar uploaded but profile update failed' }, { status: 500 });
        }

        return NextResponse.json({ avatar_url: avatarUrl });
    } catch (err) {
        console.error('[avatar] Exception:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
