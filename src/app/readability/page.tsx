'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

interface ScoreData { score: number; grade_level: number; reading_ease: string; avg_sentence_len: number; avg_syllables: number; target_grade: number; needs_improvement: boolean; difficult_sentences: string[]; recommendations: string[]; }

export default function ReadabilityPage() {
    const toast = useToast();
    const [content, setContent] = useState('');
    const [targetGrade, setTargetGrade] = useState(8);
    const [scoreData, setScoreData] = useState<ScoreData | null>(null);
    const [improved, setImproved] = useState('');
    const [scoreAfter, setScoreAfter] = useState<ScoreData | null>(null);
    const [loading, setLoading] = useState(false);
    const [improving, setImproving] = useState(false);

    const score = async () => {
        if (!content) { toast.warning('Paste content first'); return; }
        setLoading(true);
        const res = await fetch('/api/readability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'score', text: content, target_grade: targetGrade }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setLoading(false); return; }
        setScoreData(data);
        setLoading(false);
    };

    const improve = async () => {
        if (!content) { toast.warning('Paste content first'); return; }
        setImproving(true);
        const res = await fetch('/api/readability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'improve', text: content, target_grade: targetGrade }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setImproving(false); return; }
        setImproved(data.improved_text || '');
        setScoreData(data.score_before);
        setScoreAfter(data.score_after);
        toast.success(`Grade ${data.score_before?.grade_level} → ${data.score_after?.grade_level} | Ease ${data.score_before?.score} → ${data.score_after?.score}`);
        setImproving(false);
    };

    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626';
    const gradeColor = (g: number) => g <= 8 ? '#16a34a' : g <= 11 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Readability Improver</h1>
                        <p className="page-description">Flesch-Kincaid analysis + AI rewrites — target Grade 6-8 for maximum reach</p>
                    </div>
                </div>

                <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                    <div className="card">
                        <div className="form-group">
                            <label className="form-label">Target Grade Level</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[6, 7, 8, 9, 10].map(g => <button key={g} className={`btn btn-sm ${targetGrade === g ? 'btn-primary' : ''}`} onClick={() => setTargetGrade(g)}>Grade {g}</button>)}
                            </div>
                            <div className="text-sm text-muted" style={{ marginTop: 4 }}>Grade 6-7 = casual blog. Grade 8 = general audience. Grade 9-10 = professional.</div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Content *</label>
                            <textarea className="form-input" rows={12} value={content} onChange={e => setContent(e.target.value)} placeholder="Paste your content here..." style={{ fontFamily: 'inherit' }} />
                            <div className="text-sm text-muted" style={{ marginTop: 4 }}>{content.split(/\s+/).filter(Boolean).length} words</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-sm" onClick={score} disabled={loading}>{loading ? 'Scoring...' : 'Score Only'}</button>
                            <button className="btn btn-primary" onClick={improve} disabled={improving}>{improving ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Improving...</> : '✏️ Score & Improve'}</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {scoreData && (
                            <div className="card animate-in">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                    {[
                                        { l: 'Reading Ease', v: `${scoreData.score}`, color: scoreColor(scoreData.score) },
                                        { l: 'Grade Level', v: `${scoreData.grade_level}`, color: gradeColor(scoreData.grade_level) },
                                        { l: 'Reading Ease Label', v: scoreData.reading_ease, color: undefined },
                                        { l: 'Avg Sentence Len', v: `${scoreData.avg_sentence_len} words`, color: scoreData.avg_sentence_len > 20 ? '#dc2626' : '#16a34a' },
                                    ].map((m, i) => (
                                        <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                            <div className="text-sm text-muted">{m.l}</div>
                                            <div style={{ fontWeight: 700, color: m.color || 'var(--text-primary)' }}>{m.v}</div>
                                        </div>
                                    ))}
                                </div>
                                {scoreData.recommendations.length > 0 && (
                                    <div>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Recommendations</div>
                                        {scoreData.recommendations.map((r, i) => <div key={i} className="text-sm" style={{ color: '#2563eb', marginBottom: 4 }}>→ {r}</div>)}
                                    </div>
                                )}
                                {scoreData.difficult_sentences.length > 0 && (
                                    <div style={{ marginTop: 10 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Long Sentences to Break Up</div>
                                        {scoreData.difficult_sentences.map((s, i) => <div key={i} className="text-sm text-muted" style={{ marginBottom: 4, padding: '4px 8px', background: '#fef2f2', borderRadius: 4 }}>{s.trim().substring(0, 100)}...</div>)}
                                    </div>
                                )}
                            </div>
                        )}

                        {scoreAfter && (
                            <div className="card" style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac' }}>
                                <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>After Improvement</div>
                                <div className="grid-2" style={{ gap: 8 }}>
                                    <div><div className="text-sm text-muted">Ease</div><div style={{ fontWeight: 700, color: '#16a34a' }}>{scoreAfter.score}</div></div>
                                    <div><div className="text-sm text-muted">Grade Level</div><div style={{ fontWeight: 700, color: '#16a34a' }}>{scoreAfter.grade_level}</div></div>
                                </div>
                            </div>
                        )}

                        {improved && (
                            <div className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ fontWeight: 700 }}>Improved Text</div>
                                    <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(improved); toast.success('Copied'); }}>Copy</button>
                                </div>
                                <textarea className="form-input" rows={12} value={improved} onChange={e => setImproved(e.target.value)} style={{ fontFamily: 'inherit', fontSize: '0.9rem' }} />
                            </div>
                        )}

                        {!scoreData && !improved && (
                            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>📖</div>
                                <div style={{ fontWeight: 600 }}>Paste content and score or improve</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
