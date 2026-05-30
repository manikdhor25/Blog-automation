'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface SerpResult {
    keyword: string;
    location: string;
    device: string;
    total_results: number;
    serp_features: string[];
    organic: Array<{
        position: number;
        url: string;
        title: string;
        description: string;
        domain: string;
        word_count_estimate?: number;
        da_estimate?: number;
    }>;
    people_also_ask: string[];
    related_searches: string[];
    featured_snippet?: { type: string; content: string; source_url: string };
    competition_score: number;
    opportunity_score: number;
    provider: string;
}

interface SavedQuery { id: string; keyword: string; location: string; last_checked: string; top_result: string; position_if_tracked?: number; }

export default function SerpDataPage() {
    const toast = useToast();
    const [keyword, setKeyword] = useState('');
    const [location, setLocation] = useState('United States');
    const [device, setDevice] = useState('desktop');
    const [result, setResult] = useState<SerpResult | null>(null);
    const [saved, setSaved] = useState<SavedQuery[]>([]);
    const [fetching, setFetching] = useState(false);
    const [tab, setTab] = useState<'search' | 'saved'>('search');

    useEffect(() => { loadSaved(); }, []);

    const loadSaved = async () => {
        const res = await fetch('/api/serp-data');
        const data = await res.json();
        setSaved(data.queries || []);
    };

    const search = async () => {
        if (!keyword) { toast.warning('Enter keyword'); return; }
        setFetching(true);
        const res = await fetch('/api/serp-data', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'search', keyword, location, device }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setFetching(false); return; }
        setResult(data.result);
        toast.success(`SERP loaded via ${data.result.provider}`);
        setFetching(false);
    };

    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Real SERP Data</h1>
                        <p className="page-description">Live Google results via ValueSERP/DataForSEO — competitor analysis, PAA, featured snippets</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['search', 'saved'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                        ))}
                    </div>
                </div>

                {tab === 'search' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desks 2025" style={{ flex: 2, minWidth: 200 }} onKeyDown={e => e.key === 'Enter' && search()} />
                                <input className="form-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" style={{ flex: 1, minWidth: 120 }} />
                                <select className="form-input" value={device} onChange={e => setDevice(e.target.value)} style={{ flex: '0 0 120px' }}>
                                    <option value="desktop">Desktop</option>
                                    <option value="mobile">Mobile</option>
                                </select>
                                <button className="btn btn-primary" onClick={search} disabled={fetching}>{fetching ? 'Fetching...' : '🔍 Search SERP'}</button>
                            </div>
                        </div>

                        {result && (
                            <>
                                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                                    {[
                                        { label: 'Total Results', value: result.total_results?.toLocaleString() || '—', icon: '📊' },
                                        { label: 'Competition', value: `${result.competition_score}/100`, icon: '⚔️', color: scoreColor(100 - result.competition_score) },
                                        { label: 'Opportunity', value: `${result.opportunity_score}/100`, icon: '🎯', color: scoreColor(result.opportunity_score) },
                                        { label: 'SERP Features', value: result.serp_features.length, icon: '✨' },
                                    ].map((s, i) => (
                                        <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                            <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{s.icon}</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: (s as { color?: string }).color || 'var(--text-primary)' }}>{s.value}</div>
                                            <div className="text-sm text-muted">{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {result.serp_features.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                                        {result.serp_features.map((f, i) => <Badge key={i} variant="info">{f}</Badge>)}
                                    </div>
                                )}

                                {result.featured_snippet && (
                                    <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #7c3aed' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>⭐ Featured Snippet ({result.featured_snippet.type})</div>
                                        <div className="text-sm" style={{ marginBottom: 6 }}>{result.featured_snippet.content}</div>
                                        <div className="text-sm text-muted">Source: {result.featured_snippet.source_url}</div>
                                    </div>
                                )}

                                <div className="card" style={{ marginBottom: 16 }}>
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Top 10 Organic Results</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {result.organic.map((r, i) => (
                                            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? 'var(--accent-primary)' : 'var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0, color: i < 3 ? '#fff' : 'var(--text-muted)' }}>
                                                    {r.position}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                                                    <div className="text-sm text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</div>
                                                    <div className="text-sm text-muted" style={{ marginTop: 2 }}>{r.description?.substring(0, 120)}</div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                                                    {r.da_estimate && <span className="text-sm text-muted">DA ~{r.da_estimate}</span>}
                                                    {r.word_count_estimate && <span className="text-sm text-muted">{r.word_count_estimate.toLocaleString()}w</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid-2" style={{ gap: 16 }}>
                                    {result.people_also_ask.length > 0 && (
                                        <div className="card">
                                            <h3 className="card-title" style={{ marginBottom: 10 }}>People Also Ask</h3>
                                            {result.people_also_ask.map((q, i) => (
                                                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <div className="text-sm">❓ {q}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {result.related_searches.length > 0 && (
                                        <div className="card">
                                            <h3 className="card-title" style={{ marginBottom: 10 }}>Related Searches</h3>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {result.related_searches.map((s, i) => (
                                                    <span key={i} style={{ background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: 12, fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => setKeyword(s)}>{s}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {!result && !fetching && (
                            <EmptyState icon="🔍" title="Enter keyword to fetch live SERP" description="Pulls real Google results including PAA, featured snippets, and competitor data" />
                        )}
                    </>
                )}

                {tab === 'saved' && (
                    <div className="card">
                        {saved.length === 0 ? <EmptyState icon="📊" title="No saved queries" description="Search a keyword to save it for tracking" /> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {saved.map((q, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{q.keyword}</div>
                                            <div className="text-sm text-muted">{q.location} · Last: {new Date(q.last_checked).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            {q.position_if_tracked && <Badge variant="info">#{q.position_if_tracked}</Badge>}
                                            <button className="btn btn-sm" onClick={() => { setKeyword(q.keyword); setTab('search'); }}>Re-check</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
