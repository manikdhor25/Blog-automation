// ============================================================
// RankMaster Pro - Auth Guard Helper
// Extracts authenticated user from Supabase session
// Use in API routes to enforce user_id filtering
// ============================================================

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from './supabase-server';

export interface AuthUser {
    id: string;
    email: string;
}

export interface AuthResult {
    user: AuthUser;
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    error?: NextResponse;
}

/**
 * Extract the authenticated user from the request.
 * Uses a cookie-aware SSR client for both auth AND DB operations.
 * 
 * Usage in API routes:
 * ```ts
 * const auth = await getAuthUser();
 * if (auth.error) return auth.error;
 * const userId = auth.user.id;
 * // Use auth.supabase for DB queries (respects RLS with user context)
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getAuthUser(_request?: unknown): Promise<AuthResult> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

    // If Supabase isn't configured, skip auth
    if (!supabaseUrl || !supabaseUrl.startsWith('http') || supabaseUrl === 'your_supabase_url') {
        return {
            error: NextResponse.json(
                { error: 'Supabase not configured' },
                { status: 401 }
            ),
        } as unknown as AuthResult;
    }

    try {
        // Cookie-aware SSR client — handles both auth and DB queries
        const supabase = await createSupabaseServerClient();

        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return {
                error: NextResponse.json(
                    { error: 'Authentication required' },
                    { status: 401 }
                ),
            } as unknown as AuthResult;
        }

        return {
            user: { id: user.id, email: user.email || '' },
            supabase,
        };
    } catch (err) {
        console.error('[auth-guard] Exception:', err);
        return {
            error: NextResponse.json(
                { error: 'Authentication failed' },
                { status: 401 }
            ),
        } as unknown as AuthResult;
    }
}

/**
 * Check whether an authenticated user is a platform admin.
 * Admins may read secret settings and modify the global settings store.
 */
export async function isAdmin(
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
    userId: string
): Promise<boolean> {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', userId)
            .single();
        return Boolean(data?.is_admin);
    } catch {
        return false;
    }
}
