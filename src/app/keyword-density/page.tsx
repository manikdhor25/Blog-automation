'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface DensityReport { word_count: number; primary_keyword: { keyword: string; count: number; density_pct: number; status: string; recommendation: string }; secondary_keywords: Array<{ keyword: string; count: number; density_pct: number; status: string; recommendation: string }>; top_terms: Array<{ term: string; tf: number; in_title: boolean; in_headings: boolean; is_lsi: boolean }>; lsi_coverage_score: number; over_optimized_terms: string[]; missing_lsi_opportunities: string[]; readability_score: number; }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info'> = { optimal: 'success', under: 'info', over: 'warning', keyword_stuffing: 'danger' };

export default function KeywordDensityPage() {
    const toast = useToast();
    const [content, setContent] = useState('');
    const [primaryKw, setPrimaryKw] = useState('');
    const [secondaryKws, setSecondaryKws] = useState('');
    const [title, setTitle] = useState('');
    const [report, setReport] = useState<DensityReport | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    const analyze = async () => {
        if (!content || !primaryKw) { toast.warning('Content and primary keyword required'); return; }
        setAnalyzing(true);
        const res = await fetch('/api/keyword-density', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content, primary_keyword: primaryKw, title: title || undefined,
                secondary_keywords: secondaryKws ? secondaryKws.split(',').map(s => s.trim()).filter(Boolean) : [],
            }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setAnalyzing(false); return; }
        setReport(data.report);
        setAnalyzing(false);
    };

    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Keyword Density Analyzer</h1>
                        <p className="page-description">TF-IDF analysis, density check, over-optimization alerts, LSI coverage</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Primary Keyword *</label>
                            <input className="form-input" value={primaryKw} onChange={e => setPrimaryKw(e.target.value)} placeholder="best standing desks" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Secondary Keywords <span className="text-muted text-sm">(comma-separated)</span></label>
                            <input className="form-input" value={secondaryKws} onChange={e => setSecondaryKws(e.target.value)} placeholder="ergonomic desk, adjustable desk" />
                        </div>
                        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                            <label className="form-label">Post Title</label>
                            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="10 Best Standing Desks for 2025" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Content *</label>
                        <textarea className="form-input" rows={8} value={content} onChange={e => setContent(e.target.value)} placeholder="Paste your article content here..." style={{ fontFamily: 'inherit' }} />
                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>{content.split(/\s+/).filter(Boolean).length} words</div>
                    </div>
                    <button className="btn btn-primary" onClick={analyze} disabled={analyzing}>
                        {analyzing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🔍 Analyze Density'}
                    </button>
                </div>

                {report && (
                    <>
                        {/* Summary cards */}
                        <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'Word Count', value: report.word_count.toLocaleString(), icon: '📝' },
                                { label: 'LSI Coverage', value: `${report.lsi_coverage_score}%`, icon: '🔗', color: scoreColor(report.lsi_coverage_score) },
                                { label: 'Readability', value: `${report.readability_score}/100`, icon: '📖', color: scoreColor(report.readability_score) },
                                { label: 'Over-Optimized', value: report.over_optimized_terms.length, icon: '⚠️', color: report.over_optimized_terms.length > 0 ? '#dc2626' : '#16a34a' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                                    <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color || 'var(--text-primary)' }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Primary keyword */}
                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 className="card-title" style={{ marginBottom: 12 }}>Primary Keyword Analysis</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700 }}>{report.primary_keyword.keyword}</div>
                                    <div className="text-sm text-muted">{report.primary_keyword.recommendation}</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, fontSize: '1.4rem' }}>{report.primary_keyword.density_pct}%</div>
                                    <div className="text-sm text-muted">{report.primary_keyword.count}× found</div>
                                </div>
                                <Badge variant={STATUS_VARIANT[report.primary_keyword.status] || 'info'}>{report.primary_keyword.status.replace('_', ' ')}</Badge>
                            </div>
                        </div>

                        {/* Secondary keywords */}
                        {report.secondary_keywords.length > 0 && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Secondary Keywords</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {report.secondary_keywords.map((kw, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontWeight: 600 }}>{kw.keyword}</span>
                                                <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{kw.recommendation}</span>
                                            </div>
                                            <span className="font-mono">{kw.density_pct}%</span>
                                            <span className="text-sm text-muted">{kw.count}×</span>
                                            <Badge variant={STATUS_VARIANT[kw.status] || 'info'}>{kw.status}</Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Alerts */}
                        {(report.over_optimized_terms.length > 0 || report.missing_lsi_opportunities.length > 0) && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Action Items</h3>
                                {report.over_optimized_terms.length > 0 && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>⚠️ Over-Optimized Terms</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {report.over_optimized_terms.map((t, i) => <span key={i} style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 10px', borderRadius: 12, fontSize: '0.85rem' }}>{t}</span>)}
                                        </div>
                                    </div>
                                )}
                                {report.missing_lsi_opportunities.length > 0 && (
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: 6 }}>💡 Add to Title/Headings</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {report.missing_lsi_opportunities.map((t, i) => <span key={i} style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 10px', borderRadius: 12, fontSize: '0.85rem' }}>{t}</span>)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Top TF-IDF terms */}
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 12 }}>Top Terms by Frequency</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                                {report.top_terms.slice(0, 20).map((t, i) => (
                                    <div key={i} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span className="text-sm" style={{ fontWeight: t.in_title || t.in_headings ? 700 : 400 }}>{t.term}</span>
                                            <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                                                {t.in_title && <span style={{ fontSize: '0.65rem', color: '#16a34a' }}>title</span>}
                                                {t.in_headings && <span style={{ fontSize: '0.65rem', color: '#2563eb' }}>h2</span>}
                                                {t.is_lsi && <span style={{ fontSize: '0.65rem', color: '#d97706' }}>lsi</span>}
                                            </div>
                                        </div>
                                        <span className="font-mono text-sm">{t.tf}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
