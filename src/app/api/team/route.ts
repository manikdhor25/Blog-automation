import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/team — List team members
export async function GET() {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { data: members, error } = await auth.supabase
            .from('team_members')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            // Table may not exist yet — return current user as owner
            return NextResponse.json({
                members: [{
                    id: auth.user.id,
                    email: auth.user.email,
                    role: 'owner',
                    status: 'active',
                    created_at: new Date().toISOString(),
                }],
                needs_setup: true,
            });
        }

        return NextResponse.json({ members: members || [] });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch team' },
            { status: 500 }
        );
    }
}

// POST /api/team — Invite or update team member
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const body = await req.json();
        const { action, email, role, member_id } = body;

        if (action === 'invite') {
            if (!email || !role) {
                return NextResponse.json({ error: 'email and role required' }, { status: 400 });
            }

            const validRoles = ['admin', 'editor', 'writer', 'viewer'];
            if (!validRoles.includes(role)) {
                return NextResponse.json({ error: `Invalid role. Must be: ${validRoles.join(', ')}` }, { status: 400 });
            }

            const { data, error } = await auth.supabase
                .from('team_members')
                .insert({
                    email,
                    role,
                    invited_by: auth.user.id,
                    status: 'pending',
                })
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json({ member: data });
        }

        if (action === 'update_role' && member_id) {
            const { data, error } = await auth.supabase
                .from('team_members')
                .update({ role })
                .eq('id', member_id)
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json({ member: data });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed' },
            { status: 500 }
        );
    }
}

// DELETE /api/team — Remove team member
export async function DELETE(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const id = req.nextUrl.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { error } = await auth.supabase.from('team_members').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to remove member' },
            { status: 500 }
        );
    }
}
