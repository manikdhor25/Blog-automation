'use client';

import React, { useState, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/utils/sanitize';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Optimization { id: string; keyword: string; snippet_type: string; confidence: string; optimized_content: string; html: string; word_count: number; reasoning: string; created_at: string; }

const TYPE_DESC: Record<string, string> = {
    paragraph: '40-50 word direct answer', definition: '30-40 word definition',
    numbered_list: 'Ordered steps or ranking', bulleted_list: 'Unordered best/top list',
    table: 'Comparison data table', how_to: 'Step-by-step instructions', none: 'Auto-detect',
};

export default function SnippetOptimizerPage() {
    const toast = useToast();
    const [keyword, setKeyword] = useState('');
    const [postId, setPostId] = useState('');
    const [content, setContent] = useState('');
    const [snippetType, setSnippetType] = useState('');
    const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);
    const [result, setResult] = useState<Optimization | null>(null);
    const [saved, setSaved] = useState<Optimization[]>([]);
    const [optimizing, setOptimizing] = useState(false);
    const [activeTab, setActiveTab] = useState<'optimize' | 'saved'>('optimize');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetch('/api/posts?status=published&limit=50').then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {});
        if (activeTab === 'saved') fetch('/api/snippet-optimizer').then(r => r.json()).then(d => setSaved(d.optimizations || []));
    }, [activeTab]);

    const optimize = async () => {
        if (!keyword) { toast.warning('Keyword required'); return; }
        setOptimizing(true); setResult(null);
        const res = await fetch('/api/snippet-optimizer', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'optimize', keyword, post_id: postId || undefined, current_content: content || undefined, snippet_type: snippetType || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setOptimizing(false); return; }
        setResult({ ...data.optimization, id: data.id, created_at: new Date().toISOString() });
        toast.success(`Optimized for ${data.optimization.detected_type} snippet`);
        setOptimizing(false);
    };

    const copyHtml = () => {
        if (!result?.html) return;
        navigator.clipboard.writeText(result.html);
        setCopied(true); toast.success('HTML copied');
        setTimeout(() => setCopied(false), 2000);
    };

    const confColor = (c: string) => ({ high: '#16a34a', medium: '#d97706', low: '#dc2626' }[c] || '#6b7280');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Snippet Optimizer</h1>
                        <p className="page-description">Auto-detect snippet type → generate 40-50 word content that wins Position 0</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'optimize' ? 'active' : ''}`} onClick={() => setActiveTab('optimize')}>Optimize</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>History ({saved.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {saved.length === 0 ? <EmptyState icon="🎯" title="No Optimizations" description="Run your first snippet optimization to see history" /> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {saved.map(s => (
                                    <div key={s.id} className="card" style={{ padding: 14 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ fontWeight: 700 }}>{s.keyword}</div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <Badge variant="info">{s.snippet_type.replace('_', ' ')}</Badge>
                                                <span style={{ fontSize: '0.75rem', color: confColor(s.confidence), fontWeight: 700 }}>{s.confidence} confidence</span>
                                            </div>
                                        </div>
                                        <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: 6, fontSize: '0.9rem', marginBottom: 8 }}>{s.optimized_content}</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(s.html); toast.success('HTML copied'); }}>Copy HTML</button>
                                            <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/snippet-optimizer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: s.id }) }); setSaved(prev => prev.filter(x => x.id !== s.id)); }}>Del</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Optimize Settings</h3>
                            <div className="form-group">
                                <label className="form-label">Target Keyword *</label>
                                <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="how to lose weight fast" onKeyDown={e => e.key === 'Enter' && optimize()} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Snippet Type <span className="text-muted text-sm">(leave blank to auto-detect)</span></label>
                                <select className="form-select" value={snippetType} onChange={e => setSnippetType(e.target.value)}>
                                    <option value="">Auto-detect from keyword</option>
                                    {Object.entries(TYPE_DESC).filter(([k]) => k !== 'none').map(([k, v]) => <option key={k} value={k}>{k.replace('_', ' ')} — {v}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Post Content <span className="text-muted text-sm">(paste excerpt for context)</span></label>
                                <textarea className="form-input" rows={4} value={content} onChange={e => setContent(e.target.value)} placeholder="Paste relevant section of your post..." />
                            </div>
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={optimize} disabled={optimizing}>
                                {optimizing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : '🎯 Generate Snippet Content'}
                            </button>

                            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                <div className="text-sm text-muted" style={{ marginBottom: 6, fontWeight: 600 }}>Snippet Type Guide</div>
                                {Object.entries(TYPE_DESC).filter(([k]) => k !== 'none').map(([k, v]) => (
                                    <div key={k} className="text-sm" style={{ marginBottom: 3 }}><strong>{k.replace('_', ' ')}:</strong> {v}</div>
                                ))}
                            </div>
                        </div>

                        <div>
                            {optimizing && <div className="card" style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 12px' }} /><div>Detecting snippet type and generating...</div></div>}
                            {result && !optimizing && (
                                <div className="card animate-in">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Snippet Content</div>
                                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                                <Badge variant="success">{result.snippet_type.replace('_', ' ')}</Badge>
                                                <span style={{ fontSize: '0.75rem', color: confColor(result.confidence), fontWeight: 700 }}>{result.confidence} confidence</span>
                                                <span className="text-sm text-muted">{result.word_count} words</span>
                                            </div>
                                        </div>
                                        <button className="btn btn-sm" onClick={copyHtml}>{copied ? 'Copied!' : 'Copy HTML'}</button>
                                    </div>

                                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
                                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Optimized Text</div>
                                        <div style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{result.optimized_content}</div>
                                    </div>

                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 6 }}>HTML Output</div>
                                        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 6, padding: 12 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(result.html) }} />
                                    </div>

                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '10px 12px' }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.85rem' }}>Why this wins</div>
                                        <div className="text-sm text-muted">{result.reasoning}</div>
                                    </div>
                                </div>
                            )}
                            {!result && !optimizing && (
                                <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎯</div>
                                    <div style={{ fontWeight: 600 }}>Optimized snippet appears here</div>
                                    <div className="text-sm" style={{ marginTop: 8 }}>Enter keyword → auto-detects type → generates Position 0 content</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
