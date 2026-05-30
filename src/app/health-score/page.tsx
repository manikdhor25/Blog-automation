'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

interface Dimension { score: number; max: number; label: string; issues: string[]; }
interface HealthData { score: number; grade: string; label: string; dimensions: Record<string, Dimension>; all_issues: string[]; stats: Record<string, number>; }

export default function HealthScorePage() {
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [data, setData] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => { fetch('/api/health-score').then(r => r.json()).then(d => setSites(d.sites || [])); }, []);

    const load = async (id: string) => {
        if (!id) return;
        setLoading(true);
        const res = await fetch(`/api/health-score?site_id=${id}`);
        const d = await res.json();
        setData(d);
        setLoading(false);
    };

    useEffect(() => { if (siteId) load(siteId); }, [siteId]);

    const gradeColor = (g: string) => ({ A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#ea580c', F: '#dc2626' }[g] || '#6b7280');
    const dimIcon = (key: string) => ({ content: '📝', keywords: '🔑', backlinks: '🔗', monetization: '💰', optimization: '⚡' }[key] || '📊');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Site Health Score</h1>
                        <p className="page-description">Single 0-100 score: content quality + rankings + links + monetization</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)} style={{ maxWidth: 300 }}>
                            <option value="">Select site...</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {siteId && <button className="btn btn-sm" onClick={() => load(siteId)}>Refresh</button>}
                    </div>
                </div>

                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                        <div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} />
                        <div style={{ fontWeight: 600 }}>Analyzing site health...</div>
                    </div>
                ) : data ? (
                    <>
                        {/* Score hero */}
                        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '32px 24px' }}>
                            <div style={{ fontSize: '5rem', fontWeight: 900, color: gradeColor(data.grade), lineHeight: 1 }}>{data.grade}</div>
                            <div style={{ fontSize: '3rem', fontWeight: 700, color: gradeColor(data.grade), marginTop: 8 }}>{data.score}/100</div>
                            <div style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginTop: 4 }}>{data.label}</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
                                {Object.entries(data.stats).map(([k, v]) => (
                                    <div key={k} style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{typeof v === 'number' && v % 1 !== 0 ? `$${v.toFixed(0)}` : v}</div>
                                        <div className="text-sm text-muted">{k.replace('_', ' ')}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Dimensions */}
                        <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
                            {Object.entries(data.dimensions).map(([key, dim]) => {
                                const pct = (dim.score / dim.max) * 100;
                                const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
                                return (
                                    <div key={key} className="card" style={{ padding: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <span style={{ fontWeight: 700 }}>{dimIcon(key)} {dim.label}</span>
                                            <span style={{ fontWeight: 700, color }}>{dim.score}/{dim.max}</span>
                                        </div>
                                        <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, marginBottom: 10 }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
                                        </div>
                                        {dim.issues.map((issue, i) => (
                                            <div key={i} className="text-sm" style={{ color: '#dc2626', marginBottom: 2 }}>⚠️ {issue}</div>
                                        ))}
                                        {dim.issues.length === 0 && <div className="text-sm" style={{ color: '#16a34a' }}>✅ No issues</div>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* All issues */}
                        {data.all_issues.length > 0 && (
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Action Items</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {data.all_issues.map((issue, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fca5a5' }}>
                                            <span style={{ color: '#dc2626' }}>⚠️</span>
                                            <span className="text-sm">{issue}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🏥</div>
                        <div style={{ fontWeight: 600 }}>Select a site to see its health score</div>
                    </div>
                )}
            </main>
        </div>
    );
}
