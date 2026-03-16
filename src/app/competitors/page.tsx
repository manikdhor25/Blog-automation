'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, StatCard, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Competitor {
    domain: string; overlappingKeywords: number; avgPosition: number;
    contentCount: number; threat: 'high' | 'medium' | 'low'; urls?: string[];
    domainAuthority?: number | null; spamScore?: number | null;
}
interface ContentGap {
    keyword: string; competitorUrl?: string; competitorDomain: string;
    position: number; volume?: number; difficulty?: number; title?: string;
}
interface Site { id: string; name: string; url: string; niche: string; }

export default function CompetitorsPage() {
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [gaps, setGaps] = useState<ContentGap[]>([]);
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [niche, setNiche] = useState('');
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [tab, setTab] = useState<'overview' | 'gaps'>('overview');
    const [source, setSource] = useState('');

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    const handleAnalyze = async () => {
        const targetNiche = niche || sites.find(s => s.id === selectedSite)?.niche || '';
        if (!targetNiche) { toast.warning('Enter a niche or select a site'); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/competitors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ niche: targetNiche, site_id: selectedSite || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setCompetitors(data.competitors || []);
            setGaps(data.gaps || []);
            setSource(data.source || 'ai');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setLoading(false);
        }
    };

    const getThreatVariant = (t: string): 'danger' | 'warning' | 'success' =>
        t === 'high' ? 'danger' : t === 'medium' ? 'warning' : 'success';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Competitor Monitor</h1>
                        <p className="page-description">Real SERP-based competitor discovery and content gap analysis</p>
                    </div>
                    <div className="flex gap-2">
                        <button className={`btn ${tab === 'overview' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab('overview')}>🏢 Competitors</button>
                        <button className={`btn ${tab === 'gaps' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab('gaps')}>🔍 Content Gaps</button>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche / Industry</label>
                            <input className="form-input" placeholder="e.g., personal finance" value={niche} onChange={e => setNiche(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Compare Against Site</label>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading} style={{ width: '100%' }}>
                                {loading ? '⏳ Analyzing SERP...' : '🔍 Analyze Competitors'}
                            </button>
                        </div>
                    </div>
                    {source && <div className="text-sm text-muted" style={{ marginTop: 8 }}>Data source: <Badge variant={source === 'serp' ? 'success' : 'info'}>{source === 'serp' ? '🔍 Real SERP' : '🤖 AI Analysis'}</Badge></div>}
                </div>

                {competitors.length === 0 ? (
                    <div className="card">
                        <EmptyState icon="🏢" title="No Competitor Data" description="Enter your niche to discover real competing domains from Google search results and find content gaps." />
                    </div>
                ) : (
                    <>
                        <div className="stat-grid" style={{ marginBottom: 24 }}>
                            <StatCard label="Competitors Found" value={competitors.length} icon="🏢" />
                            <StatCard label="Content Gaps" value={gaps.length} icon="🔍" />
                            <StatCard label="High Threats" value={competitors.filter(c => c.threat === 'high').length} icon="🔴" />
                            <StatCard label="Avg Position" value={competitors.length ? Math.round(competitors.reduce((s, c) => s + c.avgPosition, 0) / competitors.length) : 0} icon="📊" />
                        </div>

                        {tab === 'overview' ? (
                            <div className="card">
                                <div className="card-header"><h2 className="card-title">🏢 Competing Domains</h2></div>
                                <div className="table-wrapper">
                                    <table className="data-table">
                                        <thead><tr><th>Domain</th><th>DA</th><th>Overlapping KWs</th><th>Avg Position</th><th>Content</th><th>Threat</th><th>Actions</th></tr></thead>
                                        <tbody>
                                            {competitors.map((c, i) => (
                                                <tr key={i}>
                                                    <td style={{ fontWeight: 600 }}>{c.domain}</td>
                                                    <td>
                                                        {c.domainAuthority != null ? (
                                                            <span style={{ fontWeight: 700, color: c.domainAuthority >= 50 ? 'var(--accent-success)' : c.domainAuthority >= 30 ? 'var(--accent-warning)' : 'var(--accent-danger)' }}>
                                                                {c.domainAuthority}
                                                            </span>
                                                        ) : <span className="text-muted">—</span>}
                                                    </td>
                                                    <td>{c.overlappingKeywords}</td>
                                                    <td>#{c.avgPosition}</td>
                                                    <td>{c.contentCount} pages</td>
                                                    <td><Badge variant={getThreatVariant(c.threat)}>{c.threat}</Badge></td>
                                                    <td>
                                                        <div className="flex gap-2">
                                                            <button className="btn btn-secondary btn-sm" onClick={() => setTab('gaps')}>📊 Gaps</button>
                                                            <a href={`/backlinks?tab=gap&competitor=${encodeURIComponent(c.domain)}`} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>🔗 Backlink Gap</a>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">🔍 Content Gaps ({gaps.length})</h2>
                                    <p className="card-subtitle">Keywords your competitors rank for — create content to capture this traffic</p>
                                </div>
                                <div className="table-wrapper">
                                    <table className="data-table">
                                        <thead><tr><th>Keyword</th><th>Competitor</th><th>Position</th>{gaps[0]?.volume !== undefined && <th>Volume</th>}{gaps[0]?.difficulty !== undefined && <th>Difficulty</th>}<th>Action</th></tr></thead>
                                        <tbody>
                                            {gaps.map((gap, i) => (
                                                <tr key={i}>
                                                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{gap.keyword}</td>
                                                    <td className="text-sm text-muted">{gap.competitorDomain}</td>
                                                    <td><Badge variant="info">#{gap.position}</Badge></td>
                                                    {gap.volume !== undefined && <td>{(gap.volume || 0).toLocaleString()}</td>}
                                                    {gap.difficulty !== undefined && (
                                                        <td><span style={{ color: (gap.difficulty || 0) > 60 ? 'var(--accent-danger)' : (gap.difficulty || 0) > 30 ? 'var(--accent-warning)' : 'var(--accent-success)', fontWeight: 600 }}>{gap.difficulty}</span></td>
                                                    )}
                                                    <td><a href={`/create?keyword=${encodeURIComponent(gap.keyword)}`} className="btn btn-primary btn-sm">✍️ Write</a></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
