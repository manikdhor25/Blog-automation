'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Analysis { url: string; title: string; word_count: number; headings: { h1: string[]; h2: string[]; h3: string[] }; schema_types: string[]; outbound_link_count: number; image_count: number; images_with_alt: number; has_faq: boolean; has_table: boolean; has_video: boolean; content_angle: string; key_entities: string[]; content_gaps: string[]; strengths: string[]; weaknesses: string[]; estimated_difficulty_to_beat: string; beat_strategy: string; sections_to_add: string[]; word_count_recommendation: number; analyzed_at: string; }
interface SavedAnalysis { id: string; url: string; title: string; word_count: number; created_at: string; }

const DIFF_COLORS: Record<string, string> = { easy: '#16a34a', medium: '#d97706', hard: '#ea580c', very_hard: '#dc2626' };

export default function PostAnalyzerPage() {
    const toast = useToast();
    const [url, setUrl] = useState('');
    const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);
    const [yourPostId, setYourPostId] = useState('');
    const [result, setResult] = useState<Analysis | null>(null);
    const [saved, setSaved] = useState<SavedAnalysis[]>([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<'analyze' | 'saved'>('analyze');

    useEffect(() => {
        fetch('/api/posts?status=published&limit=50').then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {});
        if (activeTab === 'saved') fetch('/api/post-analyzer').then(r => r.json()).then(d => setSaved(d.analyses || []));
    }, [activeTab]);

    const analyze = async () => {
        if (!url) { toast.warning('URL required'); return; }
        setAnalyzing(true); setResult(null);
        const res = await fetch('/api/post-analyzer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'analyze', url, your_post_id: yourPostId || undefined }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setAnalyzing(false); return; }
        setResult(data.analysis);
        toast.success(`Analyzed: ${data.analysis.word_count} words, difficulty: ${data.analysis.estimated_difficulty_to_beat}`);
        setAnalyzing(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Competitor Post Analyzer</h1>
                        <p className="page-description">Deep-analyze competitor URLs — headings, entities, schema, gaps, beat strategy</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'analyze' ? 'active' : ''}`} onClick={() => setActiveTab('analyze')}>Analyze</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>History ({saved.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {saved.length === 0 ? <EmptyState icon="🔍" title="No Analyses" description="Analyze your first competitor URL" />
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {saved.map(s => (
                                    <div key={s.id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div><div style={{ fontWeight: 700 }}>{s.title.substring(0, 60)}</div><div className="text-sm text-muted">{s.url.substring(0, 60)} · {s.word_count} words · {new Date(s.created_at).toLocaleDateString()}</div></div>
                                        <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/post-analyzer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: s.id }) }); setSaved(prev => prev.filter(x => x.id !== s.id)); }}>Del</button>
                                    </div>
                                ))}
                            </div>
                        }
                    </div>
                ) : (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Competitor URL *</label>
                                    <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://competitor.com/their-post/" onKeyDown={e => e.key === 'Enter' && analyze()} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Compare with Your Post <span className="text-muted text-sm">(optional)</span></label>
                                    <select className="form-select" value={yourPostId} onChange={e => setYourPostId(e.target.value)}>
                                        <option value="">No comparison</option>
                                        {posts.map(p => <option key={p.id} value={p.id}>{p.title.substring(0, 60)}</option>)}
                                    </select>
                                </div>
                            </div>
                            <button className="btn btn-primary" onClick={analyze} disabled={!url || analyzing}>{analyzing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🔍 Deep Analyze'}</button>
                        </div>

                        {result && (
                            <div className="card animate-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <div><div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{result.title}</div><div className="text-sm text-muted">{result.url}</div></div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Badge variant="neutral">{result.word_count} words</Badge>
                                        <span style={{ fontWeight: 700, color: DIFF_COLORS[result.estimated_difficulty_to_beat] }}>{result.estimated_difficulty_to_beat} to beat</span>
                                    </div>
                                </div>

                                <div className="grid-4" style={{ gap: 8, marginBottom: 16 }}>
                                    {[{ l: 'H2s', v: result.headings.h2.length }, { l: 'Outbound Links', v: result.outbound_link_count }, { l: 'Images', v: result.image_count }, { l: 'Alt Texts', v: result.images_with_alt }].map((s, i) => (
                                        <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700 }}>{s.v}</div><div className="text-sm text-muted">{s.l}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                                    {[['Schema', result.schema_types.length > 0], ['FAQ', result.has_faq], ['Table', result.has_table], ['Video', result.has_video]].map(([l, v]) => (
                                        <Badge key={l as string} variant={v ? 'success' : 'neutral'}>{v ? '✓' : '✗'} {l as string}</Badge>
                                    ))}
                                </div>

                                <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                                    <div>
                                        <div style={{ fontWeight: 700, marginBottom: 8, color: '#16a34a' }}>Strengths</div>
                                        {result.strengths?.map((s, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>✓ {s}</div>)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, marginBottom: 8, color: '#dc2626' }}>Weaknesses to Exploit</div>
                                        {result.weaknesses?.map((w, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>→ {w}</div>)}
                                    </div>
                                </div>

                                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                                    <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>🏆 Beat Strategy</div>
                                    <p className="text-sm">{result.beat_strategy}</p>
                                    <div className="text-sm text-muted" style={{ marginTop: 6 }}>Target: {result.word_count_recommendation} words</div>
                                </div>

                                {result.content_gaps?.length > 0 && (
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Content Gaps (their misses)</div>
                                        {result.content_gaps.map((g, i) => <div key={i} className="text-sm" style={{ marginBottom: 4, color: '#2563eb' }}>+ {g}</div>)}
                                    </div>
                                )}

                                <div>
                                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Their H2 Structure</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {result.headings.h2.slice(0, 10).map((h, i) => <div key={i} style={{ padding: '4px 10px', background: 'var(--bg-secondary)', borderRadius: 4, fontSize: '0.85rem' }}>{h}</div>)}
                                    </div>
                                </div>
                            </div>
                        )}
                        {!result && !analyzing && <div className="card"><EmptyState icon="🔍" title="Enter Competitor URL" description="Paste any competitor blog post URL to deep-analyze their content strategy" /></div>}
                    </>
                )}
            </main>
        </div>
    );
}
