'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface CroResult { cro_score: number; current_estimated_ctr: number; optimized_estimated_ctr: number; revenue_lift_potential: string; cta_analysis: Array<{ location: string; current_text: string; issue: string; optimized_text: string; expected_improvement_pct: number }>; trust_signals: { present: string[]; missing: string[]; recommendations: string[] }; page_flow_issues: string[]; headline_test_ideas: string[]; button_copy_improvements: Array<{ current: string; improved: string; reason: string }>; social_proof_opportunities: string[]; urgency_scarcity_opportunities: string[]; quick_wins: Array<{ action: string; effort: string; expected_ctr_boost_pct: number }>; a_b_test_ideas: string[]; }

export default function CroAnalyzerPage() {
    const toast = useToast();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [niche, setNiche] = useState('');
    const [product, setProduct] = useState('');
    const [currentCtr, setCurrentCtr] = useState('');
    const [result, setResult] = useState<CroResult | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    const analyze = async () => {
        if (!content && !title) { toast.warning('Provide content or title'); return; }
        setAnalyzing(true);
        const res = await fetch('/api/cro-analyzer', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'analyze', title: title || undefined, content: content || undefined, niche: niche || undefined, affiliate_product: product || undefined, current_ctr: currentCtr ? parseFloat(currentCtr) : undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setAnalyzing(false); return; }
        setResult(data.result);
        toast.success(`CRO Score: ${data.result.cro_score}/100`);
        setAnalyzing(false);
    };

    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">CRO Analyzer</h1>
                        <p className="page-description">Analyze CTAs, trust signals, page flow — maximize affiliate conversion rate</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Post Title</label>
                            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Best Standing Desks for 2025" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Affiliate Product</label>
                            <input className="form-input" value={product} onChange={e => setProduct(e.target.value)} placeholder="FlexiSpot E7 desk" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="home office" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Current CTR % <span className="text-muted text-sm">(if known)</span></label>
                            <input className="form-input" type="number" value={currentCtr} onChange={e => setCurrentCtr(e.target.value)} placeholder="2.5" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Content *</label>
                        <textarea className="form-input" rows={6} value={content} onChange={e => setContent(e.target.value)} placeholder="Paste your post content here..." style={{ fontFamily: 'inherit' }} />
                    </div>
                    <button className="btn btn-primary" onClick={analyze} disabled={analyzing}>{analyzing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🎯 Analyze CRO'}</button>
                </div>

                {result && (
                    <>
                        <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'CRO Score', value: `${result.cro_score}/100`, icon: '📊', color: scoreColor(result.cro_score) },
                                { label: 'Current CTR', value: `${result.current_estimated_ctr}%`, icon: '👆' },
                                { label: 'Optimized CTR', value: `${result.optimized_estimated_ctr}%`, icon: '🎯', color: '#16a34a' },
                                { label: 'Revenue Lift', value: result.revenue_lift_potential, icon: '💰', color: '#16a34a' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                    <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: (s as { color?: string }).color || 'var(--text-primary)' }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {result.quick_wins.length > 0 && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>⚡ Quick Wins</h3>
                                {result.quick_wins.map((w, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f0fdf4', borderRadius: 4, marginBottom: 6 }}>
                                        <div className="text-sm">{w.action}</div>
                                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                            <Badge variant="neutral">{w.effort}</Badge>
                                            <span style={{ fontWeight: 700, color: '#16a34a' }}>+{w.expected_ctr_boost_pct}% CTR</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {result.cta_analysis.length > 0 && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>💬 CTA Improvements</h3>
                                {result.cta_analysis.map((cta, i) => (
                                    <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 8 }}>
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                            <Badge variant="neutral">{cta.location}</Badge>
                                            <span style={{ fontWeight: 700, color: '#16a34a' }}>+{cta.expected_improvement_pct}% CTR</span>
                                        </div>
                                        <div className="grid-2" style={{ gap: 8 }}>
                                            <div style={{ padding: '6px 8px', background: '#fef2f2', borderRadius: 4 }}>
                                                <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 700 }}>CURRENT</div>
                                                <div className="text-sm">{cta.current_text || '(missing)'}</div>
                                            </div>
                                            <div style={{ padding: '6px 8px', background: '#f0fdf4', borderRadius: 4 }}>
                                                <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>IMPROVED</div>
                                                <div className="text-sm">{cta.optimized_text}</div>
                                            </div>
                                        </div>
                                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>{cta.issue}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="grid-2" style={{ gap: 16 }}>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10 }}>Trust Signals</h3>
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>✅ Present</div>
                                    {result.trust_signals.present.map((s, i) => <div key={i} className="text-sm text-muted">• {s}</div>)}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>❌ Missing</div>
                                    {result.trust_signals.missing.map((s, i) => <div key={i} className="text-sm">• {s}</div>)}
                                </div>
                            </div>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10 }}>🧪 A/B Test Ideas</h3>
                                {result.a_b_test_ideas.map((idea, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>• {idea}</div>)}
                                {result.urgency_scarcity_opportunities.length > 0 && (
                                    <div style={{ marginTop: 10 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>⏰ Urgency/Scarcity</div>
                                        {result.urgency_scarcity_opportunities.map((u, i) => <div key={i} className="text-sm text-muted">• {u}</div>)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {!result && !analyzing && <EmptyState icon="🎯" title="Analyze content for conversion optimization" description="Find CTA improvements, trust signal gaps, and quick wins to boost affiliate revenue" />}
            </main>
        </div>
    );
}
