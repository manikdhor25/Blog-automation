// ============================================================
// RankMaster Pro - API Cost Tracking Route
// Tracks AI provider usage and costs (replaces localStorage)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getAuthUser } from '@/lib/auth-guard';

// GET /api/costs - List usage entries for current user
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || '7d';

        const auth = await getAuthUser();
        if (auth.error) return auth.error;
        const now = new Date();
        let since: Date;

        switch (range) {
            case 'today':
                since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case '30d':
                since = new Date(now.getTime() - 30 * 86400000);
                break;
            default: // 7d
                since = new Date(now.getTime() - 7 * 86400000);
        }

        const { data, error } = await auth.supabase
            .from('api_usage')
            .select('*')
            .eq('user_id', auth.user.id)
            .gte('created_at', since.toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;

        const entries = data || [];
        const totalCost = entries.reduce((s, u) => s + parseFloat(u.estimated_cost || '0'), 0);
        const totalTokensIn = entries.reduce((s, u) => s + (u.tokens_in || 0), 0);
        const totalTokensOut = entries.reduce((s, u) => s + (u.tokens_out || 0), 0);

        // Group by provider
        const byProvider: Record<string, { cost: number; calls: number; tokens: number }> = {};
        entries.forEach(u => {
            if (!byProvider[u.provider]) byProvider[u.provider] = { cost: 0, calls: 0, tokens: 0 };
            byProvider[u.provider].cost += parseFloat(u.estimated_cost || '0');
            byProvider[u.provider].calls += 1;
            byProvider[u.provider].tokens += (u.tokens_in || 0) + (u.tokens_out || 0);
        });

        return NextResponse.json({
            entries,
            summary: { totalCost, totalCalls: entries.length, totalTokensIn, totalTokensOut },
            byProvider,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch costs' },
            { status: 500 }
        );
    }
}

// POST /api/costs - Log API usage
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { data, error } = await auth.supabase
            .from('api_usage')
            .insert({
                user_id: auth.user.id,
                provider: body.provider,
                model: body.model,
                task: body.task,
                tokens_in: body.tokens_in || 0,
                tokens_out: body.tokens_out || 0,
                estimated_cost: body.estimated_cost || 0,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ entry: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to log usage' },
            { status: 500 }
        );
    }
}
