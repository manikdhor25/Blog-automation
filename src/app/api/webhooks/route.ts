import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

// GET /api/webhooks — List configured webhooks
export async function GET() {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const { data: webhooks, error } = await auth.supabase
            .from('webhooks')
            .select('*')
            .eq('user_id', auth.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ webhooks: webhooks || [] });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch webhooks' },
            { status: 500 }
        );
    }
}

// POST /api/webhooks — Create or test a webhook
export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const body = await req.json();
        const { action, url, events, name, webhook_id } = body;

        // Test webhook
        if (action === 'test' && webhook_id) {
            // Verify the webhook belongs to this user before testing
            const { data: owned } = await auth.supabase
                .from('webhooks')
                .select('id, url')
                .eq('id', webhook_id)
                .eq('user_id', auth.user.id)
                .single();

            if (!owned) {
                return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
            }

            const testUrl = url || owned.url;

            const payload = {
                event: 'test',
                timestamp: new Date().toISOString(),
                data: { message: 'Test webhook from RankMaster Pro' },
            };
            try {
                const res = await fetch(testUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(10000),
                });
                return NextResponse.json({ success: res.ok, status: res.status });
            } catch {
                return NextResponse.json({ success: false, error: 'Connection failed' });
            }
        }

        // Create webhook
        if (!url || !name) {
            return NextResponse.json({ error: 'url and name required' }, { status: 400 });
        }

        const { data, error } = await auth.supabase
            .from('webhooks')
            .insert({
                user_id: auth.user.id,
                name,
                url,
                events: events || ['content.published', 'rank.changed', 'decay.detected'],
                active: true,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ webhook: data });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create webhook' },
            { status: 500 }
        );
    }
}

// DELETE /api/webhooks — Delete a webhook
export async function DELETE(req: NextRequest) {
    try {
        const auth = await getAuthUser();
        if (auth.error) return auth.error;

        const id = req.nextUrl.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { error } = await auth.supabase
            .from('webhooks')
            .delete()
            .eq('id', id)
            .eq('user_id', auth.user.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete webhook' },
            { status: 500 }
        );
    }
}
