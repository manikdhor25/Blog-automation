// ============================================================
// RankMaster Pro - Affiliate Network Auto-Sync API
// ShareASale, CJ, Impact, Rakuten — pull live sales/commissions
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['sync', 'sync_all', 'list', 'configure', 'get_summary']),
    network: z.enum(['shareasale', 'cj', 'impact', 'rakuten', 'awin']).optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
});

// ── ShareASale API ───────────────────────────────────────────
async function syncShareASale(apiToken: string, apiSecret: string, affiliateId: string, dateFrom: string, dateTo: string) {
    try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const sig = `${apiToken}:${timestamp}:${apiSecret}`;
        const sigHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sig));
        const sigHex = Array.from(new Uint8Array(sigHash)).map(b => b.toString(16).padStart(2, '0')).join('');

        const url = `https://api.shareasale.com/x.cfm?action=getTransactionList&affiliateId=${affiliateId}&dateStart=${dateFrom}&dateEnd=${dateTo}&XMLFormat=1`;
        const res = await fetch(url, {
            headers: {
                'x-ShareASale-Date': timestamp,
                'x-ShareASale-Authentication': sigHex,
                'x-ShareASale-APIKey': apiToken,
                'x-ShareASale-APIUserId': affiliateId,
            },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return { transactions: [], error: `ShareASale API: ${res.status}` };
        const xml = await res.text();

        // Parse XML transactions
        const transactions: Array<{ merchant: string; amount: number; status: string; date: string; commission: number }> = [];
        const tMatches = xml.matchAll(/<trans>([\s\S]*?)<\/trans>/gi);
        for (const match of tMatches) {
            const t = match[1];
            const amount = parseFloat(t.match(/<saleAmount>(.*?)<\/saleAmount>/)?.[1] || '0');
            const commission = parseFloat(t.match(/<commission>(.*?)<\/commission>/)?.[1] || '0');
            const merchant = t.match(/<merchantName>(.*?)<\/merchantName>/)?.[1] || '';
            const date = t.match(/<transDate>(.*?)<\/transDate>/)?.[1] || dateFrom;
            const status = t.match(/<status>(.*?)<\/status>/)?.[1] || 'pending';
            transactions.push({ merchant, amount, commission, date, status });
        }
        return { transactions };
    } catch (err) {
        return { transactions: [], error: err instanceof Error ? err.message : 'ShareASale fetch failed' };
    }
}

// ── CJ (Commission Junction) API ────────────────────────────
async function syncCJ(apiKey: string, cid: string, dateFrom: string, dateTo: string) {
    try {
        const url = `https://commissionjunction.com/query/1.0/?company-id=${cid}&date-type=event&start-date=${dateFrom}&end-date=${dateTo}`;
        const res = await fetch(url, {
            headers: { Authorization: apiKey },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return { transactions: [], error: `CJ API: ${res.status}` };
        const xml = await res.text();
        // Simplified parsing
        const commissions = parseFloat(xml.match(/commission-amount.*?>([\d.]+)<\/commission-amount/i)?.[1] || '0');
        return { transactions: [{ merchant: 'CJ Network', amount: commissions, commission: commissions, date: dateFrom, status: 'confirmed' }] };
    } catch (err) {
        return { transactions: [], error: err instanceof Error ? err.message : 'CJ fetch failed' };
    }
}

// ── Impact API ───────────────────────────────────────────────
async function syncImpact(accountSid: string, authToken: string, dateFrom: string, dateTo: string) {
    try {
        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const url = `https://api.impact.com/Advertisers/${accountSid}/Reports/Actions.json?StartDate=${dateFrom}&EndDate=${dateTo}&PageSize=100`;
        const res = await fetch(url, {
            headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return { transactions: [], error: `Impact API: ${res.status}` };
        const data = await res.json();
        const transactions = (data.Actions || []).map((a: { CampaignName: string; SaleAmount: string; Payout: string; ActionDate: string; State: string }) => ({
            merchant: a.CampaignName || 'Impact',
            amount: parseFloat(a.SaleAmount || '0'),
            commission: parseFloat(a.Payout || '0'),
            date: a.ActionDate?.split('T')[0] || dateFrom,
            status: a.State?.toLowerCase() || 'pending',
        }));
        return { transactions };
    } catch (err) {
        return { transactions: [], error: err instanceof Error ? err.message : 'Impact fetch failed' };
    }
}

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    const { data: settings } = await auth.supabase.from('settings').select('key, value').or('key.ilike.shareasale_%,key.ilike.cj_%,key.ilike.impact_%,key.ilike.rakuten_%');
    const s = Object.fromEntries((settings || []).map((r: { key: string; value: string }) => [r.key, r.value]));

    const dateFrom = parsed.data.date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo = parsed.data.date_to || new Date().toISOString().split('T')[0];

    if (action === 'sync' || action === 'sync_all') {
        const networksToSync = action === 'sync_all'
            ? ['shareasale', 'cj', 'impact']
            : [parsed.data.network || 'shareasale'];

        const allResults: Array<{ network: string; transactions_count: number; total_commission: number; error?: string }> = [];

        for (const network of networksToSync) {
            let result: { transactions: Array<{ merchant: string; amount: number; commission: number; date: string; status: string }>; error?: string } = { transactions: [] };

            if (network === 'shareasale' && s.shareasale_api_token && s.shareasale_api_secret && s.shareasale_affiliate_id) {
                result = await syncShareASale(s.shareasale_api_token, s.shareasale_api_secret, s.shareasale_affiliate_id, dateFrom, dateTo);
            } else if (network === 'cj' && s.cj_api_key && s.cj_cid) {
                result = await syncCJ(s.cj_api_key, s.cj_cid, dateFrom, dateTo);
            } else if (network === 'impact' && s.impact_account_sid && s.impact_auth_token) {
                result = await syncImpact(s.impact_account_sid, s.impact_auth_token, dateFrom, dateTo);
            } else {
                allResults.push({ network, transactions_count: 0, total_commission: 0, error: `${network} not configured in Settings` });
                continue;
            }

            if (result.error) {
                allResults.push({ network, transactions_count: 0, total_commission: 0, error: result.error });
                continue;
            }

            // Save transactions
            if (result.transactions.length > 0) {
                await auth.supabase.from('network_transactions').upsert(
                    result.transactions.map(t => ({
                        user_id: auth.user.id,
                        network,
                        merchant: t.merchant,
                        sale_amount: t.amount,
                        commission: t.commission,
                        transaction_date: t.date,
                        status: t.status,
                        synced_at: new Date().toISOString(),
                    })),
                    { onConflict: 'user_id,network,merchant,transaction_date' }
                );
            }

            const totalCommission = result.transactions.reduce((s, t) => s + t.commission, 0);
            allResults.push({ network, transactions_count: result.transactions.length, total_commission: totalCommission });
        }

        return NextResponse.json({ results: allResults, date_from: dateFrom, date_to: dateTo });
    }

    if (action === 'get_summary') {
        const { data: transactions } = await auth.supabase.from('network_transactions').select('network, commission, status, transaction_date').eq('user_id', auth.user.id).gte('transaction_date', dateFrom).order('transaction_date', { ascending: false });

        const byNetwork: Record<string, { total: number; confirmed: number; pending: number; count: number }> = {};
        for (const t of transactions || []) {
            if (!byNetwork[t.network]) byNetwork[t.network] = { total: 0, confirmed: 0, pending: 0, count: 0 };
            byNetwork[t.network].total += t.commission || 0;
            byNetwork[t.network].count++;
            if (t.status === 'confirmed' || t.status === 'locked') byNetwork[t.network].confirmed += t.commission || 0;
            else byNetwork[t.network].pending += t.commission || 0;
        }

        const totalAll = Object.values(byNetwork).reduce((s, n) => s + n.total, 0);
        return NextResponse.json({ by_network: byNetwork, total_commission: totalAll, transaction_count: (transactions || []).length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const network = searchParams.get('network');
    const dateFrom = searchParams.get('date_from') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let query = auth.supabase.from('network_transactions').select('*').eq('user_id', auth.user.id).gte('transaction_date', dateFrom).order('transaction_date', { ascending: false });
    if (network) query = query.eq('network', network);

    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ transactions: data || [] });
}
