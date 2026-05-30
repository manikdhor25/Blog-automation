'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface IntentResult { keyword: string; intent: string; sub_intent: string; funnel_stage: string; content_type: string; monetization: string; confidence: number; reasoning: string; }
interface Stats { informational: number; commercial: number; transactional: number; navigational: number; high_monetization: number; }

const INTENT_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = { informational: 'info', commercial: 'warning', transactional: 'success', navigational: 'neutral' };
const MON_COLOR: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };
const STAGE_COLOR: Record<string, string> = { awareness: '#2563eb', consideration: '#d97706', decision: '#16a34a' };

export default function IntentClassifierPage() {
    const toast = useToast();
    const [keywords, setKeywords] = useState('');
    const [niche, setNiche] = useState('');
    const [results, setResults] = useState<IntentResult[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [classifying, setClassifying] = useState(false);
    const [filterIntent, setFilterIntent] = useState('all');
    const [filterMon, setFilterMon] = useState('all');

    const classify = async () => {
        const kwList = keywords.split('\n').map(k => k.trim()).filter(Boolean);
        if (!kwList.length) { toast.warning('Enter at least one keyword'); return; }
        setClassifying(true);
        const res = await fetch('/api/intent-classifier', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'classify', keywords: kwList, niche: niche || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setClassifying(false); return; }
        setResults(data.results || []);
        setStats(data.stats || null);
        toast.success(`Classified ${data.results?.length} keywords via ${data.provider}`);
        setClassifying(false);
    };

    const exportCsv = () => {
        const rows = [['Keyword', 'Intent', 'Sub-Intent', 'Funnel Stage', 'Content Type', 'Monetization', 'Confidence']];
        results.forEach(r => rows.push([r.keyword, r.intent, r.sub_intent, r.funnel_stage, r.content_type, r.monetization, `${(r.confidence * 100).toFixed(0)}%`]));
        const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'intent-classification.csv'; a.click();
    };

    const filtered = results.filter(r =>
        (filterIntent === 'all' || r.intent === filterIntent) &&
        (filterMon === 'all' || r.monetization === filterMon)
    );

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Search Intent Classifier</h1>
                        <p className="page-description">Classify keyword intent, funnel stage, and monetization potential in bulk</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche <span className="text-muted text-sm">(improves accuracy)</span></label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Keywords * <span className="text-muted text-sm">(one per line, up to 100)</span></label>
                        <textarea className="form-input" rows={8} value={keywords} onChange={e => setKeywords(e.target.value)} placeholder={"best savings account\nhow to save money\nopen bank account online\nchase bank login\nhigh yield savings rate\n..."} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>{keywords.split('\n').filter(k => k.trim()).length} keywords</div>
                    </div>
                    <button className="btn btn-primary" onClick={classify} disabled={classifying}>{classifying ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Classifying...</> : '🎯 Classify Intent'}</button>
                </div>

                {stats && (
                    <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                        {[
                            { label: 'Informational', value: stats.informational, color: '#2563eb' },
                            { label: 'Commercial', value: stats.commercial, color: '#d97706' },
                            { label: 'Transactional', value: stats.transactional, color: '#16a34a' },
                            { label: 'High Monetization', value: stats.high_monetization, color: '#7c3aed' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.color }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {results.length > 0 && (
                    <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                            <select className="form-input" value={filterIntent} onChange={e => setFilterIntent(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }}>
                                <option value="all">All Intent</option>
                                <option value="informational">Informational</option>
                                <option value="commercial">Commercial</option>
                                <option value="transactional">Transactional</option>
                                <option value="navigational">Navigational</option>
                            </select>
                            <select className="form-input" value={filterMon} onChange={e => setFilterMon(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }}>
                                <option value="all">All Monetization</option>
                                <option value="high">High $$$</option>
                                <option value="medium">Medium $$</option>
                                <option value="low">Low $</option>
                            </select>
                            <span className="text-sm text-muted">{filtered.length} of {results.length}</span>
                            <button className="btn btn-sm" onClick={exportCsv}>📥 Export CSV</button>
                        </div>

                        <div className="card">
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            {['Keyword', 'Intent', 'Sub-Intent', 'Stage', 'Content Type', 'Monetization', 'Conf.'].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((r, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.keyword}</td>
                                                <td style={{ padding: '8px 10px' }}><Badge variant={INTENT_VARIANT[r.intent]}>{r.intent}</Badge></td>
                                                <td style={{ padding: '8px 10px' }}><span className="text-sm text-muted">{r.sub_intent}</span></td>
                                                <td style={{ padding: '8px 10px' }}><span style={{ fontSize: '0.75rem', fontWeight: 700, color: STAGE_COLOR[r.funnel_stage] }}>{r.funnel_stage}</span></td>
                                                <td style={{ padding: '8px 10px' }}><span className="text-sm text-muted">{r.content_type}</span></td>
                                                <td style={{ padding: '8px 10px' }}><span style={{ fontWeight: 700, color: MON_COLOR[r.monetization] }}>{r.monetization}</span></td>
                                                <td style={{ padding: '8px 10px' }}><span className="text-sm text-muted">{(r.confidence * 100).toFixed(0)}%</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {!results.length && !classifying && <EmptyState icon="🎯" title="Paste keywords to classify intent" description="Identifies search intent, funnel stage, and monetization potential for each keyword" />}
            </main>
        </div>
    );
}
