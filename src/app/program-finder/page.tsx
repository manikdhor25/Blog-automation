'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Program { id?: string; name: string; network: string; commission_value: string; commission_type: string; cookie_days: number; estimated_epc?: string; category: string; apply_url: string; notes: string; revenue_potential?: string; status?: string; }

const REVENUE_COLORS: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };

export default function ProgramFinderPage() {
    const toast = useToast();
    const [niche, setNiche] = useState('');
    const [minCommission, setMinCommission] = useState(0);
    const [programs, setPrograms] = useState<Program[]>([]);
    const [saved, setSaved] = useState<Program[]>([]);
    const [finding, setFinding] = useState(false);
    const [activeTab, setActiveTab] = useState<'find' | 'saved'>('find');

    useEffect(() => {
        if (activeTab === 'saved') fetch('/api/program-finder?status=saved').then(r => r.json()).then(d => setSaved(d.programs || []));
    }, [activeTab]);

    const find = async () => {
        if (!niche) { toast.warning('Niche required'); return; }
        setFinding(true); setPrograms([]);
        const res = await fetch('/api/program-finder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'find', niche, min_commission: minCommission }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setFinding(false); return; }
        setPrograms(data.programs || []);
        toast.success(`Found ${data.count} programs via ${data.provider}`);
        setFinding(false);
    };

    const act = async (id: string, action: 'save' | 'dismiss') => {
        await fetch('/api/program-finder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }) });
        setPrograms(prev => prev.map(p => p.id === id ? { ...p, status: action === 'save' ? 'saved' : 'dismissed' } : p));
        if (action === 'save') toast.success('Saved to your list');
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Affiliate Program Finder</h1>
                        <p className="page-description">Discover high-commission programs in your niche — compare EPC, cookie, commission side-by-side</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'find' ? 'active' : ''}`} onClick={() => setActiveTab('find')}>Discover</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved ({saved.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {saved.length === 0 ? <EmptyState icon="💰" title="No Saved Programs" description="Discover and save programs you want to apply to" />
                            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                {saved.map((p, i) => (
                                    <div key={i} className="card" style={{ padding: 14 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
                                        <div className="text-sm text-muted">{p.network} · {p.category}</div>
                                        <div style={{ fontWeight: 700, color: '#16a34a', marginTop: 6 }}>{p.commission_value}</div>
                                        <div className="text-sm text-muted">{p.cookie_days} day cookie</div>
                                        {p.apply_url && <a href={p.apply_url} target="_blank" rel="noopener" className="btn btn-sm btn-primary" style={{ marginTop: 8, display: 'inline-block' }}>Apply →</a>}
                                    </div>
                                ))}
                            </div>
                        }
                    </div>
                ) : (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div className="form-group" style={{ margin: 0, flex: '1 1 250px' }}>
                                    <label className="form-label">Your Niche *</label>
                                    <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance, home improvement, fitness..." onKeyDown={e => e.key === 'Enter' && find()} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Min Commission (%)</label>
                                    <input type="number" className="form-input" value={minCommission} onChange={e => setMinCommission(parseFloat(e.target.value) || 0)} style={{ width: 110 }} />
                                </div>
                                <button className="btn btn-primary" onClick={find} disabled={finding} style={{ marginBottom: 1 }}>{finding ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Finding...</> : '🔍 Find Programs'}</button>
                            </div>
                        </div>

                        {programs.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                                {programs.map((p, i) => (
                                    <div key={i} className="card animate-in" style={{ padding: 14, opacity: p.status === 'dismissed' ? 0.4 : 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ fontWeight: 700 }}>{p.name}</div>
                                            {p.revenue_potential && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: REVENUE_COLORS[p.revenue_potential] }}>{p.revenue_potential}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                            <Badge variant="neutral">{p.network}</Badge>
                                            <Badge variant="info">{p.category}</Badge>
                                        </div>
                                        <div className="grid-2" style={{ gap: 6, marginBottom: 10 }}>
                                            <div><div className="text-sm text-muted">Commission</div><div style={{ fontWeight: 700, color: '#16a34a' }}>{p.commission_value}</div></div>
                                            <div><div className="text-sm text-muted">Cookie</div><div style={{ fontWeight: 600 }}>{p.cookie_days} days</div></div>
                                            {p.estimated_epc && <div><div className="text-sm text-muted">Est. EPC</div><div style={{ fontWeight: 600 }}>{p.estimated_epc}</div></div>}
                                        </div>
                                        <div className="text-sm text-muted" style={{ marginBottom: 10 }}>{p.notes}</div>
                                        {p.status !== 'dismissed' && (
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {p.id && <button className="btn btn-sm btn-primary" onClick={() => act(p.id!, 'save')}>Save</button>}
                                                {p.apply_url && <a href={p.apply_url} target="_blank" rel="noopener" className="btn btn-sm btn-success">Apply →</a>}
                                                {p.id && <button className="btn btn-sm" onClick={() => act(p.id!, 'dismiss')}>Dismiss</button>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : !finding ? (
                            <div className="card"><EmptyState icon="💰" title="Find Affiliate Programs" description="Enter your niche to discover high-commission programs worth joining" /></div>
                        ) : null}
                    </>
                )}
            </main>
        </div>
    );
}
