'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface CWVResult { id?: string; url: string; strategy: string; lcp: number | null; cls: number | null; inp: number | null; ttfb: number | null; performance_score: number; opportunities: Array<{ title: string; displayValue: string }>; checked_at: string; }
interface Summary { total: number; avg_performance: number; poor_pages: number; }

export default function CWVPage() {
    const toast = useToast();
    const [url, setUrl] = useState('');
    const [siteId, setSiteId] = useState('');
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [strategy, setStrategy] = useState<'mobile' | 'desktop' | 'both'>('mobile');
    const [results, setResults] = useState<CWVResult[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
        fetch('/api/cwv').then(r => r.json()).then(d => { setResults(d.results || []); setSummary(d.summary || null); });
    }, []);

    const checkUrl = async () => {
        if (!url) { toast.warning('URL required'); return; }
        setChecking(true);
        const res = await fetch('/api/cwv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check_url', url, strategy }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed — check pagespeed_api_key in Settings'); setChecking(false); return; }
        toast.success(`Checked ${data.results?.length} results`);
        setResults(prev => [...(data.results || []), ...prev]);
        setChecking(false);
    };

    const checkSite = async () => {
        if (!siteId) { toast.warning('Select a site'); return; }
        setLoading(true);
        const res = await fetch('/api/cwv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check_site', site_id: siteId, strategy }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setLoading(false); return; }
        toast.success(`Checked ${data.count} pages`);
        setResults(prev => [...(data.results || []), ...prev]);
        setLoading(false);
    };

    const perfColor = (s: number) => s >= 90 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626';
    const perfLabel = (s: number) => s >= 90 ? 'Good' : s >= 50 ? 'Needs Work' : 'Poor';
    const lcpLabel = (ms: number) => ms <= 2500 ? 'Good' : ms <= 4000 ? 'Needs Work' : 'Poor';
    const clsLabel = (cls: number) => cls <= 0.1 ? 'Good' : cls <= 0.25 ? 'Needs Work' : 'Poor';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Core Web Vitals</h1>
                        <p className="page-description">LCP, CLS, INP, TTFB via PageSpeed Insights — track performance per post, correlate with rankings</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0, flex: '1 1 300px' }}>
                            <label className="form-label">Check Single URL</label>
                            <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yoursite.com/post-slug/" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Strategy</label>
                            <select className="form-select" value={strategy} onChange={e => setStrategy(e.target.value as typeof strategy)}>
                                <option value="mobile">Mobile</option>
                                <option value="desktop">Desktop</option>
                                <option value="both">Both</option>
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={checkUrl} disabled={checking} style={{ marginBottom: 1 }}>{checking ? 'Checking...' : 'Check URL'}</button>
                        <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>or</span>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 200px' }}>
                            <label className="form-label">Check Site (top 5 posts)</label>
                            <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <button className="btn btn-sm" onClick={checkSite} disabled={!siteId || loading} style={{ marginBottom: 1 }}>{loading ? 'Checking...' : 'Check Site'}</button>
                    </div>
                    <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Requires <code>pagespeed_api_key</code> in Settings (free at Google Cloud Console)</div>
                </div>

                {summary && (
                    <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
                        {[{ label: 'Pages Checked', value: summary.total, icon: '📄' }, { label: 'Avg Performance', value: `${summary.avg_performance}/100`, icon: '⚡', color: perfColor(summary.avg_performance) }, { label: 'Poor Pages', value: summary.poor_pages, icon: '🚨', color: summary.poor_pages > 0 ? '#dc2626' : '#16a34a' }].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                                <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color || 'var(--text-primary)' }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="card">
                    {results.length === 0 ? <EmptyState icon="⚡" title="No Results" description="Check a URL or site to see Core Web Vitals" />
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {results.map((r, i) => (
                                <div key={i} className="card" style={{ padding: 14, borderLeft: `3px solid ${perfColor(r.performance_score)}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{r.url}</div>
                                            <div className="text-sm text-muted">{r.strategy} · {new Date(r.checked_at).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: perfColor(r.performance_score) }}>{r.performance_score}</div>
                                            <Badge variant={r.performance_score >= 90 ? 'success' : r.performance_score >= 50 ? 'warning' : 'danger'}>{perfLabel(r.performance_score)}</Badge>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: r.opportunities.length > 0 ? 10 : 0 }}>
                                        {[
                                            { label: 'LCP', value: r.lcp ? `${(r.lcp / 1000).toFixed(1)}s` : '—', good: r.lcp !== null && r.lcp <= 2500 },
                                            { label: 'CLS', value: r.cls !== null ? String(r.cls) : '—', good: r.cls !== null && r.cls <= 0.1 },
                                            { label: 'INP', value: r.inp ? `${r.inp}ms` : '—', good: r.inp !== null && r.inp <= 200 },
                                            { label: 'TTFB', value: r.ttfb ? `${r.ttfb}ms` : '—', good: r.ttfb !== null && r.ttfb <= 800 },
                                        ].map((m, j) => (
                                            <div key={j} style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                                                <div className="text-sm text-muted">{m.label}</div>
                                                <div style={{ fontWeight: 700, color: m.value === '—' ? 'var(--text-muted)' : m.good ? '#16a34a' : '#dc2626' }}>{m.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {r.opportunities.length > 0 && (
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 4 }}>Opportunities</div>
                                            {r.opportunities.map((o, j) => <div key={j} className="text-sm text-muted" style={{ marginBottom: 2 }}>• {o.title} {o.displayValue && `— ${o.displayValue}`}</div>)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    }
                </div>
            </main>
        </div>
    );
}
