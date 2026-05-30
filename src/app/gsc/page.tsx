'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface GSCRow { key: string; clicks: number; impressions: number; ctr: string; position: string; }

// From /gsc-optimizer
interface Opportunity { id?: string; query: string; page: string; impressions: number; clicks: number; ctr: number; position: number; opportunity_score: number; potential_clicks: number; status?: string; }
interface OptResult { optimized_title: string; optimized_meta: string; title_changes: string[]; ctr_prediction: number; potential_monthly_clicks: number; a_b_variants?: Array<{ title: string; meta: string }>; }

export default function GSCPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('main');
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [sites, setSites] = useState<{ url: string; permission: string }[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [days, setDays] = useState('28');
    const [dimension, setDimension] = useState('query');
    const [rows, setRows] = useState<GSCRow[]>([]);
    const [totals, setTotals] = useState({ clicks: 0, impressions: 0, ctr: '0' });
    const [loading, setLoading] = useState(false);
    const [setupSteps, setSetupSteps] = useState<string[]>([]);

    // CTR Optimizer state
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [optSiteId, setOptSiteId] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [optimizing, setOptimizing] = useState<string | null>(null);
    const [optResult, setOptResult] = useState<Record<string, OptResult>>({});
    const [manualMode, setManualMode] = useState(false);
    const [manualQuery, setManualQuery] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const [manualMeta, setManualMeta] = useState('');
    const [manualImp, setManualImp] = useState('');
    const [manualClicks, setManualClicks] = useState('');
    const [manualPos, setManualPos] = useState('');

    useEffect(() => {
        fetch('/api/gsc').then(r => r.json()).then(data => {
            setConfigured(data.configured);
            if (data.configured && data.sites) setSites(data.sites);
            if (data.steps) setSetupSteps(data.steps);
        }).catch(() => setConfigured(false));
    }, []);

    useEffect(() => { if (optSiteId && activeTab === 'ctr-optimizer') loadOpportunities(); }, [optSiteId]);

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

    // CTR Optimizer functions
    const loadOpportunities = async () => {
        const res = await fetch(`/api/gsc-optimizer${optSiteId ? `?site_id=${optSiteId}` : ''}`);
        const data = await res.json();
        setOpportunities([...(data.opportunities || []), ...(data.gsc_data || [])].slice(0, 50));
    };

    const analyzeOpportunities = async () => {
        setAnalyzing(true);
        const res = await fetch('/api/gsc-optimizer', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'analyze', site_id: optSiteId || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || data.message || 'Failed'); } else {
            setOpportunities(data.opportunities || []);
            toast.success(`Found ${data.total} CTR opportunities`);
        }
        setAnalyzing(false);
    };

    const optimizeQuery = async (opp: Opportunity, currentTitle: string, currentMeta?: string) => {
        const key = opp.query;
        setOptimizing(key);
        const res = await fetch('/api/gsc-optimizer', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'optimize', query: opp.query, current_title: currentTitle, current_meta: currentMeta, impressions: opp.impressions, clicks: opp.clicks, position: opp.position, url: opp.page }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setOptResult(prev => ({ ...prev, [key]: data.result }));
            toast.success(`Optimized! Expected CTR: ${data.result.ctr_prediction}%`);
        }
        setOptimizing(null);
    };

    const manualOptimize = async () => {
        if (!manualQuery || !manualTitle) { toast.warning('Query and title required'); return; }
        setOptimizing('manual');
        const res = await fetch('/api/gsc-optimizer', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'optimize', query: manualQuery, current_title: manualTitle, current_meta: manualMeta || undefined, impressions: parseInt(manualImp) || 500, clicks: parseInt(manualClicks) || 5, position: parseFloat(manualPos) || 15 }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setOptResult(prev => ({ ...prev, manual: data.result }));
            toast.success('Optimized!');
        }
        setOptimizing(null);
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

                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>📊 Search Data</button>
                    <button className={`btn ${activeTab === 'ctr-optimizer' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('ctr-optimizer')}>⚡ CTR Optimizer</button>
                </div>

                {activeTab === 'main' && (
                    <>
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
                    </>
                )}

                {activeTab === 'ctr-optimizer' && (
                    <>
                        <div className="page-header" style={{ marginBottom: 16 }}>
                            <div>
                                <h3 style={{ fontWeight: 700 }}>CTR Optimizer</h3>
                                <p className="text-sm text-muted">Find high-impression / low-CTR keywords — AI rewrites titles and meta to boost clicks</p>
                            </div>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={manualMode} onChange={e => setManualMode(e.target.checked)} />
                                <span className="text-sm">Manual mode</span>
                            </label>
                        </div>

                        {manualMode ? (
                            <div className="grid-2" style={{ gap: 16 }}>
                                <div className="card">
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Manual Optimization</h3>
                                    <div className="form-group"><label className="form-label">Search Query *</label><input className="form-input" value={manualQuery} onChange={e => setManualQuery(e.target.value)} placeholder="best standing desks" /></div>
                                    <div className="form-group"><label className="form-label">Current Title *</label><input className="form-input" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Standing Desks Guide" /></div>
                                    <div className="form-group"><label className="form-label">Current Meta Description</label><textarea className="form-input" rows={2} value={manualMeta} onChange={e => setManualMeta(e.target.value)} placeholder="Current meta description..." /></div>
                                    <div className="grid-2" style={{ gap: 8 }}>
                                        <div><label className="form-label">Impressions/mo</label><input className="form-input" type="number" value={manualImp} onChange={e => setManualImp(e.target.value)} placeholder="1000" /></div>
                                        <div><label className="form-label">Clicks/mo</label><input className="form-input" type="number" value={manualClicks} onChange={e => setManualClicks(e.target.value)} placeholder="15" /></div>
                                        <div><label className="form-label">Position</label><input className="form-input" type="number" step="0.1" value={manualPos} onChange={e => setManualPos(e.target.value)} placeholder="12.5" /></div>
                                    </div>
                                    <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={manualOptimize} disabled={optimizing === 'manual'}>{optimizing === 'manual' ? 'Optimizing...' : '⚡ Optimize CTR'}</button>
                                </div>
                                {optResult.manual && (
                                    <div className="card animate-in">
                                        <h3 className="card-title" style={{ marginBottom: 12 }}>Optimized Results</h3>
                                        <div style={{ marginBottom: 10 }}>
                                            <div className="form-label">New Title</div>
                                            <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 4, fontWeight: 700 }}>{optResult.manual.optimized_title}</div>
                                        </div>
                                        <div style={{ marginBottom: 10 }}>
                                            <div className="form-label">New Meta Description</div>
                                            <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 4 }} className="text-sm">{optResult.manual.optimized_meta}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                                            <div><span className="text-sm text-muted">Expected CTR: </span><strong style={{ color: '#16a34a' }}>{optResult.manual.ctr_prediction}%</strong></div>
                                            <div><span className="text-sm text-muted">+Clicks/mo: </span><strong style={{ color: '#16a34a' }}>+{optResult.manual.potential_monthly_clicks}</strong></div>
                                        </div>
                                        <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(`Title: ${optResult.manual.optimized_title}\n\nMeta: ${optResult.manual.optimized_meta}`); toast.success('Copied'); }}>📋 Copy Both</button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="card" style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        <input className="form-input" value={optSiteId} onChange={e => setOptSiteId(e.target.value)} placeholder="Site ID (loads from GSC data)" style={{ flex: 1 }} />
                                        <button className="btn btn-primary" onClick={analyzeOpportunities} disabled={analyzing}>{analyzing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🔍 Find Opportunities'}</button>
                                    </div>
                                </div>

                                {opportunities.length === 0 ? (
                                    <EmptyState icon="📊" title="No CTR opportunities found" description="Connect Search Console at /gsc then return here. Or use Manual mode." />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {opportunities.map((opp, i) => (
                                            <div key={i} className="card" style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{opp.query}</div>
                                                        <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{opp.page}</div>
                                                        <div style={{ display: 'flex', gap: 12 }}>
                                                            <span className="text-sm"><strong>{opp.impressions?.toLocaleString()}</strong> imp</span>
                                                            <span className="text-sm"><strong>{opp.clicks}</strong> clicks</span>
                                                            <span className="text-sm" style={{ color: (opp.ctr || 0) < 0.02 ? '#dc2626' : '#d97706' }}><strong>{((opp.ctr || 0) * 100).toFixed(1)}%</strong> CTR</span>
                                                            <span className="text-sm">pos <strong>#{(opp.position || 0).toFixed(1)}</strong></span>
                                                            {opp.potential_clicks > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}>+{opp.potential_clicks} clicks potential</span>}
                                                        </div>
                                                    </div>
                                                    <button className="btn btn-sm btn-primary" onClick={() => optimizeQuery(opp, opp.query, '')} disabled={optimizing === opp.query}>{optimizing === opp.query ? '...' : '⚡ Optimize'}</button>
                                                </div>

                                                {optResult[opp.query] && (
                                                    <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0fdf4', borderRadius: 6 }}>
                                                        <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ Optimized</div>
                                                        <div className="text-sm" style={{ fontWeight: 700, marginBottom: 2 }}>{optResult[opp.query].optimized_title}</div>
                                                        <div className="text-sm text-muted">{optResult[opp.query].optimized_meta}</div>
                                                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                                            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(`${optResult[opp.query].optimized_title}\n${optResult[opp.query].optimized_meta}`); toast.success('Copied'); }}>📋</button>
                                                            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.85rem' }}>Expected CTR: {optResult[opp.query].ctr_prediction}%</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
