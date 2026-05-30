import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ user: null });
        }

        // Try to fetch profile data
        let profile = null;
        try {
            const { data } = await supabase
                .from('profiles')
                .select('display_name, avatar_url, bio, timezone, theme')
                .eq('id', user.id)
                .single();
            profile = data;
        } catch {
            // profiles table may not exist yet — graceful fallback
        }

        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                created_at: user.created_at,
                display_name: profile?.display_name || null,
                avatar_url: profile?.avatar_url || null,
            },
        });
    } catch {
        return NextResponse.json({ user: null }, { status: 500 });
    }
}
