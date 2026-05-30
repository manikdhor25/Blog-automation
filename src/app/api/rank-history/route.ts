import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    const keyword = url.searchParams.get('keyword');
    const days = parseInt(url.searchParams.get('days') || '90');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Get tracked keywords
    let kwQuery = supabase.from('keywords').select('id, keyword, search_volume, current_position').eq('user_id', user.id);
    if (siteId) kwQuery = kwQuery.eq('site_id', siteId);
    if (keyword) kwQuery = kwQuery.ilike('keyword', `%${keyword}%`);
    const { data: keywords } = await kwQuery.limit(limit);

    // Get position history for each keyword
    const history: Record<string, Array<{ date: string; position: number }>> = {};
    for (const kw of keywords || []) {
        const { data: positions } = await supabase.from('rank_positions')
            .select('position, checked_at').eq('keyword_id', kw.id)
            .gte('checked_at', since).order('checked_at', { ascending: true });
        if (positions?.length) {
            history[kw.keyword] = positions.map(p => ({ date: p.checked_at.substring(0, 10), position: p.position }));
        }
    }

    // Movers â€” keywords with biggest position change
    const movers = (keywords || []).map(kw => {
        const kHistory = history[kw.keyword] || [];
        if (kHistory.length < 2) return { keyword: kw.keyword, change: 0, current: kw.current_position || 100, previous: kw.current_position || 100 };
        const oldest = kHistory[0].position;
        const newest = kHistory[kHistory.length - 1].position;
        return { keyword: kw.keyword, change: oldest - newest, current: newest, previous: oldest, direction: oldest > newest ? 'up' : 'down' };
    }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    return NextResponse.json({ keywords: keywords || [], history, movers, days });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    // Manual position entry (for sites without API)
    if (body.action === 'log_position') {
        const { keyword_id, position, date } = body;
        const { error } = await supabase.from('rank_positions').insert({
            user_id: user.id, keyword_id,
            position: parseInt(position),
            checked_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Update current position on keyword
        await supabase.from('keywords').update({ current_position: parseInt(position) }).eq('id', keyword_id).eq('user_id', user.id);
        return NextResponse.json({ logged: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
