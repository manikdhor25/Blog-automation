'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Update { name: string; date: string; type: string; impact: string; summary: string; }
interface Impact { id: string; update_name: string; update_date?: string; traffic_change_pct: number; affected_pages: number; notes: string; recovery_status: string; created_at: string; }

const IMPACT_COLOR: Record<string, string> = { very_high: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' };
const TYPE_VARIANT: Record<string, 'danger' | 'warning' | 'info'> = { core: 'danger', hcu: 'warning', spam: 'info', reviews: 'info' };

export default function AlgoTrackerPage() {
    const toast = useToast();
    const [updates, setUpdates] = useState<Update[]>([]);
    const [impacts, setImpacts] = useState<Impact[]>([]);
    const [selectedUpdate, setSelectedUpdate] = useState('');
    const [siteId, setSiteId] = useState('');
    const [trafficChange, setTrafficChange] = useState('');
    const [affectedPages, setAffectedPages] = useState('');
    const [notes, setNotes] = useState('');
    const [logging, setLogging] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
    const [tab, setTab] = useState<'timeline' | 'log' | 'analysis'>('timeline');

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await fetch('/api/algo-tracker');
        const data = await res.json();
        setUpdates(data.updates || []);
        setImpacts(data.impacts || []);
    };

    const logImpact = async () => {
        if (!selectedUpdate || !trafficChange) { toast.warning('Select update and enter traffic change'); return; }
        setLogging(true);
        const res = await fetch('/api/algo-tracker', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'log_impact', update_name: selectedUpdate, site_id: siteId || undefined, traffic_change_pct: parseFloat(trafficChange), affected_pages: affectedPages ? parseInt(affectedPages) : 0, notes }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success('Impact logged');
            setTrafficChange(''); setNotes(''); setAffectedPages('');
            load(); setTab('timeline');
        }
        setLogging(false);
    };

    const analyze = async () => {
        if (!siteId) { toast.warning('Enter site ID'); return; }
        setAnalyzing(true);
        const res = await fetch('/api/algo-tracker', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'analyze', site_id: siteId }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setAnalysis(data.analysis);
            toast.success('Analysis complete');
            setTab('analysis');
        }
        setAnalyzing(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Algorithm Update Tracker</h1>
                        <p className="page-description">Log Google update impacts, correlate traffic changes, get AI recovery plan</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['timeline', 'log', 'analysis'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                        ))}
                    </div>
                </div>

                {tab === 'log' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Log Update Impact</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Algorithm Update *</label>
                                <select className="form-input" value={selectedUpdate} onChange={e => setSelectedUpdate(e.target.value)}>
                                    <option value="">Select update...</option>
                                    {updates.map((u, i) => <option key={i} value={u.name}>{u.name} ({u.date})</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Traffic Change % <span className="text-muted text-sm">(negative = drop)</span></label>
                                <input className="form-input" type="number" value={trafficChange} onChange={e => setTrafficChange(e.target.value)} placeholder="-35" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Site ID</label>
                                <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Affected Pages</label>
                                <input className="form-input" type="number" value={affectedPages} onChange={e => setAffectedPages(e.target.value)} placeholder="15" />
                            </div>
                            <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                <label className="form-label">Notes</label>
                                <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What patterns did you notice? Which pages were hit?" />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={logImpact} disabled={logging}>{logging ? 'Logging...' : '📊 Log Impact'}</button>
                    </div>
                )}

                {tab === 'analysis' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ margin: 0, flex: 1 }}>
                                <label className="form-label">Site ID for Analysis</label>
                                <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites" />
                            </div>
                            <button className="btn btn-primary" onClick={analyze} disabled={analyzing}>{analyzing ? 'Analyzing...' : '🤖 AI Analysis'}</button>
                        </div>
                        {analysis && (
                            <div>
                                <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 10 }}>
                                    <div className="form-label">Pattern</div>
                                    <div className="text-sm">{analysis.pattern as string}</div>
                                </div>
                                <div className="grid-2" style={{ gap: 12 }}>
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: 6, color: '#dc2626' }}>Likely Causes</div>
                                        {(analysis.likely_causes as string[])?.map((c, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}>• {c}</div>)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: 6, color: '#16a34a' }}>Recovery Steps</div>
                                        {(analysis.recovery_steps as string[])?.map((s, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}>• {s}</div>)}
                                    </div>
                                </div>
                                <div style={{ marginTop: 10, padding: '8px 10px', background: '#f0fdf4', borderRadius: 4 }}>
                                    <span className="text-sm text-muted">Timeline: </span>
                                    <strong className="text-sm">{analysis.timeline_estimate as string}</strong>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'timeline' && (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                            {updates.map((u, i) => {
                                const myImpact = impacts.find(imp => imp.update_name === u.name);
                                return (
                                    <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: IMPACT_COLOR[u.impact] || '#6b7280' }} />
                                            <div style={{ width: 1, background: 'var(--border-subtle)', flex: 1, marginTop: 4 }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 700 }}>{u.name}</span>
                                                <Badge variant={TYPE_VARIANT[u.type] || 'neutral'}>{u.type}</Badge>
                                                <span style={{ fontSize: '0.75rem', color: IMPACT_COLOR[u.impact] }}>{u.impact} impact</span>
                                            </div>
                                            <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{u.date} · {u.summary}</div>
                                            {myImpact && (
                                                <div style={{ padding: '4px 8px', background: myImpact.traffic_change_pct >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 4, display: 'inline-block' }}>
                                                    <span className="text-sm" style={{ fontWeight: 700, color: myImpact.traffic_change_pct >= 0 ? '#16a34a' : '#dc2626' }}>
                                                        My site: {myImpact.traffic_change_pct > 0 ? '+' : ''}{myImpact.traffic_change_pct}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        {!myImpact && <button className="btn btn-sm" onClick={() => { setSelectedUpdate(u.name); setTab('log'); }}>Log Impact</button>}
                                    </div>
                                );
                            })}
                        </div>

                        {impacts.length === 0 && <EmptyState icon="📊" title="No impacts logged" description="Log how each Google update affected your site to track patterns" />}
                    </>
                )}
            </main>
        </div>
    );
}
