'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface AdEntry {
    id: string;
    network: string;
    date: string;
    impressions: number;
    clicks: number;
    rpm: number;
    epmv: number;
    revenue: number;
    sessions: number;
    notes: string | null;
}

interface AdSummary {
    total_revenue: number;
    blended_epmv: number;
    total_sessions: number;
    by_network: Record<string, { revenue: number; impressions: number; clicks: number; rpm: number; sessions: number }>;
}

export default function AdRevenuePage() {
    const toast = useToast();
    const [entries, setEntries] = useState<AdEntry[]>([]);
    const [summary, setSummary] = useState<AdSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [days, setDays] = useState(30);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'entries'>('overview');
    const [form, setForm] = useState({ network: 'adsense', date: new Date().toISOString().split('T')[0], impressions: '', clicks: '', rpm: '', revenue: '', sessions: '', notes: '' });

    useEffect(() => { fetchAll(); }, [days]);

    const fetchAll = async () => {
        setLoading(true);
        const [entriesRes, summaryRes] = await Promise.all([
            fetch(`/api/ad-revenue?days=${days}`),
            fetch('/api/ad-revenue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_summary' }) }),
        ]);
        const [entriesData, summaryData] = await Promise.all([entriesRes.json(), summaryRes.json()]);
        setEntries(entriesData.entries || []);
        setSummary(summaryData.summary || null);
        setLoading(false);
    };

    const syncAdSense = async () => {
        setSyncing(true);
        const res = await fetch('/api/ad-revenue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_adsense' }) });
        const data = await res.json();
        if (res.ok) { toast.success(`Synced: $${data.synced?.revenue?.toFixed(2)}`); fetchAll(); }
        else toast.error(data.error || 'Sync failed');
        setSyncing(false);
    };

    const logManual = async () => {
        if (!form.revenue) { toast.warning('Revenue required'); return; }
        const res = await fetch('/api/ad-revenue', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'log_revenue', ...form, revenue: parseFloat(form.revenue), impressions: parseInt(form.impressions || '0'), clicks: parseInt(form.clicks || '0'), rpm: parseFloat(form.rpm || '0'), sessions: parseInt(form.sessions || '0') }),
        });
        if (res.ok) { toast.success('Revenue logged'); setShowManualEntry(false); fetchAll(); }
        else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    };

    const networkIcon = (n: string) => ({ adsense: '💰', mediavine: '🎯', ezoic: '⚡', raptive: '🚀', adthrive: '📈', manual: '📝' }[n] || '💵');
    const networks = ['adsense', 'mediavine', 'ezoic', 'raptive', 'adthrive', 'manual'];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Ad Revenue</h1>
                        <p className="page-description">AdSense, Mediavine, Ezoic — unified RPM/EPMV dashboard</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={syncAdSense} disabled={syncing}>
                            {syncing ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Syncing...</> : '↻ Sync AdSense'}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowManualEntry(true)}>+ Log Revenue</button>
                    </div>
                </div>

                {/* Summary */}
                {summary && (
                    <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                        {[
                            { label: '30-Day Revenue', value: `$${summary.total_revenue.toFixed(2)}`, icon: '💰' },
                            { label: 'Blended EPMV', value: `$${summary.blended_epmv.toFixed(2)}`, icon: '📊' },
                            { label: 'Total Sessions', value: summary.total_sessions.toLocaleString(), icon: '👥' },
                            { label: 'Active Networks', value: Object.keys(summary.by_network).length, icon: '🌐' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* By Network */}
                {summary && Object.keys(summary.by_network).length > 0 && (
                    <div className="grid-3" style={{ gap: 12, marginBottom: 24 }}>
                        {Object.entries(summary.by_network).map(([network, data]) => (
                            <div key={network} className="card" style={{ padding: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <span style={{ fontSize: '1.4rem' }}>{networkIcon(network)}</span>
                                    <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{network}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <div>
                                        <div className="text-sm text-muted">Revenue</div>
                                        <div style={{ fontWeight: 700, color: '#16a34a' }}>${data.revenue.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted">RPM</div>
                                        <div style={{ fontWeight: 700 }}>${data.rpm.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted">Impressions</div>
                                        <div>{data.impressions.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted">Sessions</div>
                                        <div>{data.sessions.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Manual Entry */}
                {showManualEntry && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header">
                            <h3 className="card-title">Log Ad Revenue</h3>
                            <button className="btn btn-sm" onClick={() => setShowManualEntry(false)}>✕</button>
                        </div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Network</label>
                                <select className="form-select" value={form.network} onChange={e => setForm(f => ({ ...f, network: e.target.value }))}>
                                    {networks.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Date</label>
                                <input type="date" className="form-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Revenue ($) *</label>
                                <input type="number" step="0.01" className="form-input" value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Impressions</label>
                                <input type="number" className="form-input" value={form.impressions} onChange={e => setForm(f => ({ ...f, impressions: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Sessions</label>
                                <input type="number" className="form-input" value={form.sessions} onChange={e => setForm(f => ({ ...f, sessions: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">RPM ($)</label>
                                <input type="number" step="0.01" className="form-input" value={form.rpm} onChange={e => setForm(f => ({ ...f, rpm: e.target.value }))} />
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={logManual}>Log Revenue</button>
                    </div>
                )}

                {/* Integration Setup */}
                <div className="card" style={{ marginBottom: 16 }}>
                    <h3 className="card-title" style={{ marginBottom: 12 }}>Network Setup</h3>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {[
                            { id: 'adsense', name: 'AdSense', key: 'adsense_access_token', pub_key: 'adsense_publisher_id', docs: 'OAuth2 token + publisher ID' },
                            { id: 'mediavine', name: 'Mediavine', key: 'mediavine_api_key', docs: 'API key from Mediavine dashboard' },
                            { id: 'ezoic', name: 'Ezoic', key: 'ezoic_api_key', docs: 'API key from Ezoic settings' },
                        ].map(n => (
                            <div key={n.id} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: '1.3rem' }}>{networkIcon(n.id)}</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{n.name}</div>
                                    <div className="text-sm text-muted">{n.docs}</div>
                                </div>
                                <a href="/settings" className="btn btn-sm">Configure</a>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Date range + entries */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                    <span className="text-sm text-muted">Show:</span>
                    {[7, 30, 90].map(d => (
                        <button key={d} className={`btn btn-sm ${days === d ? 'btn-primary' : ''}`} onClick={() => setDays(d)}>{d} days</button>
                    ))}
                </div>

                <div className="card">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
                        </div>
                    ) : entries.length === 0 ? (
                        <EmptyState icon="💰" title="No Revenue Data" description="Log your first ad revenue entry or sync AdSense to get started" />
                    ) : (
                        <DataTable
                            data={entries as unknown as Record<string, unknown>[]}
                            searchKeys={['network', 'date', 'notes']}
                            pageSize={25}
                            columns={[
                                { key: 'date', label: 'Date', render: (r) => <span className="font-mono text-sm">{String(r.date)}</span> },
                                { key: 'network', label: 'Network', render: (r) => <span>{networkIcon(String(r.network))} {String(r.network)}</span> },
                                { key: 'revenue', label: 'Revenue', render: (r) => <span className="font-mono" style={{ fontWeight: 700, color: '#16a34a' }}>${Number(r.revenue).toFixed(2)}</span> },
                                { key: 'rpm', label: 'RPM', render: (r) => <span className="font-mono">${Number(r.rpm).toFixed(2)}</span> },
                                { key: 'impressions', label: 'Impressions', render: (r) => <span className="font-mono">{Number(r.impressions).toLocaleString()}</span> },
                                { key: 'clicks', label: 'Clicks', render: (r) => <span className="font-mono">{Number(r.clicks).toLocaleString()}</span> },
                                { key: 'sessions', label: 'Sessions', render: (r) => <span className="font-mono">{Number(r.sessions).toLocaleString()}</span> },
                                {
                                    key: 'actions', label: '', render: (r) => (
                                        <button className="btn btn-sm btn-danger" onClick={async () => {
                                            await fetch('/api/ad-revenue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) });
                                            fetchAll();
                                        }}>Del</button>
                                    )
                                },
                            ]}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}
