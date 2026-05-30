'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface TopicData { topic: string; coverage_score: number; posts_covering: number; covered_angles: string[]; missing_angles: string[]; competitor_has_advantage: boolean; priority: string; recommended_posts: string[]; }
interface AuthorityScore { overall_score: number; grade: string; summary: string; topics: TopicData[]; quick_wins: string[]; eeat_assessment: { expertise_score: number; authoritativeness_score: number; trustworthiness_score: number; recommendations: string[] }; competitor_gap_count: number; niche: string; }
interface SavedScore { id: string; niche: string; overall_score: number; grade: string; gaps_count: number; analyzed_at: string; }

const GRADE_COLOR: Record<string, string> = { 'A+': '#16a34a', A: '#16a34a', B: '#65a30d', C: '#d97706', D: '#ea580c', F: '#dc2626' };

export default function TopicalAuthorityPage() {
    const toast = useToast();
    const [niche, setNiche] = useState('');
    const [competitors, setCompetitors] = useState('');
    const [siteId, setSiteId] = useState('');
    const [result, setResult] = useState<AuthorityScore | null>(null);
    const [saved, setSaved] = useState<SavedScore[]>([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

    useEffect(() => { loadSaved(); }, []);

    const loadSaved = async () => {
        const res = await fetch('/api/topical-authority');
        const data = await res.json();
        setSaved(data.scores || []);
    };

    const analyze = async () => {
        if (!niche) { toast.warning('Enter niche'); return; }
        setAnalyzing(true);
        const res = await fetch('/api/topical-authority', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'analyze', niche, site_id: siteId || undefined, competitor_domains: competitors ? competitors.split('\n').map(s => s.trim()).filter(Boolean) : [] }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setAnalyzing(false); return; }
        setResult(data.score);
        toast.success(`Analysis complete via ${data.provider}`);
        loadSaved();
        setAnalyzing(false);
    };

    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Topical Authority Score</h1>
                        <p className="page-description">Measure topic coverage depth vs competitors — find E-E-A-T gaps and quick wins</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche *</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance, fitness, crypto..." />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Site ID <span className="text-muted text-sm">(pulls your posts)</span></label>
                            <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites" />
                        </div>
                        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                            <label className="form-label">Competitor Domains <span className="text-muted text-sm">(one per line)</span></label>
                            <textarea className="form-input" rows={2} value={competitors} onChange={e => setCompetitors(e.target.value)} placeholder="competitor1.com&#10;competitor2.com" />
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={analyze} disabled={analyzing}>
                        {analyzing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🔬 Analyze Authority'}
                    </button>
                </div>

                {result && (
                    <>
                        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '24px' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>Topical Authority Score</div>
                            <div style={{ fontSize: '5rem', fontWeight: 900, color: GRADE_COLOR[result.grade], lineHeight: 1 }}>{result.grade}</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: 4 }}>{result.overall_score}/100</div>
                            <div className="text-sm text-muted" style={{ marginTop: 8, maxWidth: 500, margin: '8px auto 0' }}>{result.summary}</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                                <div><div style={{ fontWeight: 700, color: scoreColor(result.eeat_assessment?.expertise_score || 0) }}>{result.eeat_assessment?.expertise_score || 0}</div><div className="text-sm text-muted">Expertise</div></div>
                                <div><div style={{ fontWeight: 700, color: scoreColor(result.eeat_assessment?.authoritativeness_score || 0) }}>{result.eeat_assessment?.authoritativeness_score || 0}</div><div className="text-sm text-muted">Authority</div></div>
                                <div><div style={{ fontWeight: 700, color: scoreColor(result.eeat_assessment?.trustworthiness_score || 0) }}>{result.eeat_assessment?.trustworthiness_score || 0}</div><div className="text-sm text-muted">Trust</div></div>
                                <div><div style={{ fontWeight: 700, color: '#dc2626' }}>{result.competitor_gap_count}</div><div className="text-sm text-muted">Competitor Gaps</div></div>
                            </div>
                        </div>

                        {result.quick_wins?.length > 0 && (
                            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #16a34a' }}>
                                <h3 className="card-title" style={{ marginBottom: 10, color: '#16a34a' }}>⚡ Quick Wins</h3>
                                {result.quick_wins.map((w, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>• {w}</div>)}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {result.topics?.sort((a, b) => a.coverage_score - b.coverage_score).map((topic, i) => (
                                <div key={i} className="card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={() => setExpandedTopic(expandedTopic === topic.topic ? null : topic.topic)}>
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: `conic-gradient(${scoreColor(topic.coverage_score)} ${topic.coverage_score * 3.6}deg, var(--border-subtle) 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>{topic.coverage_score}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{topic.topic}</div>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <span className="text-sm text-muted">{topic.posts_covering} posts</span>
                                                    <span className="text-sm text-muted">{topic.missing_angles.length} gaps</span>
                                                    {topic.competitor_has_advantage && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>⚠️ competitor ahead</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <Badge variant={topic.priority === 'high' ? 'danger' : topic.priority === 'medium' ? 'warning' : 'neutral'}>{topic.priority}</Badge>
                                            <span>{expandedTopic === topic.topic ? '▲' : '▼'}</span>
                                        </div>
                                    </div>

                                    {expandedTopic === topic.topic && (
                                        <div className="grid-2" style={{ gap: 12, marginTop: 12 }}>
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#16a34a', marginBottom: 6 }}>✅ Covered</div>
                                                {topic.covered_angles.map((a, ai) => <div key={ai} className="text-sm text-muted">• {a}</div>)}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>❌ Gaps</div>
                                                {topic.missing_angles.map((a, ai) => <div key={ai} className="text-sm text-muted">• {a}</div>)}
                                            </div>
                                            {topic.recommended_posts.length > 0 && (
                                                <div style={{ gridColumn: '1 / -1' }}>
                                                    <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: 6 }}>💡 Recommended Posts</div>
                                                    {topic.recommended_posts.map((p, pi) => <div key={pi} className="text-sm" style={{ marginBottom: 3 }}>→ {p}</div>)}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {saved.length > 0 && !result && !analyzing && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Previous Analyses</h3>
                        {saved.map((s, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                <div><span style={{ fontWeight: 600 }}>{s.niche}</span><span className="text-sm text-muted" style={{ marginLeft: 8 }}>{s.gaps_count} gaps</span></div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700, color: GRADE_COLOR[s.grade] || '#6b7280' }}>{s.grade} ({s.overall_score})</span>
                                    <span className="text-sm text-muted">{new Date(s.analyzed_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!result && saved.length === 0 && !analyzing && (
                    <EmptyState icon="🔬" title="Enter niche to analyze topical authority" description="Identify content gaps vs competitors and get specific posts to write for E-E-A-T" />
                )}
            </main>
        </div>
    );
}
