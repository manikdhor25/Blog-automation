'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Opportunity { id?: string; query: string; page: string; impressions: number; clicks: number; ctr: number; position: number; opportunity_score: number; potential_clicks: number; status?: string; }
interface OptResult { optimized_title: string; optimized_meta: string; title_changes: string[]; ctr_prediction: number; potential_monthly_clicks: number; a_b_variants?: Array<{ title: string; meta: string }>; }

export default function GscOptimizerPage() {
    const toast = useToast();
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [siteId, setSiteId] = useState('');
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

    useEffect(() => { if (siteId) loadOpportunities(); }, [siteId]);

    const loadOpportunities = async () => {
        const res = await fetch(`/api/gsc-optimizer${siteId ? `?site_id=${siteId}` : ''}`);
        const data = await res.json();
        setOpportunities([...(data.opportunities || []), ...(data.gsc_data || [])].slice(0, 50));
    };

    const analyze = async () => {
        setAnalyzing(true);
        const res = await fetch('/api/gsc-optimizer', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'analyze', site_id: siteId || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || data.message || 'Failed'); } else {
            setOpportunities(data.opportunities || []);
            toast.success(`Found ${data.total} CTR opportunities`);
        }
        setAnalyzing(false);
    };

    const optimize = async (opp: Opportunity, currentTitle: string, currentMeta?: string) => {
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
                        <h1 className="page-title">GSC CTR Optimizer</h1>
                        <p className="page-description">Find high-impression / low-CTR keywords — AI rewrites titles and meta to boost clicks</p>
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
                                <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="Site ID (loads from GSC data)" style={{ flex: 1 }} />
                                <button className="btn btn-primary" onClick={analyze} disabled={analyzing}>{analyzing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🔍 Find Opportunities'}</button>
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
                                            <button className="btn btn-sm btn-primary" onClick={() => optimize(opp, opp.query, '')} disabled={optimizing === opp.query}>{optimizing === opp.query ? '...' : '⚡ Optimize'}</button>
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
            </main>
        </div>
    );
}
