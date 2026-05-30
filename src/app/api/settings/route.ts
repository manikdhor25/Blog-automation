// ============================================================
// RankMaster Pro - Settings API Route
// CRUD for admin settings (API keys, configuration)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';
import { getAuthUser, isAdmin } from '@/lib/auth-guard';

// GET /api/settings - List all settings (authenticated)
export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');

        let query = auth.supabase.from('settings').select('*').order('category').order('key');

        // Always include ai_task_routing alongside whatever category is requested
        if (category && category !== 'all') {
            query = query.in('category', [category, 'ai_task_routing']);
        }

        const { data: settings, error } = await query;
        if (error) throw error;

        const admin = await isAdmin(auth.supabase, auth.user.id);

        // Secrets: admins see a masked hint (last 4 chars) so they can verify
        // which key is set; non-admins never receive any part of a secret value.
        const masked = (settings || []).map(s => {
            const hasValue = Boolean(s.value && s.value.length > 0);
            let value = s.value;
            if (s.is_secret && hasValue) {
                value = admin ? '••••••••' + s.value.slice(-4) : null;
            }
            return { ...s, value, has_value: hasValue };
        });

        return NextResponse.json({ settings: masked });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch settings' },
            { status: 500 }
        );
    }
}

// POST /api/settings - Update settings (authenticated)
export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        // Settings is a global platform store (shared API keys) — only admins
        // may write, otherwise any signed-up user could overwrite platform keys.
        if (!(await isAdmin(auth.supabase, auth.user.id))) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body = await request.json();
        const { updates } = body;

        if (!updates || !Array.isArray(updates)) {
            return NextResponse.json({ error: 'updates array required' }, { status: 400 });
        }

        const results = [];

        for (const update of updates) {
            const { key, value } = update;
            if (!key) continue;

            // Skip if masked value (user didn't change it)
            if (value && value.startsWith('••••••••')) continue;

            const { data, error } = await auth.supabase
                .from('settings')
                .update({ value, updated_at: new Date().toISOString() })
                .eq('key', key)
                .select()
                .single();

            if (error) {
                // If setting doesn't exist, insert it
                const { data: inserted } = await auth.supabase
                    .from('settings')
                    .insert({ key, value, category: update.category || 'custom', label: update.label || key, is_secret: update.is_secret || false })
                    .select()
                    .single();
                results.push(inserted);
            } else {
                results.push(data);
            }
        }

        return NextResponse.json({ success: true, updated: results.length });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update settings' },
            { status: 500 }
        );
    }
}

// Helper: get a specific setting value (for server-side use)
export async function getSettingValue(key: string): Promise<string> {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .single();
    return data?.value || '';
}

// Helper: get all AI provider keys
export async function getAIProviderKeys(): Promise<Record<string, string>> {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
        .from('settings')
        .select('key, value')
        .eq('category', 'ai');

    const keys: Record<string, string> = {};
    for (const setting of data || []) {
        keys[setting.key] = setting.value || '';
    }
    return keys;
}
