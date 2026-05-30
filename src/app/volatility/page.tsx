'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Snapshot { id: string; snapshot_date: string; volatility_score: number; ranking_count: number; keywords_gained: number; keywords_lost: number; }
interface AlgoUpdate { name: string; date: string; type: string; description: string; avg_volatility_nearby?: number | null; }

export default function VolatilityPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [updates, setUpdates] = useState<AlgoUpdate[]>([]);
    const [loading, setLoading] = useState(false);
    const [snapping, setSnapping] = useState(false);

    useEffect(() => {
        fetch('/api/volatility').then(r => r.json()).then(d => {
            setSites(d.sites || []);
            setUpdates(d.known_updates || []);
        });
    }, []);

    useEffect(() => { if (siteId) loadData(); }, [siteId]);

    const loadData = async () => {
        setLoading(true);
        const res = await fetch(`/api/volatility?site_id=${siteId}&days=90`);
        const data = await res.json();
        setSnapshots(data.snapshots || []);
        setUpdates(data.known_updates || []);
        setLoading(false);
    };

    const takeSnapshot = async () => {
        if (!siteId) { toast.warning('Select a site'); return; }
        setSnapping(true);
        const res = await fetch('/api/volatility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'log_snapshot', site_id: siteId }) });
        const data = await res.json();
        toast.success(`Snapshot saved — volatility: ${data.volatility_score}/100`);
        loadData();
        setSnapping(false);
    };

    const correlate = async () => {
        if (!siteId) { toast.warning('Select a site'); return; }
        const res = await fetch('/api/volatility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'correlate', site_id: siteId, days: 90 }) });
        const data = await res.json();
        setUpdates(data.known_updates || []);
        setSnapshots(data.snapshots || []);
        toast.success('Correlated with known algo updates');
    };

    const volatilityColor = (s: number) => s >= 60 ? '#dc2626' : s >= 30 ? '#d97706' : '#16a34a';
    const lastSnap = snapshots[snapshots.length - 1];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">SERP Volatility</h1>
                        <p className="page-description">Track Google algorithm update impact on your rankings</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={correlate} disabled={!siteId}>Correlate Updates</button>
                        <button className="btn btn-primary btn-sm" onClick={takeSnapshot} disabled={!siteId || snapping}>
                            {snapping ? 'Snapping...' : '📸 Take Snapshot'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)} style={{ maxWidth: 300 }}>
                        <option value="">Select site...</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                {lastSnap && (
                    <div className="grid-3" style={{ gap: 16, marginBottom: 24 }}>
                        {[
                            { label: 'Volatility Score', value: `${lastSnap.volatility_score}/100`, icon: '📊', color: volatilityColor(lastSnap.volatility_score) },
                            { label: 'Keywords Ranking', value: lastSnap.ranking_count, icon: '🔑' },
                            { label: 'Last Snapshot', value: new Date(lastSnap.snapshot_date).toLocaleDateString(), icon: '📅' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: (s as { color?: string }).color || 'var(--text-primary)' }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="grid-2" style={{ gap: 16 }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Volatility History (90 days)</h3>
                        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                            : snapshots.length === 0 ? <EmptyState icon="📊" title="No Snapshots" description="Take your first snapshot to start tracking volatility" />
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {[...snapshots].reverse().map(s => (
                                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                                        <span className="text-sm">{s.snapshot_date}</span>
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            {(s.keywords_gained > 0 || s.keywords_lost > 0) && (
                                                <span className="text-sm">
                                                    {s.keywords_gained > 0 && <span style={{ color: '#16a34a' }}>+{s.keywords_gained}</span>}
                                                    {s.keywords_lost > 0 && <span style={{ color: '#dc2626' }}> -{s.keywords_lost}</span>}
                                                </span>
                                            )}
                                            <span style={{ fontWeight: 700, color: volatilityColor(s.volatility_score), minWidth: 60, textAlign: 'right' }}>
                                                {s.volatility_score}/100
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        }
                    </div>

                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Known Google Updates</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {updates.slice(0, 8).map((u, i) => (
                                <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{u.name}</span>
                                        <Badge variant={u.type === 'core' ? 'danger' : u.type === 'helpful_content' ? 'warning' : 'info'}>{u.type.replace('_', ' ')}</Badge>
                                    </div>
                                    <div className="text-sm text-muted">{u.date} · {u.description}</div>
                                    {u.avg_volatility_nearby !== null && u.avg_volatility_nearby !== undefined && (
                                        <div className="text-sm" style={{ color: volatilityColor(u.avg_volatility_nearby), marginTop: 4 }}>
                                            Your volatility nearby: {u.avg_volatility_nearby.toFixed(0)}/100
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
