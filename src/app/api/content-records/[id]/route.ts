// ============================================================
// RankMaster Pro - Single Content Record API
// GET: Fetch single record, DELETE: Remove single record
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { id } = await params;

        const { data, error } = await auth.supabase
            .from('content_records')
            .select('*')
            .eq('id', id)
            .eq('user_id', auth.user.id)
            .single();

        if (error || !data) {
            return NextResponse.json(
                { error: 'Content record not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ record: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch content record' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { id } = await params;

        const { error } = await auth.supabase
            .from('content_records')
            .delete()
            .eq('id', id)
            .eq('user_id', auth.user.id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete content record' },
            { status: 500 }
        );
    }
}
