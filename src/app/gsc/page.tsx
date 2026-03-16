'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface GSCRow { key: string; clicks: number; impressions: number; ctr: string; position: string; }

export default function GSCPage() {
    const toast = useToast();
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [sites, setSites] = useState<{ url: string; permission: string }[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [days, setDays] = useState('28');
    const [dimension, setDimension] = useState('query');
    const [rows, setRows] = useState<GSCRow[]>([]);
    const [totals, setTotals] = useState({ clicks: 0, impressions: 0, ctr: '0' });
    const [loading, setLoading] = useState(false);
    const [setupSteps, setSetupSteps] = useState<string[]>([]);

    useEffect(() => {
        fetch('/api/gsc').then(r => r.json()).then(data => {
            setConfigured(data.configured);
            if (data.configured && data.sites) setSites(data.sites);
            if (data.steps) setSetupSteps(data.steps);
        }).catch(() => setConfigured(false));
    }, []);

    const fetchData = async () => {
        if (!selectedSite) { toast.warning('Select a site'); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/gsc?site_url=${encodeURIComponent(selectedSite)}&days=${days}&metric=${dimension}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setRows(data.rows || []);
            setTotals(data.totals || { clicks: 0, impressions: 0, ctr: '0' });
            toast.success(`Loaded ${data.rows?.length || 0} results`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Fetch failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Google Search Console</h1>
                        <p className="page-description">Real traffic data — clicks, impressions, CTR, and position</p>
                    </div>
                </div>

                {configured === false && (
                    <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent-warning)' }}>
                        <h3 style={{ margin: '0 0 12px' }}>⚙️ Setup Required</h3>
                        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
                            Google Search Console integration needs OAuth credentials. Follow these steps:
                        </p>
                        {setupSteps.map((step, i) => (
                            <div key={i} className="text-sm" style={{ marginBottom: 6, paddingLeft: 8 }}>{step}</div>
                        ))}
                        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener"
                            className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
                            🔗 Open Google Cloud Console
                        </a>
                    </div>
                )}

                {configured && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div className="grid-4" style={{ gap: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Site</label>
                                <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                    <option value="">Select site...</option>
                                    {sites.map(s => <option key={s.url} value={s.url}>{s.url}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Period</label>
                                <select className="form-select" value={days} onChange={e => setDays(e.target.value)}>
                                    <option value="7">Last 7 days</option>
                                    <option value="28">Last 28 days</option>
                                    <option value="90">Last 90 days</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Dimension</label>
                                <select className="form-select" value={dimension} onChange={e => setDimension(e.target.value)}>
                                    <option value="query">Queries</option>
                                    <option value="page">Pages</option>
                                    <option value="device">Devices</option>
                                    <option value="country">Countries</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={fetchData} disabled={loading} style={{ width: '100%' }}>
                                    {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Loading...</> : '📊 Fetch Data'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {rows.length > 0 && (
                    <>
                        <div className="grid-3" style={{ marginBottom: 24 }}>
                            <StatCard label="Total Clicks" value={totals.clicks.toLocaleString()} icon="🖱️" />
                            <StatCard label="Total Impressions" value={totals.impressions.toLocaleString()} icon="👁️" />
                            <StatCard label="Avg CTR" value={`${totals.ctr}%`} icon="📈" />
                        </div>
                        <div className="card">
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>{dimension === 'query' ? 'Query' : dimension === 'page' ? 'Page' : dimension.charAt(0).toUpperCase() + dimension.slice(1)}</th>
                                            <th>Clicks</th>
                                            <th>Impressions</th>
                                            <th>CTR</th>
                                            <th>Position</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.key}</td>
                                                <td>{row.clicks.toLocaleString()}</td>
                                                <td>{row.impressions.toLocaleString()}</td>
                                                <td><Badge variant={parseFloat(row.ctr) > 5 ? 'success' : parseFloat(row.ctr) > 2 ? 'warning' : 'danger'}>{row.ctr}%</Badge></td>
                                                <td><Badge variant={parseFloat(row.position) <= 10 ? 'success' : parseFloat(row.position) <= 20 ? 'warning' : 'danger'}>{row.position}</Badge></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {configured !== false && rows.length === 0 && (
                    <div className="card">
                        <EmptyState icon="📊" title="No Data Yet" description={configured ? "Select a site and fetch data to see search performance." : "Checking GSC configuration..."} />
                    </div>
                )}
            </main>
        </div>
    );
}
