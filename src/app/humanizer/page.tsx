'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

interface HumanizerResult { original_text: string; humanized_text: string; changes_made: string[]; ai_score_before: number; ai_score_after: number; word_count_delta: number; techniques_applied: string[]; }

export default function HumanizerPage() {
    const toast = useToast();
    const [text, setText] = useState('');
    const [postId, setPostId] = useState('');
    const [applyToPost, setApplyToPost] = useState(false);
    const [result, setResult] = useState<HumanizerResult | null>(null);
    const [running, setRunning] = useState(false);
    const [copied, setCopied] = useState(false);

    const humanize = async () => {
        if (!text && !postId) { toast.warning('Paste content or select a post'); return; }
        setRunning(true); setResult(null);
        const res = await fetch('/api/humanizer', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: postId ? 'humanize_post' : 'humanize', text: text || undefined, post_id: postId || undefined, apply_to_post: applyToPost }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setRunning(false); return; }
        setResult(data.result);
        if (applyToPost) toast.success('Humanized and applied to post');
        else toast.success(`AI score reduced: ${data.result.ai_score_before} → ${data.result.ai_score_after}`);
        setRunning(false);
    };

    const scoreColor = (s: number) => s >= 40 ? '#dc2626' : s >= 20 ? '#d97706' : '#16a34a';
    const scoreLabel = (s: number) => s >= 40 ? 'High AI risk' : s >= 20 ? 'Moderate AI patterns' : 'Looks human';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Humanizer</h1>
                        <p className="page-description">Remove AI patterns, vary sentence structure, inject authentic voice — pass AI detectors</p>
                    </div>
                </div>

                <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Input</h3>
                        <div className="form-group">
                            <label className="form-label">Paste AI Content</label>
                            <textarea className="form-input" rows={14} value={text} onChange={e => setText(e.target.value)} placeholder="Paste your AI-generated content here. The humanizer will vary sentence structure, add contractions, remove AI transition words, and inject authentic voice..." style={{ fontFamily: 'inherit', fontSize: '0.9rem' }} />
                            <div className="text-sm text-muted" style={{ marginTop: 4 }}>{text.split(/\s+/).filter(Boolean).length} words</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={applyToPost} onChange={e => setApplyToPost(e.target.checked)} />
                                <span className="text-sm">Auto-apply to post after humanizing</span>
                            </label>
                        </div>
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={humanize} disabled={running}>
                            {running ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Humanizing...</> : '🤖→🧠 Humanize Content'}
                        </button>

                        <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.85rem' }}>Techniques Applied</div>
                            {['Vary sentence length', 'Add contractions', 'Inject first-person voice', 'Break AI transition patterns', 'Add rhetorical questions', 'Remove hedging phrases', 'Active voice conversion', 'Start sentences with conjunctions'].map((t, i) => (
                                <div key={i} className="text-sm text-muted" style={{ marginBottom: 3 }}>✓ {t}</div>
                            ))}
                        </div>
                    </div>

                    <div>
                        {running && <div className="card" style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} /><div style={{ fontWeight: 600 }}>Rewriting for human voice...</div><div className="text-sm text-muted" style={{ marginTop: 8 }}>Applying 10 humanization techniques</div></div>}

                        {result && !running && (
                            <div className="card animate-in">
                                {/* Score comparison */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, marginBottom: 20, alignItems: 'center' }}>
                                    <div style={{ textAlign: 'center', padding: '14px', background: '#fef2f2', borderRadius: 8 }}>
                                        <div className="text-sm text-muted">Before</div>
                                        <div style={{ fontSize: '2rem', fontWeight: 900, color: scoreColor(result.ai_score_before) }}>{result.ai_score_before}</div>
                                        <div style={{ fontSize: '0.75rem', color: scoreColor(result.ai_score_before) }}>{scoreLabel(result.ai_score_before)}</div>
                                    </div>
                                    <div style={{ fontSize: '1.5rem' }}>→</div>
                                    <div style={{ textAlign: 'center', padding: '14px', background: '#f0fdf4', borderRadius: 8 }}>
                                        <div className="text-sm text-muted">After</div>
                                        <div style={{ fontSize: '2rem', fontWeight: 900, color: scoreColor(result.ai_score_after) }}>{result.ai_score_after}</div>
                                        <div style={{ fontSize: '0.75rem', color: scoreColor(result.ai_score_after) }}>{scoreLabel(result.ai_score_after)}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => { navigator.clipboard.writeText(result.humanized_text); setCopied(true); toast.success('Copied'); setTimeout(() => setCopied(false), 2000); }}>{copied ? 'Copied!' : 'Copy Humanized Text'}</button>
                                    <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>{result.word_count_delta > 0 ? `+${result.word_count_delta}` : result.word_count_delta} words</span>
                                </div>

                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Humanized Content</div>
                                    <textarea className="form-input" rows={12} value={result.humanized_text} onChange={e => setResult(prev => prev ? { ...prev, humanized_text: e.target.value } : null)} style={{ fontFamily: 'inherit', fontSize: '0.9rem' }} />
                                </div>

                                {result.techniques_applied.length > 0 && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.85rem' }}>Techniques Applied</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {result.techniques_applied.map((t, i) => <span key={i} style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem' }}>{t}</span>)}
                                        </div>
                                    </div>
                                )}

                                {result.changes_made.length > 0 && (
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.85rem' }}>Changes Made</div>
                                        {result.changes_made.slice(0, 5).map((c, i) => <div key={i} className="text-sm text-muted" style={{ marginBottom: 3 }}>• {c}</div>)}
                                    </div>
                                )}
                            </div>
                        )}

                        {!result && !running && (
                            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>🧠</div>
                                <div style={{ fontWeight: 600 }}>Humanized content appears here</div>
                                <div className="text-sm" style={{ marginTop: 8 }}>Paste AI content and click Humanize</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
