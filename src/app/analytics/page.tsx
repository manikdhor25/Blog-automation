'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge } from '@/components/ui';

interface AnalyticsData {
    overview: {
        totalSites: number; totalKeywords: number; totalPosts: number;
        publishedPosts: number; draftPosts: number; avgScore: number;
        decayAlerts: number; totalBacklinks: number; activeBacklinks: number;
        newBacklinks: number; lostBacklinks: number;
    };
    queue: { draft: number; review: number; scheduled: number; published: number };
    intentDistribution: Record<string, number>;
    weeklyPosts: number[];
    apiUsage: { totalCost: number; totalCalls: number; recentUsage: { provider: string; task: string; estimated_cost: string; created_at: string }[] };
    rankTracking?: { top3: number; top10: number; top20: number; notRanking: number; total: number };
    abTests?: { active: number; completed: number; avgLift: number };
    affiliateRevenue?: { total: number; thisMonth: number; clicks: number };
}

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/analytics').then(r => r.json()).then(setData).catch(() => { }).finally(() => setLoading(false));
    }, []);

    const BarChart = ({ data: chartData, label }: { data: { name: string; value: number; color: string }[]; label: string }) => {
        const max = Math.max(...chartData.map(d => d.value), 1);
        return (
            <div>
                <div className="text-sm" style={{ fontWeight: 600, marginBottom: 12 }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
                    {chartData.map((item, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span className="text-sm" style={{ fontWeight: 600 }}>{item.value}</span>
                            <div style={{
                                width: '100%', borderRadius: '6px 6px 0 0', background: item.color,
                                height: `${Math.max(8, (item.value / max) * 120)}px`, transition: 'height 0.5s ease', minWidth: 24,
                            }} />
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const DonutChart = ({ segments, size = 120 }: { segments: { label: string; value: number; color: string }[]; size?: number }) => {
        const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
        let cumulative = 0;
        const gradientParts = segments.map(seg => {
            const start = (cumulative / total) * 360;
            cumulative += seg.value;
            const end = (cumulative / total) * 360;
            return `${seg.color} ${start}deg ${end}deg`;
        });
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${gradientParts.join(', ')})`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: size * 0.6, height: size * 0.6, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>{total}</span>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>TOTAL</span>
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    {segments.map((seg, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color }} />
                            <span className="text-sm">{seg.label}: <strong>{seg.value}</strong></span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const o = data?.overview;
    const q = data?.queue;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Analytics</h1>
                        <p className="page-description">Real-time SEO performance metrics from your data</p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); fetch('/api/analytics').then(r => r.json()).then(setData).finally(() => setLoading(false)); }}>
                        🔄 Refresh
                    </button>
                </div>

                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                        <div className="spinner" style={{ margin: '0 auto 16px' }} />
                        <p className="text-sm text-muted">Loading real analytics...</p>
                    </div>
                ) : (
                    <>
                        <div className="stat-grid" style={{ marginBottom: 24 }}>
                            <StatCard label="Connected Sites" value={o?.totalSites || 0} icon="🌐" delay={0} />
                            <StatCard label="Tracked Keywords" value={o?.totalKeywords || 0} icon="🔍" delay={1} />
                            <StatCard label="Total Posts" value={o?.totalPosts || 0} icon="📝" delay={2} />
                            <StatCard label="Avg SEO Score" value={o?.avgScore || '—'} icon="📊" delay={3} />
                            <StatCard label="Decay Alerts" value={o?.decayAlerts || 0} icon="⏰" delay={4} />
                            <StatCard label="Backlinks" value={o?.totalBacklinks || 0} icon="🔗" delay={5} />
                            <StatCard label="A/B Tests" value={data?.abTests?.active || 0} icon="🧪" delay={6} />
                            <StatCard label="Affiliate Rev" value={`$${(data?.affiliateRevenue?.total || 0).toFixed(0)}`} icon="💰" delay={7} />
                        </div>

                        {/* Charts Row */}
                        <div className="grid-2" style={{ gap: 24, marginBottom: 24 }}>
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">📊 Content Pipeline</h2>
                                </div>
                                <DonutChart segments={[
                                    { label: 'Published', value: o?.publishedPosts || 0, color: 'var(--accent-success)' },
                                    { label: 'Drafts', value: o?.draftPosts || 0, color: 'var(--accent-warning)' },
                                    { label: 'In Queue', value: (q?.draft || 0) + (q?.review || 0), color: 'var(--accent-info)' },
                                    { label: 'Scheduled', value: q?.scheduled || 0, color: '#8b5cf6' },
                                ]} />
                            </div>

                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">📈 Weekly Publishing</h2>
                                </div>
                                <BarChart label="Posts Created (Last 4 Weeks)" data={
                                    (data?.weeklyPosts || [0, 0, 0, 0]).map((v, i) => ({
                                        name: i === 0 ? 'This Week' : `${i}w ago`,
                                        value: v,
                                        color: i === 0 ? 'var(--accent-primary)' : 'var(--accent-info)',
                                    }))
                                } />
                            </div>
                        </div>

                        <div className="grid-2" style={{ gap: 24, marginBottom: 24 }}>
                            {/* Keyword Intent Distribution */}
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">🎯 Keyword Intent Mix</h2>
                                </div>
                                {data?.intentDistribution && Object.keys(data.intentDistribution).length > 0 ? (
                                    <DonutChart segments={Object.entries(data.intentDistribution).map(([intent, count], i) => ({
                                        label: intent.charAt(0).toUpperCase() + intent.slice(1),
                                        value: count,
                                        color: ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5],
                                    }))} />
                                ) : (
                                    <p className="text-sm text-muted" style={{ padding: 20, textAlign: 'center' }}>No keyword data yet. Add keywords via Keyword Intel.</p>
                                )}
                            </div>

                            {/* Backlink Overview */}
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">🔗 Backlink Overview</h2>
                                </div>
                                <BarChart label="Backlink Status" data={[
                                    { name: 'Active', value: o?.activeBacklinks || 0, color: 'var(--accent-success)' },
                                    { name: 'New', value: o?.newBacklinks || 0, color: 'var(--accent-info)' },
                                    { name: 'Lost', value: o?.lostBacklinks || 0, color: 'var(--accent-danger)' },
                                ]} />
                            </div>
                        </div>

                        {/* Row 3: Rank Distribution + Revenue */}
                        <div className="grid-2" style={{ gap: 24, marginBottom: 24 }}>
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">🏆 Rank Distribution</h2>
                                </div>
                                <BarChart label="Keyword Positions" data={[
                                    { name: 'Top 3', value: data?.rankTracking?.top3 || 0, color: '#22c55e' },
                                    { name: 'Top 10', value: (data?.rankTracking?.top10 || 0) - (data?.rankTracking?.top3 || 0), color: '#6366f1' },
                                    { name: 'Top 20', value: (data?.rankTracking?.top20 || 0) - (data?.rankTracking?.top10 || 0), color: '#f59e0b' },
                                    { name: '20+', value: Math.max(0, (data?.rankTracking?.total || 0) - (data?.rankTracking?.top20 || 0) - (data?.rankTracking?.notRanking || 0)), color: '#ef4444' },
                                    { name: 'N/A', value: data?.rankTracking?.notRanking || 0, color: '#6b7280' },
                                ]} />
                            </div>
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">💰 Revenue & Testing</h2>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                        <div className="text-sm" style={{ fontWeight: 500, marginBottom: 4 }}>💰 Affiliate Revenue</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-success)' }}>${(data?.affiliateRevenue?.total || 0).toFixed(2)}</div>
                                        <div className="text-sm text-muted">{data?.affiliateRevenue?.clicks || 0} clicks this month</div>
                                    </div>
                                    <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                        <div className="text-sm" style={{ fontWeight: 500, marginBottom: 4 }}>🧪 A/B Test Performance</div>
                                        <div className="flex gap-3">
                                            <div><span style={{ fontWeight: 700 }}>{data?.abTests?.active || 0}</span> <span className="text-sm text-muted">active</span></div>
                                            <div><span style={{ fontWeight: 700 }}>{data?.abTests?.completed || 0}</span> <span className="text-sm text-muted">completed</span></div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px 16px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                        <div className="text-sm" style={{ fontWeight: 500, marginBottom: 4 }}>💸 API Cost (Total)</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>${(data?.apiUsage?.totalCost || 0).toFixed(4)}</div>
                                        <div className="text-sm text-muted">{data?.apiUsage?.totalCalls || 0} total calls</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Insights */}
                        <div className="card">
                            <div className="card-header">
                                <h2 className="card-title">💡 Automated Insights</h2>
                            </div>
                            <div className="flex flex-col gap-3">
                                {(o?.avgScore || 0) >= 70 && (
                                    <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                        <div className="flex items-center gap-2"><Badge variant="success">STRONG</Badge><span className="text-sm" style={{ fontWeight: 500 }}>Average SEO score is {o?.avgScore}. Your content quality is excellent.</span></div>
                                    </div>
                                )}
                                {(o?.avgScore || 0) > 0 && (o?.avgScore || 0) < 70 && (
                                    <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                        <div className="flex items-center gap-2"><Badge variant="warning">IMPROVE</Badge><span className="text-sm" style={{ fontWeight: 500 }}>Average score is {o?.avgScore}. Use the Content Optimizer to improve existing posts.</span></div>
                                    </div>
                                )}
                                {(o?.decayAlerts || 0) > 0 && (
                                    <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                        <div className="flex items-center gap-2"><Badge variant="danger">ALERT</Badge><span className="text-sm" style={{ fontWeight: 500 }}>{o?.decayAlerts} posts showing decay signals</span></div>
                                        <p className="text-sm text-muted" style={{ marginTop: 4 }}><a href="/decay" style={{ color: 'var(--accent-primary-light)' }}>Review decay alerts →</a></p>
                                    </div>
                                )}
                                {(data?.apiUsage?.totalCost || 0) > 0 && (
                                    <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                        <div className="flex items-center gap-2"><Badge variant="info">COST</Badge><span className="text-sm" style={{ fontWeight: 500 }}>API usage: ${data?.apiUsage.totalCost.toFixed(4)} across {data?.apiUsage.totalCalls} calls</span></div>
                                        <p className="text-sm text-muted" style={{ marginTop: 4 }}><a href="/costs" style={{ color: 'var(--accent-primary-light)' }}>View cost details →</a></p>
                                    </div>
                                )}
                                <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                    <div className="flex items-center gap-2"><Badge variant="info">GOAL</Badge><span className="text-sm" style={{ fontWeight: 500 }}>Publish 3+ articles per week for topical authority</span></div>
                                    <p className="text-sm text-muted" style={{ marginTop: 4 }}>Use the Content Calendar to stay on schedule.</p>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
