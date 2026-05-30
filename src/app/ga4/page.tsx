'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface PageMetric { page_path: string; sessions: number; pageviews: number; bounce_rate: number; avg_duration: number; }
interface Snapshot { snapshot_date: string; total_sessions: number; total_pageviews: number; }

export default function GA4Page() {
    const toast = useToast();
    const [metrics, setMetrics] = useState<PageMetric[]>([]);
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [configured, setConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [dateRange, setDateRange] = useState('30d');
    const [propertyId, setPropertyId] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
        fetchData();
    }, [dateRange, siteId]);

    const fetchData = async () => {
        setLoading(true);
        const res = await fetch(`/api/ga4${siteId ? `?site_id=${siteId}` : ''}${dateRange ? `&date_range=${dateRange}` : ''}`);
        const data = await res.json();
        setMetrics(data.metrics || []);
        setSnapshots(data.snapshots || []);
        setConfigured(data.configured);
        setLoading(false);
    };

    const sync = async () => {
        setSyncing(true);
        const res = await fetch('/api/ga4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', site_id: siteId || undefined, date_range: dateRange }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Sync failed'); setSyncing(false); return; }
        toast.success(`Synced ${data.synced} pages`);
        fetchData();
        setSyncing(false);
    };

    const connect = async () => {
        if (!propertyId || !accessToken) { toast.warning('Property ID and access token required'); return; }
        setConnecting(true);
        const res = await fetch('/api/ga4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', property_id: propertyId, access_token: accessToken }) });
        const data = await res.json();
        if (res.ok) { toast.success('GA4 connected'); setConfigured(true); fetchData(); }
        else toast.error(data.error || 'Connection failed');
        setConnecting(false);
    };

    const formatDuration = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Google Analytics 4</h1>
                        <p className="page-description">Traffic, bounce rate, session duration per post — correlate with SEO scores</p>
                    </div>
                    {configured && <button className="btn btn-primary btn-sm" onClick={sync} disabled={syncing}>{syncing ? 'Syncing...' : '↻ Sync GA4'}</button>}
                </div>

                {!configured ? (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Connect Google Analytics 4</h3>
                        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>Setup Steps:</div>
                            <div className="text-sm text-muted">1. Go to <a href="https://analytics.google.com" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>analytics.google.com</a> → Admin → Property Settings → get Property ID (e.g. 123456789)</div>
                            <div className="text-sm text-muted">2. Create OAuth token at <a href="https://console.cloud.google.com" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>Google Cloud Console</a> with Analytics API enabled</div>
                            <div className="text-sm text-muted">3. Or add <code>ga4_access_token</code> and <code>ga4_property_id</code> directly in Settings page</div>
                        </div>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">GA4 Property ID</label>
                                <input className="form-input" value={propertyId} onChange={e => setPropertyId(e.target.value)} placeholder="123456789" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">OAuth Access Token</label>
                                <input className="form-input" type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="ya29.a0..." />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary" onClick={connect} disabled={connecting}>{connecting ? 'Connecting...' : 'Connect GA4'}</button>
                            <a href="/settings" className="btn btn-sm">Configure in Settings →</a>
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                            <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)} style={{ maxWidth: 220 }}>
                                <option value="">All sites</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <select className="form-select" value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ maxWidth: 140 }}>
                                {[['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['6m', '6 months'], ['12m', '12 months']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </div>

                        {snapshots.length > 0 && (
                            <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
                                {[{ label: 'Total Sessions', value: (snapshots[0]?.total_sessions || 0).toLocaleString(), icon: '👥' }, { label: 'Total Pageviews', value: (snapshots[0]?.total_pageviews || 0).toLocaleString(), icon: '📄' }, { label: 'Pages Tracked', value: metrics.length, icon: '📊' }].map((s, i) => (
                                    <div key={i} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                                        <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{s.value}</div>
                                        <div className="text-sm text-muted">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="card">
                            {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                                : metrics.length === 0 ? <EmptyState icon="📊" title="No Data" description="Click Sync GA4 to pull your analytics data" />
                                : <DataTable data={metrics as unknown as Record<string, unknown>[]} searchKeys={['page_path']} pageSize={25} columns={[
                                    { key: 'page_path', label: 'Page', render: (r) => <code style={{ fontSize: '0.8rem' }}>{String(r.page_path).substring(0, 60)}</code> },
                                    { key: 'sessions', label: 'Sessions', render: (r) => <span className="font-mono" style={{ fontWeight: 700 }}>{Number(r.sessions).toLocaleString()}</span> },
                                    { key: 'pageviews', label: 'Pageviews', render: (r) => <span className="font-mono">{Number(r.pageviews).toLocaleString()}</span> },
                                    { key: 'bounce_rate', label: 'Bounce Rate', render: (r) => <span style={{ color: Number(r.bounce_rate) > 0.7 ? '#dc2626' : Number(r.bounce_rate) > 0.5 ? '#d97706' : '#16a34a' }}>{(Number(r.bounce_rate) * 100).toFixed(0)}%</span> },
                                    { key: 'avg_duration', label: 'Avg Duration', render: (r) => <span className="font-mono">{formatDuration(Number(r.avg_duration))}</span> },
                                ]} />
                            }
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
