'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

// SEO Predictor interfaces
interface Prediction {
    keyword: string;
    difficulty_score: number;
    difficulty_label: 'Easy' | 'Medium' | 'Hard' | 'Very Hard';
    ranking_probability_pct: number;
    estimated_time_to_rank: string;
    required_word_count: number;
    required_backlinks: number;
    required_da: number;
    top_competitor_das: number[];
    serp_features_present: string[];
    winning_factors: string[];
    risk_factors: string[];
    recommended_approach: string;
    content_requirements: Array<{ requirement: string; importance: 'critical' | 'important' | 'nice' }>;
    provider: string;
}

// Post Predictor interfaces (from /post-predictor)
interface PostPrediction {
    ranking_probability: { top_3: number; top_10: number; top_30: number };
    time_to_rank_months: number;
    expected_monthly_traffic: { month_3: number; month_6: number; month_12: number };
    expected_monthly_revenue: { month_3: number; month_6: number; month_12: number };
    confidence_score: number;
    key_factors: Array<{ factor: string; impact: string; explanation: string }>;
    improvements_to_increase_success: Array<{ action: string; probability_boost: number; effort: string }>;
    competitive_advantage_needed: string;
    break_even_timeline: string;
    roi_estimate: string;
    publish_timing_advice: string;
}

const DIFF_COLORS: Record<string, string> = { Easy: '#16a34a', Medium: '#d97706', Hard: '#ea580c', 'Very Hard': '#dc2626' };

export default function SeoPredictorPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('main');

    // === SEO Predictor state ===
    const [keyword, setKeyword] = useState('');
    const [yourDa, setYourDa] = useState('');
    const [yourBacklinks, setYourBacklinks] = useState('');
    const [niche, setNiche] = useState('');
    const [prediction, setPrediction] = useState<Prediction | null>(null);
    const [predicting, setPredicting] = useState(false);

    // === Post Predictor state (from /post-predictor) ===
    const [postKeyword, setPostKeyword] = useState('');
    const [postNiche, setPostNiche] = useState('');
    const [postDa, setPostDa] = useState('');
    const [wordCount, setWordCount] = useState('1800');
    const [postType, setPostType] = useState('guide');
    const [hasSchema, setHasSchema] = useState(false);
    const [hasVideo, setHasVideo] = useState(false);
    const [postPrediction, setPostPrediction] = useState<PostPrediction | null>(null);
    const [postHistory, setPostHistory] = useState<Array<{ id: string; keyword: string; top10_probability: number; month12_revenue: number; confidence_score: number; created_at: string }>>([]);
    const [postPredicting, setPostPredicting] = useState(false);

    // Load post prediction history when tab is selected
    useEffect(() => {
        if (activeTab === 'post') {
            loadPostHistory();
        }
    }, [activeTab]);

    // === SEO Predictor functions ===
    const predict = async () => {
        if (!keyword) { toast.warning('Enter keyword'); return; }
        setPredicting(true);
        const res = await fetch('/api/seo-predictor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keyword, niche: niche || undefined,
                your_da: yourDa ? parseInt(yourDa) : undefined,
                your_backlinks: yourBacklinks ? parseInt(yourBacklinks) : undefined,
            }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setPredicting(false); return; }
        setPrediction(data.prediction);
        toast.success('Prediction complete');
        setPredicting(false);
    };

    // === Post Predictor functions (from /post-predictor) ===
    const loadPostHistory = async () => {
        const res = await fetch('/api/post-predictor');
        const data = await res.json();
        setPostHistory(data.predictions || []);
    };

    const predictPost = async () => {
        if (!postKeyword) { toast.warning('Enter keyword'); return; }
        setPostPredicting(true);
        const res = await fetch('/api/post-predictor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'predict', keyword: postKeyword, niche: postNiche || undefined, your_da: postDa ? parseInt(postDa) : undefined, word_count: parseInt(wordCount), post_type: postType, has_schema: hasSchema, has_video: hasVideo }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setPostPredicting(false); return; }
        setPostPrediction(data.prediction);
        toast.success(`Prediction complete via ${data.provider}`);
        loadPostHistory();
        setPostPredicting(false);
    };

    const probColor = (p: number) => p >= 60 ? '#16a34a' : p >= 30 ? '#d97706' : '#dc2626';
    const impactIcon: Record<string, string> = { positive: '✅', negative: '❌', neutral: '➡️' };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">SEO Difficulty Predictor</h1>
                        <p className="page-description">Predict ranking difficulty, time-to-rank, required backlinks + content requirements for any keyword</p>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>🔮 SEO Difficulty</button>
                    <button className={`btn ${activeTab === 'post' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('post')}>📊 Post Prediction</button>
                </div>

                {/* ===== MAIN TAB: SEO Predictor ===== */}
                {activeTab === 'main' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Keyword *</label>
                                    <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best budget laptop 2025" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Your Niche</label>
                                    <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="technology" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Your DA <span className="text-muted text-sm">(optional, for personalized score)</span></label>
                                    <input className="form-input" type="number" value={yourDa} onChange={e => setYourDa(e.target.value)} placeholder="e.g. 25" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Your Backlinks <span className="text-muted text-sm">(optional)</span></label>
                                    <input className="form-input" type="number" value={yourBacklinks} onChange={e => setYourBacklinks(e.target.value)} placeholder="e.g. 50" />
                                </div>
                            </div>
                            <button className="btn btn-primary" onClick={predict} disabled={predicting}>
                                {predicting ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Predicting...</> : '🔮 Predict Difficulty'}
                            </button>
                        </div>

                        {prediction && (
                            <>
                                {/* Main score */}
                                <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '24px' }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>Difficulty Score</div>
                                    <div style={{ fontSize: '4rem', fontWeight: 900, color: DIFF_COLORS[prediction.difficulty_label], lineHeight: 1 }}>{prediction.difficulty_score}</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: DIFF_COLORS[prediction.difficulty_label], marginTop: 4 }}>{prediction.difficulty_label}</div>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: prediction.ranking_probability_pct >= 50 ? '#16a34a' : '#dc2626' }}>{prediction.ranking_probability_pct}%</div>
                                            <div className="text-sm text-muted">Ranking probability</div>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{prediction.estimated_time_to_rank}</div>
                                            <div className="text-sm text-muted">Time to rank</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                                    {[
                                        { label: 'Required Word Count', value: prediction.required_word_count.toLocaleString(), icon: '📝' },
                                        { label: 'Required Backlinks', value: prediction.required_backlinks, icon: '🔗' },
                                        { label: 'Required DA', value: prediction.required_da, icon: '📊' },
                                        { label: 'Avg Competitor DA', value: Math.round(prediction.top_competitor_das.reduce((a, b) => a + b, 0) / (prediction.top_competitor_das.length || 1)), icon: '⚔️' },
                                    ].map((s, i) => (
                                        <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.value}</div>
                                            <div className="text-sm text-muted">{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="card" style={{ marginBottom: 16 }}>
                                    <h3 className="card-title" style={{ marginBottom: 8 }}>Recommended Approach</h3>
                                    <p className="text-sm">{prediction.recommended_approach}</p>
                                </div>

                                <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 10, color: '#16a34a' }}>✅ Winning Factors</h3>
                                        {prediction.winning_factors.map((f, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>• {f}</div>)}
                                    </div>
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 10, color: '#dc2626' }}>⚠️ Risk Factors</h3>
                                        {prediction.risk_factors.map((f, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>• {f}</div>)}
                                    </div>
                                </div>

                                <div className="card" style={{ marginBottom: 16 }}>
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Content Requirements</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {prediction.content_requirements.map((r, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                                                <span className="text-sm">{r.requirement}</span>
                                                <Badge variant={r.importance === 'critical' ? 'danger' : r.importance === 'important' ? 'warning' : 'neutral'}>{r.importance}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {prediction.serp_features_present.length > 0 && (
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 10 }}>SERP Features Present</h3>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {prediction.serp_features_present.map((f, i) => <Badge key={i} variant="info">{f}</Badge>)}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* ===== POST PREDICTION TAB (from /post-predictor) ===== */}
                {activeTab === 'post' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Target Keyword *</label>
                                    <input className="form-input" value={postKeyword} onChange={e => setPostKeyword(e.target.value)} placeholder="best standing desks 2025" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche</label>
                                    <input className="form-input" value={postNiche} onChange={e => setPostNiche(e.target.value)} placeholder="home office" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Your DA</label>
                                    <input className="form-input" type="number" value={postDa} onChange={e => setPostDa(e.target.value)} placeholder="New site = leave blank" />
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
                            <button className="btn btn-primary" onClick={predictPost} disabled={postPredicting}>{postPredicting ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Predicting...</> : '🔮 Predict Performance'}</button>
                        </div>

                        {postPrediction && (
                            <>
                                {/* Ranking probability */}
                                <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                                    <div className="card" style={{ padding: '20px' }}>
                                        <h3 className="card-title" style={{ marginBottom: 14 }}>Ranking Probability</h3>
                                        <div style={{ display: 'flex', gap: 16, justifyContent: 'space-around' }}>
                                            {[
                                                { label: 'Top 3', value: postPrediction.ranking_probability.top_3 },
                                                { label: 'Top 10', value: postPrediction.ranking_probability.top_10 },
                                                { label: 'Top 30', value: postPrediction.ranking_probability.top_30 },
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
                                                <strong className="text-sm">{postPrediction.time_to_rank_months} months</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                                <span className="text-sm text-muted">Confidence:</span>
                                                <strong className="text-sm">{postPrediction.confidence_score}%</strong>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="card" style={{ padding: '20px' }}>
                                        <h3 className="card-title" style={{ marginBottom: 14 }}>Revenue Forecast</h3>
                                        {[
                                            { label: '3 months', traffic: postPrediction.expected_monthly_traffic.month_3, revenue: postPrediction.expected_monthly_revenue.month_3 },
                                            { label: '6 months', traffic: postPrediction.expected_monthly_traffic.month_6, revenue: postPrediction.expected_monthly_revenue.month_6 },
                                            { label: '12 months', traffic: postPrediction.expected_monthly_traffic.month_12, revenue: postPrediction.expected_monthly_revenue.month_12 },
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
                                            <div className="text-sm"><strong>ROI:</strong> {postPrediction.roi_estimate}</div>
                                            <div className="text-sm text-muted">Break-even: {postPrediction.break_even_timeline}</div>
                                        </div>
                                    </div>
                                </div>

                                {postPrediction.improvements_to_increase_success.length > 0 && (
                                    <div className="card" style={{ marginBottom: 16 }}>
                                        <h3 className="card-title" style={{ marginBottom: 10 }}>⚡ Boost Success Probability</h3>
                                        {postPrediction.improvements_to_increase_success.map((imp, i) => (
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
                                        {postPrediction.key_factors.map((f, i) => (
                                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                                <span>{impactIcon[f.impact]}</span>
                                                <div><div className="text-sm" style={{ fontWeight: 600 }}>{f.factor}</div><div className="text-sm text-muted">{f.explanation}</div></div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 10 }}>Advice</h3>
                                        <div style={{ marginBottom: 10 }}><div className="form-label">Timing</div><div className="text-sm">{postPrediction.publish_timing_advice}</div></div>
                                        <div><div className="form-label">Competitive Edge Needed</div><div className="text-sm">{postPrediction.competitive_advantage_needed}</div></div>
                                    </div>
                                </div>
                            </>
                        )}

                        {postHistory.length > 0 && !postPrediction && (
                            <div className="card" style={{ marginTop: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Previous Predictions</h3>
                                {postHistory.map((h, i) => (
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

                        {!postPrediction && !postPredicting && postHistory.length === 0 && <EmptyState icon="🔮" title="Enter keyword to predict performance" description="Get realistic traffic, revenue, and ranking probability estimates before investing time writing" />}
                    </>
                )}
            </main>
        </div>
    );
}
