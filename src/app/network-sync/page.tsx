'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Transaction { id: string; network: string; merchant: string; sale_amount: number; commission: number; status: string; transaction_date: string; }
interface NetworkResult { network: string; transactions_count: number; total_commission: number; error?: string; }
interface NetworkSummary { by_network: Record<string, { total: number; confirmed: number; pending: number; count: number }>; total_commission: number; }

const NETWORK_ICONS: Record<string, string> = { shareasale: '🛒', cj: '🔗', impact: '⚡', rakuten: '🎌', awin: '🌐' };
const NETWORK_SETTINGS: Record<string, string[]> = {
    shareasale: ['shareasale_api_token', 'shareasale_api_secret', 'shareasale_affiliate_id'],
    cj: ['cj_api_key', 'cj_cid'],
    impact: ['impact_account_sid', 'impact_auth_token'],
};

export default function NetworkSyncPage() {
    const toast = useToast();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [summary, setSummary] = useState<NetworkSummary | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [tRes, sRes] = await Promise.all([
            fetch(`/api/network-sync?date_from=${dateFrom}`),
            fetch('/api/network-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_summary', date_from: dateFrom }) }),
        ]);
        const [tData, sData] = await Promise.all([tRes.json(), sRes.json()]);
        setTransactions(tData.transactions || []);
        setSummary(sData);
        setLoading(false);
    };

    const syncAll = async () => {
        setSyncing(true);
        const res = await fetch('/api/network-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_all', date_from: dateFrom, date_to: dateTo }) });
        const data = await res.json();
        const results: NetworkResult[] = data.results || [];
        const succeeded = results.filter(r => !r.error);
        const failed = results.filter(r => r.error);
        if (succeeded.length) toast.success(`Synced ${succeeded.length} networks — $${succeeded.reduce((s, r) => s + r.total_commission, 0).toFixed(2)} commissions`);
        if (failed.length) toast.error(`${failed.length} networks failed: ${failed.map(r => r.network).join(', ')}`);
        fetchAll();
        setSyncing(false);
    };

    const statusColor = (s: string) => ({ confirmed: '#16a34a', locked: '#16a34a', pending: '#d97706', reversed: '#dc2626' }[s] || '#6b7280');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Affiliate Network Sync</h1>
                        <p className="page-description">Auto-pull real sales data from ShareASale, CJ, Impact — no more manual logging</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={syncAll} disabled={syncing}>{syncing ? 'Syncing...' : '↻ Sync All Networks'}</button>
                </div>

                <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 16 }}>
                    <div className="text-sm" style={{ color: '#1e40af' }}>Configure network credentials in <a href="/settings" style={{ color: 'var(--color-primary)' }}>Settings</a> — ShareASale: shareasale_api_token/secret/affiliate_id · CJ: cj_api_key/cj_cid · Impact: impact_account_sid/impact_auth_token</div>
                </div>

                {summary && Object.keys(summary.by_network).length > 0 && (
                    <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
                        {Object.entries(summary.by_network).map(([network, data]) => (
                            <div key={network} className="card" style={{ padding: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: '1.3rem' }}>{NETWORK_ICONS[network] || '💰'}</span>
                                    <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{network}</span>
                                </div>
                                <div className="grid-2" style={{ gap: 6 }}>
                                    <div><div className="text-sm text-muted">Total</div><div style={{ fontWeight: 700, color: '#16a34a' }}>${data.total.toFixed(2)}</div></div>
                                    <div><div className="text-sm text-muted">Confirmed</div><div style={{ fontWeight: 700 }}>${data.confirmed.toFixed(2)}</div></div>
                                    <div><div className="text-sm text-muted">Pending</div><div>${data.pending.toFixed(2)}</div></div>
                                    <div><div className="text-sm text-muted">Transactions</div><div>{data.count}</div></div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">From</label>
                        <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">To</label>
                        <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                    </div>
                    <button className="btn btn-sm" onClick={fetchAll}>Filter</button>
                </div>

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : transactions.length === 0 ? <EmptyState icon="💰" title="No Transactions" description="Configure network credentials and click Sync All Networks" />
                        : <DataTable data={transactions as unknown as Record<string, unknown>[]} searchKeys={['merchant', 'network']} pageSize={25} columns={[
                            { key: 'network', label: 'Network', render: (r) => <span>{NETWORK_ICONS[String(r.network)] || '💰'} {String(r.network)}</span> },
                            { key: 'merchant', label: 'Merchant', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.merchant)}</span> },
                            { key: 'sale_amount', label: 'Sale', render: (r) => <span className="font-mono">${Number(r.sale_amount).toFixed(2)}</span> },
                            { key: 'commission', label: 'Commission', render: (r) => <span className="font-mono" style={{ fontWeight: 700, color: '#16a34a' }}>${Number(r.commission).toFixed(2)}</span> },
                            { key: 'status', label: 'Status', render: (r) => <span style={{ fontSize: '0.8rem', fontWeight: 600, color: statusColor(String(r.status)) }}>{String(r.status)}</span> },
                            { key: 'transaction_date', label: 'Date', render: (r) => <span className="text-sm text-muted">{String(r.transaction_date)}</span> },
                        ]} />
                    }
                </div>
            </main>
        </div>
    );
}
