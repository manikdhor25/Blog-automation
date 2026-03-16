import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side client with cookie-based auth for API routes / server components
export async function createSupabaseServerClient() {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    // Warn if credentials aren't configured instead of silently masking
    const isConfigured = url.startsWith('http');
    if (!isConfigured) {
        console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL is not configured — server client will return empty data. Set it in .env.local');
    }
    const safeUrl = isConfigured ? url : 'https://placeholder.supabase.co';
    const safeKey = isConfigured ? key : 'placeholder';

    return createServerClient(
        safeUrl,
        safeKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // Called from Server Component — ignore
                    }
                },
            },
        }
    );
}
