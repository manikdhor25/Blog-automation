'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Analysis {
    overall_score?: number;
    ai_detection?: { score: number; risk_level: string; patterns_found?: string[]; ai_likelihood?: string };
    originality?: { score: number; concerns?: string[]; unique_elements?: string[] };
    humanization?: { score: number; suggestions?: string[]; strengths?: string[] };
    readability?: { grade_level?: string; avg_sentence_length?: number; passive_voice_percent?: number };
    recommendations?: string[];
    raw?: string;
}

export default function PlagiarismPage() {
    const toast = useToast();
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState<Analysis | null>(null);

    const handleAnalyze = async () => {
        if (content.length < 100) { toast.warning('Enter at least 100 characters'); return; }
        setLoading(true);
        setAnalysis(null);
        try {
            const res = await fetch('/api/plagiarism', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, title }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setAnalysis(data.analysis);
            toast.success('Analysis complete!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Analysis failed');
        } finally {
            setLoading(false);
        }
    };

    const scoreColor = (s: number) => s >= 80 ? 'var(--accent-success)' : s >= 60 ? 'var(--accent-warning)' : 'var(--accent-danger)';
    const scoreVariant = (s: number) => s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Plagiarism & AI Detection</h1>
                        <p className="page-description">Check content originality and AI-generated patterns</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="form-group">
                        <label className="form-label">Title (optional)</label>
                        <input className="form-input" placeholder="Article title" value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Content to Analyze *</label>
                        <textarea
                            className="form-input"
                            rows={10}
                            placeholder="Paste your content here (min 100 characters)..."
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            style={{ resize: 'vertical', fontFamily: 'var(--font-primary)' }}
                        />
                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>{content.length} characters</div>
                    </div>
                    <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading}>
                        {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Analyzing...</> : '🔍 Analyze Content'}
                    </button>
                </div>

                {analysis ? (
                    <>
                        {/* Score cards */}
                        <div className="grid-4" style={{ marginBottom: 24 }}>
                            <StatCard label="Overall Score" value={`${analysis.overall_score || 0}/100`} icon="📊" />
                            <StatCard label="AI Detection" value={`${analysis.ai_detection?.score || 0}/100`} icon="🤖" />
                            <StatCard label="Originality" value={`${analysis.originality?.score || 0}/100`} icon="✅" />
                            <StatCard label="Humanization" value={`${analysis.humanization?.score || 0}/100`} icon="🧑" />
                        </div>

                        {/* Overall gauge */}
                        <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
                            <div style={{
                                width: 120, height: 120, borderRadius: '50%', margin: '0 auto 12px',
                                border: `6px solid ${scoreColor(analysis.overall_score || 0)}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '2rem', fontWeight: 800,
                            }}>
                                {analysis.overall_score || 0}
                            </div>
                            <Badge variant={scoreVariant(analysis.overall_score || 0)}>
                                {(analysis.overall_score || 0) >= 80 ? 'PASS' : (analysis.overall_score || 0) >= 60 ? 'NEEDS WORK' : 'HIGH RISK'}
                            </Badge>
                        </div>

                        <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                            {/* AI Detection */}
                            <div className="card">
                                <h3 style={{ margin: '0 0 12px' }}>🤖 AI Detection</h3>
                                <div className="text-sm" style={{ marginBottom: 8 }}>
                                    Risk Level: <Badge variant={analysis.ai_detection?.risk_level === 'low' ? 'success' : analysis.ai_detection?.risk_level === 'medium' ? 'warning' : 'danger'}>
                                        {analysis.ai_detection?.risk_level?.toUpperCase()}
                                    </Badge>
                                </div>
                                {analysis.ai_detection?.patterns_found?.map((p, i) => (
                                    <div key={i} className="text-sm" style={{ marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid var(--accent-danger)' }}>⚠️ {p}</div>
                                ))}
                            </div>

                            {/* Humanization */}
                            <div className="card">
                                <h3 style={{ margin: '0 0 12px' }}>🧑 Humanization</h3>
                                {analysis.humanization?.strengths?.map((s, i) => (
                                    <div key={i} className="text-sm" style={{ marginBottom: 4, color: 'var(--accent-success)' }}>✅ {s}</div>
                                ))}
                                {analysis.humanization?.suggestions?.map((s, i) => (
                                    <div key={i} className="text-sm" style={{ marginBottom: 4, color: 'var(--accent-warning)' }}>💡 {s}</div>
                                ))}
                            </div>
                        </div>

                        {/* Recommendations */}
                        {analysis.recommendations && (
                            <div className="card">
                                <h3 style={{ margin: '0 0 12px' }}>📋 Recommendations</h3>
                                {analysis.recommendations.map((r, i) => (
                                    <div key={i} style={{
                                        padding: '8px 12px', marginBottom: 6, borderRadius: 8,
                                        background: i === 0 ? 'rgba(99,102,241,0.1)' : 'transparent',
                                        fontSize: '0.875rem',
                                    }}>
                                        {i + 1}. {r}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="card">
                        <EmptyState icon="🔍" title="No Analysis Yet" description="Paste your content above and run the analysis to check for AI patterns and originality." />
                    </div>
                )}
            </main>
        </div>
    );
}
