import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const ConnectSchema = z.object({
    action: z.literal('connect'),
    provider: z.enum(['convertkit', 'mailchimp', 'beehiiv', 'activecampaign', 'aweber']),
    api_key: z.string().min(1),
    api_secret: z.string().optional(),
    account_id: z.string().optional(),
    server_prefix: z.string().optional(),
    name: z.string().optional(),
});

const SyncSchema = z.object({
    action: z.literal('sync'),
    provider_id: z.string().uuid(),
});

const AddSubscriberSchema = z.object({
    action: z.literal('add_subscriber'),
    provider_id: z.string().uuid(),
    email: z.string().email(),
    first_name: z.string().optional(),
    tags: z.array(z.string()).default([]),
    list_id: z.string().optional(),
});

const SendCampaignSchema = z.object({
    action: z.literal('send_campaign'),
    provider_id: z.string().uuid(),
    subject: z.string().min(1),
    content: z.string().min(1),
    list_id: z.string().optional(),
    from_name: z.string().optional(),
    from_email: z.string().email().optional(),
    schedule_at: z.string().optional(),
});

// Provider API wrappers
async function testConvertKit(apiKey: string): Promise<{ valid: boolean; account?: unknown; subscriber_count?: number }> {
    try {
        const res = await fetch(`https://api.convertkit.com/v3/account?api_secret=${apiKey}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return { valid: false };
        const data = await res.json();
        const sub = await fetch(`https://api.convertkit.com/v3/subscribers?api_secret=${apiKey}&count=1`).then(r => r.json()).catch(() => null);
        return { valid: true, account: data, subscriber_count: sub?.total_subscribers || 0 };
    } catch { return { valid: false }; }
}

async function testMailchimp(apiKey: string, serverPrefix: string): Promise<{ valid: boolean; account?: unknown; subscriber_count?: number }> {
    try {
        const res = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0/`, {
            headers: { 'Authorization': `apikey ${apiKey}` }, signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { valid: false };
        const data = await res.json();
        return { valid: true, account: data, subscriber_count: data?.total_subscribers || 0 };
    } catch { return { valid: false }; }
}

async function testBeehiiv(apiKey: string, publicationId: string): Promise<{ valid: boolean; subscriber_count?: number }> {
    try {
        const res = await fetch(`https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions?limit=1`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { valid: false };
        const data = await res.json();
        return { valid: true, subscriber_count: data?.total_results || 0 };
    } catch { return { valid: false }; }
}

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('email_providers').select('id, name, provider, subscriber_count, is_active, last_synced, created_at').eq('user_id', user.id);
    return NextResponse.json({ providers: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'connect') {
        const parsed = ConnectSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        // Test connection
        let testResult: { valid: boolean; subscriber_count?: number } = { valid: false };
        if (d.provider === 'convertkit') testResult = await testConvertKit(d.api_key);
        else if (d.provider === 'mailchimp') testResult = await testMailchimp(d.api_key, d.server_prefix || 'us1');
        else if (d.provider === 'beehiiv') testResult = await testBeehiiv(d.api_key, d.account_id || '');
        else testResult = { valid: true }; // Other providers: trust the key

        if (!testResult.valid) return NextResponse.json({ error: 'Invalid API key â€” connection test failed' }, { status: 400 });

        const { data, error } = await supabase.from('email_providers').insert({
            user_id: user.id, name: d.name || d.provider, provider: d.provider,
            api_key: d.api_key, api_secret: d.api_secret || null,
            account_id: d.account_id || null, server_prefix: d.server_prefix || null,
            subscriber_count: testResult.subscriber_count || 0,
            is_active: true, last_synced: new Date().toISOString(),
        }).select('id, name, provider, subscriber_count, is_active').single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ provider: data, test_result: testResult });
    }

    if (body.action === 'sync') {
        const parsed = SyncSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

        const { data: provider } = await supabase.from('email_providers').select('*').eq('id', parsed.data.provider_id).eq('user_id', user.id).single();
        if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

        let count = provider.subscriber_count;
        if (provider.provider === 'convertkit') {
            const result = await testConvertKit(provider.api_key);
            count = result.subscriber_count || count;
        } else if (provider.provider === 'mailchimp') {
            const result = await testMailchimp(provider.api_key, provider.server_prefix || 'us1');
            count = result.subscriber_count || count;
        }

        await supabase.from('email_providers').update({ subscriber_count: count, last_synced: new Date().toISOString() }).eq('id', parsed.data.provider_id);
        return NextResponse.json({ synced: true, subscriber_count: count });
    }

    if (body.action === 'add_subscriber') {
        const parsed = AddSubscriberSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const { data: provider } = await supabase.from('email_providers').select('*').eq('id', d.provider_id).eq('user_id', user.id).single();
        if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

        let result = { added: false, message: '' };

        if (provider.provider === 'convertkit') {
            const res = await fetch(`https://api.convertkit.com/v3/subscribers`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_secret: provider.api_key, email: d.email, first_name: d.first_name, tags: d.tags }),
                signal: AbortSignal.timeout(8000),
            });
            result = { added: res.ok, message: res.ok ? 'Added to ConvertKit' : 'ConvertKit API error' };
        } else if (provider.provider === 'mailchimp') {
            const listId = d.list_id || provider.account_id;
            const res = await fetch(`https://${provider.server_prefix || 'us1'}.api.mailchimp.com/3.0/lists/${listId}/members`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `apikey ${provider.api_key}` },
                body: JSON.stringify({ email_address: d.email, status: 'subscribed', merge_fields: { FNAME: d.first_name || '' } }),
                signal: AbortSignal.timeout(8000),
            });
            result = { added: res.ok, message: res.ok ? 'Added to Mailchimp' : 'Mailchimp API error' };
        } else if (provider.provider === 'beehiiv') {
            const res = await fetch(`https://api.beehiiv.com/v2/publications/${provider.account_id}/subscriptions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.api_key}` },
                body: JSON.stringify({ email: d.email, reactivate_existing: false, send_welcome_email: true }),
                signal: AbortSignal.timeout(8000),
            });
            result = { added: res.ok, message: res.ok ? 'Added to Beehiiv' : 'Beehiiv API error' };
        }

        return NextResponse.json(result);
    }

    if (body.action === 'get_lists') {
        const { data: provider } = await supabase.from('email_providers').select('*').eq('id', body.provider_id).eq('user_id', user.id).single();
        if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

        let lists: Array<{ id: string; name: string; subscriber_count: number }> = [];

        if (provider.provider === 'mailchimp') {
            const res = await fetch(`https://${provider.server_prefix || 'us1'}.api.mailchimp.com/3.0/lists?count=20`, {
                headers: { 'Authorization': `apikey ${provider.api_key}` }
            });
            if (res.ok) {
                const data = await res.json();
                lists = (data.lists || []).map((l: { id: string; name: string; stats?: { member_count?: number } }) => ({ id: l.id, name: l.name, subscriber_count: l.stats?.member_count || 0 }));
            }
        } else if (provider.provider === 'convertkit') {
            const res = await fetch(`https://api.convertkit.com/v3/sequences?api_secret=${provider.api_key}`);
            if (res.ok) {
                const data = await res.json();
                lists = (data.sequences || []).map((s: { id: string; name: string }) => ({ id: String(s.id), name: s.name, subscriber_count: 0 }));
            }
        }

        return NextResponse.json({ lists });
    }

    if (body.action === 'disconnect') {
        await supabase.from('email_providers').delete().eq('id', body.provider_id).eq('user_id', user.id);
        return NextResponse.json({ disconnected: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
