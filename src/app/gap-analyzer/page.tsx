'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Gap { id: string; topic: string; content_type: string; search_intent: string; estimated_volume: string; difficulty: string; revenue_potential: string; why_important: string; suggested_title: string; priority_score: number; cluster: string; status: string; }

export default function GapAnalyzerPage() {
    const toast = useToast();
    const [gaps, setGaps] = useState<Gap[]>([]);
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [competitors, setCompetitors] = useState('');
    const [niche, setNiche] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [filterRevenue, setFilterRevenue] = useState('all');

    useEffect(() => { fetch('/api/gap-analyzer').then(r => r.json()).then(d => setSites(d.sites || [])); }, []);
    useEffect(() => { if (siteId) fetchGaps(); }, [siteId]);

    const fetchGaps = async () => {
        setLoading(true);
        const res = await fetch(`/api/gap-analyzer${siteId ? `?site_id=${siteId}` : ''}`);
        const data = await res.json();
        setGaps(data.gaps || []);
        setLoading(false);
    };

    const analyze = async () => {
        if (!siteId) { toast.warning('Select a site'); return; }
        setAnalyzing(true);
        const competitorList = competitors.split(',').map(s => s.trim()).filter(Boolean);
        const res = await fetch('/api/gap-analyzer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'analyze', site_id: siteId, competitor_domains: competitorList, niche }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setAnalyzing(false); return; }
        toast.success(`Found ${data.count} topic gaps via ${data.provider}`);
        fetchGaps();
        setAnalyzing(false);
    };

    const dismiss = async (id: string) => {
        await fetch('/api/gap-analyzer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss', id }) });
        setGaps(prev => prev.filter(g => g.id !== id));
    };

    const displayed = filterRevenue === 'all' ? gaps : gaps.filter(g => g.revenue_potential === filterRevenue);
    const revenueColor = (r: string) => ({ high: '#16a34a', medium: '#d97706', low: '#6b7280' }[r] || '#6b7280');
    const diffColor = (d: string) => ({ easy: '#16a34a', medium: '#d97706', hard: '#dc2626' }[d] || '#6b7280');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Topical Gap Analyzer</h1>
                        <p className="page-description">Find topics competitors rank for that you don't cover — article-level gap analysis</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 250px' }}>
                            <label className="form-label">Your Site *</label>
                            <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '1 1 300px' }}>
                            <label className="form-label">Competitor Domains <span className="text-muted text-sm">(comma-separated)</span></label>
                            <input className="form-input" value={competitors} onChange={e => setCompetitors(e.target.value)} placeholder="competitor1.com, competitor2.com" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance" style={{ width: 160 }} />
                        </div>
                        <button className="btn btn-primary" onClick={analyze} disabled={analyzing} style={{ marginBottom: 1 }}>
                            {analyzing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🔍 Find Gaps'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {['all', 'high', 'medium', 'low'].map(r => (
                        <button key={r} className={`btn btn-sm ${filterRevenue === r ? 'btn-primary' : ''}`} onClick={() => setFilterRevenue(r)}>
                            {r === 'all' ? `All (${gaps.length})` : `${r} revenue`}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
                    </div>
                ) : displayed.length === 0 ? (
                    <div className="card">
                        <EmptyState icon="🔍" title="No Gaps Found" description="Select a site and click Find Gaps to discover content opportunities" />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {displayed.map(gap => (
                            <div key={gap.id} className="card animate-in" style={{ padding: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700 }}>{gap.topic}</span>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: revenueColor(gap.revenue_potential), textTransform: 'uppercase' }}>{gap.revenue_potential} revenue</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                            <Badge variant="neutral">Score: {gap.priority_score}</Badge>
                                            <Badge variant="info">{gap.content_type}</Badge>
                                            <Badge variant={gap.search_intent === 'transactional' ? 'success' : gap.search_intent === 'commercial' ? 'warning' : 'info'}>{gap.search_intent}</Badge>
                                            <span style={{ fontSize: '0.75rem', color: diffColor(gap.difficulty), fontWeight: 600 }}>{gap.difficulty} difficulty</span>
                                            <span className="text-sm text-muted">vol: {gap.estimated_volume}</span>
                                        </div>
                                        <div className="text-sm" style={{ marginBottom: 4 }}><strong>Suggested title:</strong> {gap.suggested_title}</div>
                                        <div className="text-sm text-muted"><strong>Why it matters:</strong> {gap.why_important}</div>
                                        {gap.cluster && <div className="text-sm text-muted" style={{ marginTop: 4 }}>Cluster: {gap.cluster}</div>}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 100 }}>
                                        <a href={`/create?keyword=${encodeURIComponent(gap.topic)}`} className="btn btn-sm btn-success">Write →</a>
                                        <button className="btn btn-sm" onClick={() => dismiss(gap.id)}>Dismiss</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
