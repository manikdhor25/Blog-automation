'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Prediction { ranking_probability: { top_3: number; top_10: number; top_30: number }; time_to_rank_months: number; expected_monthly_traffic: { month_3: number; month_6: number; month_12: number }; expected_monthly_revenue: { month_3: number; month_6: number; month_12: number }; confidence_score: number; key_factors: Array<{ factor: string; impact: string; explanation: string }>; improvements_to_increase_success: Array<{ action: string; probability_boost: number; effort: string }>; competitive_advantage_needed: string; break_even_timeline: string; roi_estimate: string; publish_timing_advice: string; }

export default function PostPredictorPage() {
    const toast = useToast();
    const [keyword, setKeyword] = useState('');
    const [niche, setNiche] = useState('');
    const [da, setDa] = useState('');
    const [wordCount, setWordCount] = useState('1800');
    const [postType, setPostType] = useState('guide');
    const [hasSchema, setHasSchema] = useState(false);
    const [hasVideo, setHasVideo] = useState(false);
    const [prediction, setPrediction] = useState<Prediction | null>(null);
    const [history, setHistory] = useState<Array<{ id: string; keyword: string; top10_probability: number; month12_revenue: number; confidence_score: number; created_at: string }>>([]);
    const [predicting, setPredicting] = useState(false);

    useEffect(() => { loadHistory(); }, []);

    const loadHistory = async () => {
        const res = await fetch('/api/post-predictor');
        const data = await res.json();
        setHistory(data.predictions || []);
    };

    const predict = async () => {
        if (!keyword) { toast.warning('Enter keyword'); return; }
        setPredicting(true);
        const res = await fetch('/api/post-predictor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'predict', keyword, niche: niche || undefined, your_da: da ? parseInt(da) : undefined, word_count: parseInt(wordCount), post_type: postType, has_schema: hasSchema, has_video: hasVideo }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setPredicting(false); return; }
        setPrediction(data.prediction);
        toast.success(`Prediction complete via ${data.provider}`);
        loadHistory();
        setPredicting(false);
    };

    const probColor = (p: number) => p >= 60 ? '#16a34a' : p >= 30 ? '#d97706' : '#dc2626';
    const impactIcon: Record<string, string> = { positive: '✅', negative: '❌', neutral: '➡️' };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Post Performance Predictor</h1>
                        <p className="page-description">Predict traffic, revenue, and ranking probability before publishing — make data-driven content decisions</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Keyword *</label>
                            <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desks 2025" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="home office" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Your DA</label>
                            <input className="form-input" type="number" value={da} onChange={e => setDa(e.target.value)} placeholder="New site = leave blank" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Post Type</label>
                            <select className="form-input" value={postType} onChange={e => setPostType(e.target.value)}>
                                <option value="guide">Ultimate Guide</option>
                                <option value="how_to">How-To</option>
                                <option value="listicle">Listicle</option>
                                <option value="review">Review</option>
                                <option value="comparison">Comparison</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Word Count</label>
                            <select className="form-input" value={wordCount} onChange={e => setWordCount(e.target.value)}>
                                {['1000', '1500', '1800', '2500', '3000', '4000'].map(n => <option key={n} value={n}>{parseInt(n).toLocaleString()} words</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={hasSchema} onChange={e => setHasSchema(e.target.checked)} />
                                <span className="text-sm">Schema markup</span>
                            </label>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={hasVideo} onChange={e => setHasVideo(e.target.checked)} />
                                <span className="text-sm">Video embed</span>
                            </label>
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={predict} disabled={predicting}>{predicting ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Predicting...</> : '🔮 Predict Performance'}</button>
                </div>

                {prediction && (
                    <>
                        {/* Ranking probability */}
                        <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="card" style={{ padding: '20px' }}>
                                <h3 className="card-title" style={{ marginBottom: 14 }}>Ranking Probability</h3>
                                <div style={{ display: 'flex', gap: 16, justifyContent: 'space-around' }}>
                                    {[
                                        { label: 'Top 3', value: prediction.ranking_probability.top_3 },
                                        { label: 'Top 10', value: prediction.ranking_probability.top_10 },
                                        { label: 'Top 30', value: prediction.ranking_probability.top_30 },
                                    ].map((p, i) => (
                                        <div key={i} style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '2rem', fontWeight: 900, color: probColor(p.value) }}>{p.value}%</div>
                                            <div className="text-sm text-muted">{p.label}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span className="text-sm text-muted">Time to rank:</span>
                                        <strong className="text-sm">{prediction.time_to_rank_months} months</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                        <span className="text-sm text-muted">Confidence:</span>
                                        <strong className="text-sm">{prediction.confidence_score}%</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{ padding: '20px' }}>
                                <h3 className="card-title" style={{ marginBottom: 14 }}>Revenue Forecast</h3>
                                {[
                                    { label: '3 months', traffic: prediction.expected_monthly_traffic.month_3, revenue: prediction.expected_monthly_revenue.month_3 },
                                    { label: '6 months', traffic: prediction.expected_monthly_traffic.month_6, revenue: prediction.expected_monthly_revenue.month_6 },
                                    { label: '12 months', traffic: prediction.expected_monthly_traffic.month_12, revenue: prediction.expected_monthly_revenue.month_12 },
                                ].map((p, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                        <span className="text-sm text-muted">{p.label}</span>
                                        <div style={{ display: 'flex', gap: 16 }}>
                                            <span className="text-sm">{p.traffic.toLocaleString()} visitors</span>
                                            <span style={{ fontWeight: 700, color: '#16a34a' }}>${p.revenue}/mo</span>
                                        </div>
                                    </div>
                                ))}
                                <div style={{ marginTop: 10, padding: '8px 10px', background: '#f0fdf4', borderRadius: 4 }}>
                                    <div className="text-sm"><strong>ROI:</strong> {prediction.roi_estimate}</div>
                                    <div className="text-sm text-muted">Break-even: {prediction.break_even_timeline}</div>
                                </div>
                            </div>
                        </div>

                        {prediction.improvements_to_increase_success.length > 0 && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 10 }}>⚡ Boost Success Probability</h3>
                                {prediction.improvements_to_increase_success.map((imp, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#eff6ff', borderRadius: 4, marginBottom: 6 }}>
                                        <span className="text-sm">{imp.action}</span>
                                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                            <Badge variant="neutral">{imp.effort}</Badge>
                                            <span style={{ fontWeight: 700, color: '#2563eb' }}>+{imp.probability_boost}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="grid-2" style={{ gap: 16 }}>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10 }}>Key Factors</h3>
                                {prediction.key_factors.map((f, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                        <span>{impactIcon[f.impact]}</span>
                                        <div><div className="text-sm" style={{ fontWeight: 600 }}>{f.factor}</div><div className="text-sm text-muted">{f.explanation}</div></div>
                                    </div>
                                ))}
                            </div>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10 }}>Advice</h3>
                                <div style={{ marginBottom: 10 }}><div className="form-label">Timing</div><div className="text-sm">{prediction.publish_timing_advice}</div></div>
                                <div><div className="form-label">Competitive Edge Needed</div><div className="text-sm">{prediction.competitive_advantage_needed}</div></div>
                            </div>
                        </div>
                    </>
                )}

                {history.length > 0 && !prediction && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Previous Predictions</h3>
                        {history.map((h, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontWeight: 600 }}>{h.keyword}</span>
                                <div style={{ display: 'flex', gap: 16 }}>
                                    <span style={{ color: probColor(h.top10_probability) }}>Top 10: {h.top10_probability}%</span>
                                    <span style={{ color: '#16a34a' }}>${h.month12_revenue}/mo</span>
                                    <span className="text-sm text-muted">{new Date(h.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!prediction && !predicting && history.length === 0 && <EmptyState icon="🔮" title="Enter keyword to predict performance" description="Get realistic traffic, revenue, and ranking probability estimates before investing time writing" />}
            </main>
        </div>
    );
}
