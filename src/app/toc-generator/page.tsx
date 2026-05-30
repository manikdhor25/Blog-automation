'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface TocResult { headings: Array<{ level: number; text: string; id: string }>; toc_html: string; content_with_ids: string; heading_count: number; }

export default function TocGeneratorPage() {
    const toast = useToast();
    const [content, setContent] = useState('');
    const [style, setStyle] = useState<'numbered' | 'bullets' | 'links'>('links');
    const [maxDepth, setMaxDepth] = useState<'h2' | 'h3' | 'h4'>('h3');
    const [postId, setPostId] = useState('');
    const [injectToPost, setInjectToPost] = useState(false);
    const [result, setResult] = useState<TocResult | null>(null);
    const [generating, setGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState<'preview' | 'html' | 'content'>('preview');

    const generate = async () => {
        if (!content) { toast.warning('Paste content first'); return; }
        setGenerating(true);
        const res = await fetch('/api/toc-generator', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', content, style, max_depth: maxDepth, post_id: postId || undefined, inject_to_post: injectToPost && !!postId }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'No headings found'); setGenerating(false); return; }
        setResult(data);
        toast.success(`Generated TOC with ${data.heading_count} headings`);
        setGenerating(false);
    };

    const LEVEL_COLORS: Record<number, string> = { 2: 'var(--accent-primary)', 3: '#7c3aed', 4: '#16a34a' };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Table of Contents Generator</h1>
                        <p className="page-description">Auto-extract headings, generate anchor-linked TOC, inject into post content</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Style</label>
                            <select className="form-input" value={style} onChange={e => setStyle(e.target.value as typeof style)}>
                                <option value="links">Anchor Links (recommended)</option>
                                <option value="numbered">Numbered List</option>
                                <option value="bullets">Bullet Points</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Max Depth</label>
                            <select className="form-input" value={maxDepth} onChange={e => setMaxDepth(e.target.value as typeof maxDepth)}>
                                <option value="h2">H2 only</option>
                                <option value="h3">H2 + H3</option>
                                <option value="h4">H2 + H3 + H4</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Post ID <span className="text-muted text-sm">(optional, to inject)</span></label>
                            <input className="form-input" value={postId} onChange={e => setPostId(e.target.value)} placeholder="UUID from posts" />
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={injectToPost} onChange={e => setInjectToPost(e.target.checked)} disabled={!postId} />
                                <span className="text-sm">Auto-inject into post</span>
                            </label>
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Post Content * <span className="text-muted text-sm">(HTML or Markdown)</span></label>
                        <textarea className="form-input" rows={8} value={content} onChange={e => setContent(e.target.value)} placeholder="Paste your HTML or Markdown content here..." style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                    </div>
                    <button className="btn btn-primary" onClick={generate} disabled={generating}>{generating ? 'Generating...' : '📑 Generate TOC'}</button>
                </div>

                {result && (
                    <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                            {(['preview', 'html', 'content'] as const).map(t => (
                                <button key={t} className={`btn btn-sm ${activeTab === t ? 'btn-primary' : ''}`} onClick={() => setActiveTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                            ))}
                            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(activeTab === 'html' ? result.toc_html : activeTab === 'content' ? result.content_with_ids : result.toc_html); toast.success('Copied'); }}>📋 Copy</button>
                        </div>

                        {activeTab === 'preview' && (
                            <div className="card">
                                <div style={{ fontWeight: 700, marginBottom: 10 }}>Table of Contents ({result.heading_count} headings)</div>
                                {result.headings.map((h, i) => (
                                    <div key={i} style={{ paddingLeft: (h.level - 2) * 20, paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: LEVEL_COLORS[h.level], background: `${LEVEL_COLORS[h.level]}15`, padding: '1px 5px', borderRadius: 3 }}>H{h.level}</span>
                                            <span className="text-sm">{h.text}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>#{h.id}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'html' && (
                            <div className="card">
                                <textarea className="form-input" rows={12} value={result.toc_html} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                            </div>
                        )}

                        {activeTab === 'content' && (
                            <div className="card">
                                <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Content with heading IDs added for anchor links:</div>
                                <textarea className="form-input" rows={14} value={result.content_with_ids} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                            </div>
                        )}
                    </>
                )}

                {!result && !generating && <EmptyState icon="📑" title="Paste content to generate TOC" description="Extracts all headings, creates anchor links, optionally injects into your post" />}
            </main>
        </div>
    );
}
