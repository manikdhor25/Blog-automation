'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ScoreResult { score: number; grade: string; monthly_revenue_potential: number; dimensions: Record<string, { score: number; assessment: string; recommendation: string; missing_products?: string[]; issues?: string[] }>; affiliate_products_to_add: Array<{ product: string; type: string; placement: string; estimated_monthly: number }>; quick_wins: Array<{ action: string; effort: string; revenue_impact: string; estimated_monthly_gain: number }>; missing_ctas: string[]; content_gaps_for_more_revenue: string[]; }
interface SavedScore { id: string; title: string; score: number; grade: string; revenue_potential: number; quick_wins_count: number; scored_at: string; }

const GRADE_BG: Record<string, string> = { 'A+': '#f0fdf4', A: '#f0fdf4', B: '#f7fee7', C: '#fefce8', D: '#fff7ed', F: '#fef2f2' };
const GRADE_COLOR: Record<string, string> = { 'A+': '#16a34a', A: '#16a34a', B: '#65a30d', C: '#d97706', D: '#ea580c', F: '#dc2626' };

export default function MonetizationScorePage() {
    const toast = useToast();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [niche, setNiche] = useState('');
    const [traffic, setTraffic] = useState('');
    const [result, setResult] = useState<ScoreResult | null>(null);
    const [saved, setSaved] = useState<SavedScore[]>([]);
    const [scoring, setScoring] = useState(false);
    const [bulkSiteId, setBulkSiteId] = useState('');
    const [bulkScoring, setBulkScoring] = useState(false);

    useEffect(() => { loadSaved(); }, []);

    const loadSaved = async () => {
        const res = await fetch('/api/monetization-score');
        const data = await res.json();
        setSaved(data.scores || []);
    };

    const score = async () => {
        if (!title || !content) { toast.warning('Title and content required'); return; }
        setScoring(true);
        const res = await fetch('/api/monetization-score', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'score', title, content, niche: niche || undefined, current_monthly_traffic: traffic ? parseInt(traffic) : 0 }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setScoring(false); return; }
        setResult(data.result);
        toast.success(`Score: ${data.result.score}/100 (${data.result.grade})`);
        loadSaved();
        setScoring(false);
    };

    const bulkScore = async () => {
        if (!bulkSiteId) { toast.warning('Enter site ID'); return; }
        setBulkScoring(true);
        const res = await fetch('/api/monetization-score', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'bulk_score', site_id: bulkSiteId, limit: 20 }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success(`Scored ${data.scored} posts`);
            loadSaved();
        }
        setBulkScoring(false);
    };

    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Monetization Scorer</h1>
                        <p className="page-description">Score every post's earning potential — find missing affiliate links, CTAs, and revenue gaps</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Post Title *</label>
                            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Best Standing Desks for 2025" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="home office" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Monthly Traffic</label>
                            <input className="form-input" type="number" value={traffic} onChange={e => setTraffic(e.target.value)} placeholder="1000" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Content *</label>
                        <textarea className="form-input" rows={6} value={content} onChange={e => setContent(e.target.value)} placeholder="Paste your post content here..." style={{ fontFamily: 'inherit' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="btn btn-primary" onClick={score} disabled={scoring}>{scoring ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Scoring...</> : '💰 Score Post'}</button>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input className="form-input" value={bulkSiteId} onChange={e => setBulkSiteId(e.target.value)} placeholder="Site ID for bulk scoring" style={{ width: 280 }} />
                            <button className="btn btn-sm" onClick={bulkScore} disabled={bulkScoring}>{bulkScoring ? 'Scoring...' : '📊 Bulk Score Site'}</button>
                        </div>
                    </div>
                </div>

                {result && (
                    <>
                        <div className="card" style={{ marginBottom: 16, background: GRADE_BG[result.grade] || 'var(--bg-card)', textAlign: 'center', padding: '24px' }}>
                            <div style={{ fontSize: '4rem', fontWeight: 900, color: GRADE_COLOR[result.grade] || '#6b7280', lineHeight: 1 }}>{result.grade}</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: 4, color: GRADE_COLOR[result.grade] }}>{result.score}/100</div>
                            <div style={{ marginTop: 8 }}>
                                <span style={{ fontWeight: 700, color: '#16a34a', fontSize: '1.1rem' }}>${result.monthly_revenue_potential.toFixed(0)}/mo potential</span>
                                <span className="text-sm text-muted" style={{ marginLeft: 8 }}>at current traffic</span>
                            </div>
                        </div>

                        {result.quick_wins?.length > 0 && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>⚡ Quick Revenue Wins</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {result.quick_wins.map((w, i) => (
                                        <div key={i} style={{ padding: '10px 12px', background: '#f0fdf4', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div className="text-sm" style={{ fontWeight: 600 }}>{w.action}</div>
                                                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                                    <Badge variant={w.effort === 'low' ? 'success' : w.effort === 'medium' ? 'warning' : 'neutral'}>{w.effort} effort</Badge>
                                                    <Badge variant={w.revenue_impact === 'high' ? 'success' : 'warning'}>{w.revenue_impact} impact</Badge>
                                                </div>
                                            </div>
                                            <span style={{ fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>+${w.estimated_monthly_gain}/mo</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {result.affiliate_products_to_add?.length > 0 && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>💰 Add These Affiliate Products</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {result.affiliate_products_to_add.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                                            <div>
                                                <span style={{ fontWeight: 600 }}>{p.product}</span>
                                                <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{p.type} · {p.placement}</span>
                                            </div>
                                            <span style={{ color: '#16a34a', fontWeight: 700 }}>${p.estimated_monthly}/mo</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 12 }}>Dimension Breakdown</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {Object.entries(result.dimensions || {}).map(([key, dim], i) => (
                                    <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                                            <span style={{ fontWeight: 700, color: scoreColor(dim.score) }}>{dim.score}/100</span>
                                        </div>
                                        <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, marginBottom: 4 }}>
                                            <div style={{ height: '100%', background: scoreColor(dim.score), width: `${dim.score}%`, borderRadius: 2 }} />
                                        </div>
                                        <div className="text-sm text-muted">{dim.recommendation}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {saved.length > 0 && !result && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Previously Scored Posts</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {saved.map((s, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                                    <div>
                                        <span style={{ fontWeight: 600 }}>{s.title}</span>
                                        <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{s.quick_wins_count} quick wins</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: GRADE_COLOR[s.grade] || '#6b7280' }}>{s.grade} ({s.score})</span>
                                        <span style={{ color: '#16a34a', fontWeight: 700 }}>${s.revenue_potential.toFixed(0)}/mo</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!result && saved.length === 0 && <EmptyState icon="💰" title="Score your posts for monetization gaps" description="Paste any post to find missing affiliate links, CTAs, and revenue opportunities" />}
            </main>
        </div>
    );
}
