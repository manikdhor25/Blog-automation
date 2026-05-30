'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface GradeResult { overall_score: number; overall_grade: string; dimensions: Record<string, { score: number; assessment: string; fix: string }>; top_3_priorities: Array<{ issue: string; impact: string; effort: string; fix: string }>; strengths: string[]; estimated_ranking_improvement: string; }

const GRADE_COLOR: Record<string, string> = { 'A+': '#16a34a', A: '#16a34a', B: '#65a30d', C: '#d97706', D: '#ea580c', F: '#dc2626' };
const DIMENSION_ICONS: Record<string, string> = { content_depth: '📚', keyword_optimization: '🔍', readability: '📖', heading_structure: '🏗️', meta_optimization: '🏷️', internal_linking: '🔗', external_linking: '🌐', media_usage: '🖼️', eeat_signals: '⭐', user_intent_match: '🎯', cta_effectiveness: '💰', schema_markup: '📋' };

export default function ContentGraderPage() {
    const toast = useToast();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [metaDesc, setMetaDesc] = useState('');
    const [keyword, setKeyword] = useState('');
    const [result, setResult] = useState<GradeResult | null>(null);
    const [grading, setGrading] = useState(false);
    const [wordCount, setWordCount] = useState(0);

    const grade = async () => {
        if (!title || !content) { toast.warning('Title and content required'); return; }
        setGrading(true);
        const res = await fetch('/api/content-grader', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'grade', title, content, meta_description: metaDesc || undefined, focus_keyword: keyword || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGrading(false); return; }
        setResult(data.result);
        setWordCount(data.word_count);
        toast.success(`Grade: ${data.result.overall_grade} (${data.result.overall_score}/100)`);
        setGrading(false);
    };

    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';
    const sortedDimensions = result ? Object.entries(result.dimensions).sort(([, a], [, b]) => a.score - b.score) : [];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Grader</h1>
                        <p className="page-description">Score posts on 12 dimensions — depth, readability, E-E-A-T, CTAs, schema, links</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Post Title *</label>
                            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Best Standing Desks for 2025" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Focus Keyword</label>
                            <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desks" />
                        </div>
                        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                            <label className="form-label">Meta Description</label>
                            <input className="form-input" value={metaDesc} onChange={e => setMetaDesc(e.target.value)} placeholder="155 character meta description..." />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Content * <span className="text-muted text-sm">({content.split(/\s+/).filter(Boolean).length} words)</span></label>
                        <textarea className="form-input" rows={8} value={content} onChange={e => setContent(e.target.value)} placeholder="Paste your full article content here..." style={{ fontFamily: 'inherit' }} />
                    </div>
                    <button className="btn btn-primary" onClick={grade} disabled={grading}>{grading ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Grading...</> : '📊 Grade Content'}</button>
                </div>

                {result && (
                    <>
                        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px' }}>
                            <div style={{ fontSize: '5rem', fontWeight: 900, color: GRADE_COLOR[result.overall_grade] || '#6b7280', lineHeight: 1 }}>{result.overall_grade}</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: 4 }}>{result.overall_score}/100</div>
                            <div className="text-sm text-muted" style={{ marginTop: 8 }}>{wordCount.toLocaleString()} words · {result.estimated_ranking_improvement}</div>
                        </div>

                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 className="card-title" style={{ marginBottom: 12, color: '#dc2626' }}>🚨 Top 3 Priorities</h3>
                            {result.top_3_priorities.map((p, i) => (
                                <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 8 }}>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                        <span style={{ fontWeight: 700 }}>{i + 1}. {p.issue}</span>
                                        <Badge variant={p.impact === 'high' ? 'danger' : 'warning'}>{p.impact} impact</Badge>
                                        <Badge variant={p.effort === 'low' ? 'success' : p.effort === 'medium' ? 'warning' : 'neutral'}>{p.effort} effort</Badge>
                                    </div>
                                    <div className="text-sm text-muted">{p.fix}</div>
                                </div>
                            ))}
                        </div>

                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 className="card-title" style={{ marginBottom: 12 }}>12-Dimension Scorecard</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {sortedDimensions.map(([key, dim], i) => (
                                    <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontWeight: 600 }}>{DIMENSION_ICONS[key] || '•'} {key.replace(/_/g, ' ')}</span>
                                            <span style={{ fontWeight: 700, color: scoreColor(dim.score) }}>{dim.score}/100</span>
                                        </div>
                                        <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, marginBottom: 4 }}>
                                            <div style={{ height: '100%', background: scoreColor(dim.score), width: `${dim.score}%`, borderRadius: 2 }} />
                                        </div>
                                        {dim.score < 70 && <div className="text-sm text-muted">Fix: {dim.fix}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {result.strengths?.length > 0 && (
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10, color: '#16a34a' }}>✅ Strengths</h3>
                                {result.strengths.map((s, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}>• {s}</div>)}
                            </div>
                        )}
                    </>
                )}

                {!result && !grading && <EmptyState icon="📊" title="Paste content to grade" description="Get a detailed scorecard across 12 SEO and content quality dimensions" />}
            </main>
        </div>
    );
}
