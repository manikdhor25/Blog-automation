'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface SpyResult { domain: string; estimated_monthly_traffic: number; estimated_domain_authority: number; total_ranking_keywords: number; top_keywords: Array<{ keyword: string; position: number; search_volume: number; traffic_share_pct: number; intent: string; difficulty: number; content_type: string; opportunity_for_you: string; gap_reason: string }>; content_themes: string[]; top_pages_estimated: Array<{ title: string; slug: string; estimated_traffic: number; monetization: string }>; keyword_gaps: string[]; their_strengths: string[]; their_weaknesses: string[]; attack_strategy: string; data_source?: string; disclaimer?: string; }

const INTENT_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = { informational: 'info', commercial: 'warning', transactional: 'success', navigational: 'neutral' };
const OPP_COLOR: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };

export default function CompetitorSpyPage() {
    const toast = useToast();
    const [url, setUrl] = useState('');
    const [niche, setNiche] = useState('');
    const [depth, setDepth] = useState<'quick' | 'deep'>('quick');
    const [result, setResult] = useState<SpyResult | null>(null);
    const [history, setHistory] = useState<Array<{ id: string; domain: string; estimated_traffic: number; keywords_found: number; created_at: string }>>([]);
    const [scouting, setScouting] = useState(false);
    const [activeTab, setActiveTab] = useState<'keywords' | 'pages' | 'gaps'>('keywords');

    useEffect(() => { loadHistory(); }, []);

    const loadHistory = async () => {
        const res = await fetch('/api/competitor-spy');
        const data = await res.json();
        setHistory(data.results || []);
    };

    const spy = async () => {
        if (!url) { toast.warning('Enter competitor URL'); return; }
        setScouting(true);
        const res = await fetch('/api/competitor-spy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'spy', competitor_url: url, niche: niche || undefined, depth }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setScouting(false); return; }
        setResult(data.result);
        toast.success(`Spied on ${data.result.domain}`);
        loadHistory();
        setScouting(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Competitor Keyword Spy</h1>
                        <p className="page-description">Extract competitor keyword rankings, content gaps, and traffic sources</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://competitor.com" style={{ flex: 2, minWidth: 200 }} onKeyDown={e => e.key === 'Enter' && spy()} />
                        <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="Niche (optional)" style={{ flex: 1, minWidth: 120 }} />
                        <select className="form-input" value={depth} onChange={e => setDepth(e.target.value as 'quick' | 'deep')} style={{ flex: '0 0 100px' }}>
                            <option value="quick">Quick</option>
                            <option value="deep">Deep</option>
                        </select>
                        <button className="btn btn-primary" onClick={spy} disabled={scouting}>{scouting ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Spying...</> : '🕵️ Spy'}</button>
                    </div>
                </div>

                {result && (
                    <>
                        <div className="card" style={{ background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
                            ⚠️ <strong>AI estimate</strong> — figures are projected from niche patterns, not measured analytics. Connect a DataForSEO/SERP API for real competitor metrics.
                        </div>
                        <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'Monthly Traffic', value: result.estimated_monthly_traffic.toLocaleString(), icon: '📊' },
                                { label: 'Domain Authority', value: result.estimated_domain_authority, icon: '💪' },
                                { label: 'Ranking Keywords', value: result.total_ranking_keywords.toLocaleString(), icon: '🔍' },
                                { label: 'Keyword Gaps', value: result.keyword_gaps.length, icon: '🎯' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                    <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 className="card-title" style={{ marginBottom: 8 }}>Attack Strategy</h3>
                            <p className="text-sm">{result.attack_strategy}</p>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                            {(['keywords', 'pages', 'gaps'] as const).map(t => (
                                <button key={t} className={`btn btn-sm ${activeTab === t ? 'btn-primary' : ''}`} onClick={() => setActiveTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                            ))}
                        </div>

                        {activeTab === 'keywords' && (
                            <div className="card">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {result.top_keywords.map((kw, i) => (
                                        <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                                                    <span style={{ fontWeight: 600 }}>{kw.keyword}</span>
                                                    <Badge variant={INTENT_VARIANT[kw.intent]}>{kw.intent}</Badge>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: OPP_COLOR[kw.opportunity_for_you] }}>opp: {kw.opportunity_for_you}</span>
                                                </div>
                                                <div className="text-sm text-muted">{kw.gap_reason}</div>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontWeight: 700 }}>#{kw.position}</div>
                                                <div className="text-sm text-muted">{kw.search_volume.toLocaleString()}/mo</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'pages' && (
                            <div className="card">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {result.top_pages_estimated.map((p, i) => (
                                        <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{p.title}</div>
                                                <div className="text-sm text-muted">{p.slug}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 700 }}>{p.estimated_traffic.toLocaleString()}/mo</div>
                                                <Badge variant="info">{p.monetization}</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'gaps' && (
                            <div className="grid-2" style={{ gap: 16 }}>
                                <div className="card">
                                    <h3 className="card-title" style={{ marginBottom: 10 }}>🎯 Keyword Gaps (they rank, you don't)</h3>
                                    {result.keyword_gaps.map((g, i) => <div key={i} className="text-sm" style={{ marginBottom: 4, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>• {g}</div>)}
                                </div>
                                <div className="card">
                                    <div style={{ marginBottom: 16 }}>
                                        <h3 className="card-title" style={{ marginBottom: 8, color: '#dc2626' }}>💪 Their Strengths</h3>
                                        {result.their_strengths.map((s, i) => <div key={i} className="text-sm text-muted" style={{ marginBottom: 3 }}>• {s}</div>)}
                                    </div>
                                    <div>
                                        <h3 className="card-title" style={{ marginBottom: 8, color: '#16a34a' }}>😤 Their Weaknesses</h3>
                                        {result.their_weaknesses.map((s, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}>• {s}</div>)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {history.length > 0 && !result && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Previous Spy Sessions</h3>
                        {history.map((h, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontWeight: 600 }}>{h.domain}</span>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <span className="text-sm text-muted">{h.estimated_traffic.toLocaleString()}/mo traffic</span>
                                    <span className="text-sm text-muted">{h.keywords_found} keywords</span>
                                    <span className="text-sm text-muted">{new Date(h.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!result && history.length === 0 && <EmptyState icon="🕵️" title="Enter competitor URL to spy" description="Extract their keyword rankings, top pages, and content gaps you can exploit" />}
            </main>
        </div>
    );
}
