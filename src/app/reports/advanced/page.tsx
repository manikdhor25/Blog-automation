'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';

/* ─────────────── Type Definitions ─────────────── */
interface CostByProvider { provider: string; totalCost: number; calls: number }
interface CostByModel { model: string; totalCost: number; calls: number }
interface DailyCost { date: string; cost: number; calls: number }
interface DurationByType { contentType: string; avgDurationMs: number; count: number }
interface ScoreOverTime { date: string; seo: number; aeo: number; eeat: number; readability: number; naturalness: number; overall: number }
interface ModelEfficiency { model: string; provider: string; totalCost: number; avgTokens: number; totalTokensIn: number; totalTokensOut: number; calls: number }
interface ContentTypeDist { contentType: string; count: number; avgScore: number; avgCost: number; totalCost: number }

interface AdvancedReport {
    production: {
        totalArticles: number; totalWords: number; avgOverallScore: number;
        avgGenerationTimeMs: number; articlesThisWeek: number; articlesLastWeek: number; weekOverWeekChange: number;
    };
    costs: {
        totalAICost: number; avgCostPerArticle: number;
        costByProvider: CostByProvider[]; costByModel: CostByModel[];
        dailyCostData: DailyCost[];
    };
    pipeline: {
        avgDurationMs: number; p95DurationMs: number;
        fastestArticle: { keyword: string; durationMs: number };
        slowestArticle: { keyword: string; durationMs: number };
        durationByContentType: DurationByType[];
    };
    quality: {
        scoresOverTime: ScoreOverTime[];
        scoreDistribution: Record<string, number>;
    };
    modelEfficiency: ModelEfficiency[];
    contentTypeDistribution: ContentTypeDist[];
}

/* ─────────────── Formatters ─────────────── */
const fmt = {
    cost: (v: number) => `$${v.toFixed(2)}`,
    number: (v: number) => v.toLocaleString(),
    words: (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : `${v}`,
    duration: (ms: number) => {
        const s = Math.round(ms / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    },
    pct: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`,
    tokens: (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : `${v}`,
};

const scoreColor = (v: number) => v >= 70 ? '#22c55e' : v >= 50 ? '#eab308' : '#ef4444';
const changeColor = (v: number) => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#94a3b8';

/* ─────────────── Component ─────────────── */
export default function AdvancedReportsPage() {
    const [data, setData] = useState<AdvancedReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);
    const [error, setError] = useState('');

    const fetchData = useCallback(async (d: number) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/reports/advanced?days=${d}`);
            if (!res.ok) throw new Error('Failed to fetch');
            const json = await res.json();
            setData(json);
        } catch {
            setError('Failed to load report data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(days); }, [days, fetchData]);

    const ranges = [
        { label: '7d', value: 7 },
        { label: '30d', value: 30 },
        { label: '90d', value: 90 },
        { label: 'All Time', value: 0 },
    ];

    const rangeLabel = ranges.find(r => r.value === days)?.label || '30d';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <style>{cssStyles}</style>

                {/* Page Header */}
                <div className="ar-header">
                    <div>
                        <h1 className="ar-title">📊 Advanced Reports</h1>
                        <p className="ar-subtitle">Showing data for the last {rangeLabel}</p>
                    </div>
                    <div className="ar-range-group">
                        {ranges.map(r => (
                            <button
                                key={r.value}
                                className={`ar-range-btn ${days === r.value ? 'active' : ''}`}
                                onClick={() => setDays(r.value)}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <div className="ar-error">{error}</div>}

                {loading ? <LoadingSkeleton /> : data && (
                    <div className="ar-dashboard">
                        {/* Section 1: Production KPIs */}
                        <section className="ar-section ar-fade-in" style={{ animationDelay: '0ms' }}>
                            <h2 className="ar-section-title">
                                <span className="ar-section-icon">🚀</span>
                                Production KPIs
                            </h2>
                            <div className="ar-grid-4">
                                <StatCard
                                    label="Total Articles"
                                    value={data.production.totalArticles}
                                    badge={fmt.pct(data.production.weekOverWeekChange)}
                                    badgeColor={changeColor(data.production.weekOverWeekChange)}
                                    icon="📝"
                                />
                                <StatCard
                                    label="Total Words"
                                    value={fmt.words(data.production.totalWords)}
                                    sub={`${fmt.number(data.production.totalWords)} exact`}
                                    icon="📖"
                                />
                                <StatCard
                                    label="Avg Quality Score"
                                    value={data.production.avgOverallScore.toFixed(1)}
                                    valueColor={scoreColor(data.production.avgOverallScore)}
                                    sub="out of 100"
                                    icon="⭐"
                                />
                                <StatCard
                                    label="Avg Generation Time"
                                    value={fmt.duration(data.production.avgGenerationTimeMs)}
                                    icon="⏱️"
                                />
                            </div>
                        </section>

                        {/* Section 2: Cost Analytics */}
                        <section className="ar-section ar-fade-in" style={{ animationDelay: '80ms' }}>
                            <h2 className="ar-section-title">
                                <span className="ar-section-icon">💰</span>
                                Cost Analytics
                            </h2>
                            <div className="ar-grid-2" style={{ marginBottom: 20 }}>
                                <StatCard
                                    label="Total AI Cost"
                                    value={fmt.cost(data.costs.totalAICost)}
                                    icon="💳"
                                    accent
                                />
                                <StatCard
                                    label="Avg Cost / Article"
                                    value={fmt.cost(data.costs.avgCostPerArticle)}
                                    icon="📊"
                                    accent
                                />
                            </div>
                            <div className="ar-grid-2">
                                <div className="ar-glass-card">
                                    <h3 className="ar-table-title">Cost by Provider</h3>
                                    <table className="ar-table">
                                        <thead>
                                            <tr><th>Provider</th><th>Calls</th><th>Cost</th></tr>
                                        </thead>
                                        <tbody>
                                            {data.costs.costByProvider.map((p, i) => (
                                                <tr key={i}>
                                                    <td><span className="ar-provider-badge">{p.provider}</span></td>
                                                    <td>{fmt.number(p.calls)}</td>
                                                    <td className="ar-cost-cell">{fmt.cost(p.totalCost)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="ar-glass-card">
                                    <h3 className="ar-table-title">Cost by Model</h3>
                                    <table className="ar-table">
                                        <thead>
                                            <tr><th>Model</th><th>Calls</th><th>Cost</th></tr>
                                        </thead>
                                        <tbody>
                                            {data.costs.costByModel.map((m, i) => (
                                                <tr key={i}>
                                                    <td><span className="ar-model-badge">{m.model}</span></td>
                                                    <td>{fmt.number(m.calls)}</td>
                                                    <td className="ar-cost-cell">{fmt.cost(m.totalCost)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>

                        {/* Section 3: Pipeline Performance */}
                        <section className="ar-section ar-fade-in" style={{ animationDelay: '160ms' }}>
                            <h2 className="ar-section-title">
                                <span className="ar-section-icon">⚡</span>
                                Pipeline Performance
                            </h2>
                            <div className="ar-grid-4" style={{ marginBottom: 20 }}>
                                <StatCard
                                    label="Avg Duration"
                                    value={fmt.duration(data.pipeline.avgDurationMs)}
                                    icon="⏳"
                                />
                                <StatCard
                                    label="P95 Duration"
                                    value={fmt.duration(data.pipeline.p95DurationMs)}
                                    icon="📈"
                                />
                                <StatCard
                                    label="Fastest Article"
                                    value={fmt.duration(data.pipeline.fastestArticle.durationMs)}
                                    sub={data.pipeline.fastestArticle.keyword}
                                    valueColor="#22c55e"
                                    icon="🏎️"
                                />
                                <StatCard
                                    label="Slowest Article"
                                    value={fmt.duration(data.pipeline.slowestArticle.durationMs)}
                                    sub={data.pipeline.slowestArticle.keyword}
                                    valueColor="#ef4444"
                                    icon="🐢"
                                />
                            </div>
                            <div className="ar-glass-card">
                                <h3 className="ar-table-title">Duration by Content Type</h3>
                                <table className="ar-table">
                                    <thead>
                                        <tr><th>Content Type</th><th>Count</th><th>Avg Duration</th></tr>
                                    </thead>
                                    <tbody>
                                        {data.pipeline.durationByContentType.map((d, i) => (
                                            <tr key={i}>
                                                <td><span className="ar-type-badge">{d.contentType}</span></td>
                                                <td>{d.count}</td>
                                                <td>{fmt.duration(d.avgDurationMs)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* Section 4: Quality Score Distribution */}
                        <section className="ar-section ar-fade-in" style={{ animationDelay: '240ms' }}>
                            <h2 className="ar-section-title">
                                <span className="ar-section-icon">🎯</span>
                                Quality Score Distribution
                            </h2>
                            <div className="ar-glass-card">
                                <QualityBars distribution={data.quality.scoreDistribution} />
                            </div>
                        </section>

                        {/* Section 5: Model Efficiency */}
                        <section className="ar-section ar-fade-in" style={{ animationDelay: '320ms' }}>
                            <h2 className="ar-section-title">
                                <span className="ar-section-icon">🤖</span>
                                Model Efficiency
                            </h2>
                            <div className="ar-glass-card ar-table-scroll">
                                <table className="ar-table">
                                    <thead>
                                        <tr>
                                            <th>Model</th>
                                            <th>Provider</th>
                                            <th>Calls</th>
                                            <th>Tokens In</th>
                                            <th>Tokens Out</th>
                                            <th>Total Cost</th>
                                            <th>Avg Cost/Call</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...data.modelEfficiency]
                                            .sort((a, b) => b.totalCost - a.totalCost)
                                            .map((m, i) => (
                                                <tr key={i}>
                                                    <td><span className="ar-model-badge">{m.model}</span></td>
                                                    <td><span className="ar-provider-badge">{m.provider}</span></td>
                                                    <td>{fmt.number(m.calls)}</td>
                                                    <td>{fmt.tokens(m.totalTokensIn)}</td>
                                                    <td>{fmt.tokens(m.totalTokensOut)}</td>
                                                    <td className="ar-cost-cell">{fmt.cost(m.totalCost)}</td>
                                                    <td className="ar-cost-cell">{fmt.cost(m.calls > 0 ? m.totalCost / m.calls : 0)}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* Section 6: Content Type Distribution */}
                        <section className="ar-section ar-fade-in" style={{ animationDelay: '400ms' }}>
                            <h2 className="ar-section-title">
                                <span className="ar-section-icon">📑</span>
                                Content Type Distribution
                            </h2>
                            <div className="ar-glass-card">
                                <table className="ar-table">
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Count</th>
                                            <th>Avg Score</th>
                                            <th>Avg Cost</th>
                                            <th>Total Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.contentTypeDistribution.map((ct, i) => (
                                            <tr key={i}>
                                                <td><span className="ar-type-badge">{ct.contentType}</span></td>
                                                <td>{ct.count}</td>
                                                <td>
                                                    <span style={{ color: scoreColor(ct.avgScore), fontWeight: 600 }}>
                                                        {ct.avgScore.toFixed(1)}
                                                    </span>
                                                </td>
                                                <td className="ar-cost-cell">{fmt.cost(ct.avgCost)}</td>
                                                <td className="ar-cost-cell">{fmt.cost(ct.totalCost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}

/* ─────────────── Stat Card ─────────────── */
function StatCard({ label, value, icon, badge, badgeColor, sub, valueColor, accent }: {
    label: string; value: string | number; icon: string;
    badge?: string; badgeColor?: string; sub?: string; valueColor?: string; accent?: boolean;
}) {
    return (
        <div className={`ar-stat-card ${accent ? 'ar-stat-accent' : ''}`}>
            <div className="ar-stat-header">
                <span className="ar-stat-icon">{icon}</span>
                <span className="ar-stat-label">{label}</span>
            </div>
            <div className="ar-stat-value" style={valueColor ? { color: valueColor } : undefined}>
                {value}
                {badge && (
                    <span className="ar-stat-badge" style={{ background: `${badgeColor}20`, color: badgeColor }}>
                        {badge}
                    </span>
                )}
            </div>
            {sub && <div className="ar-stat-sub">{sub}</div>}
        </div>
    );
}

/* ─────────────── Quality Bars ─────────────── */
function QualityBars({ distribution }: { distribution: Record<string, number> }) {
    const bands = ['0-30', '30-50', '50-70', '70-85', '85-100'];
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4'];
    const gradients = [
        'linear-gradient(90deg, #ef4444, #f97316)',
        'linear-gradient(90deg, #f97316, #eab308)',
        'linear-gradient(90deg, #eab308, #84cc16)',
        'linear-gradient(90deg, #22c55e, #10b981)',
        'linear-gradient(90deg, #06b6d4, #3b82f6)',
    ];
    const maxCount = Math.max(...Object.values(distribution), 1);

    return (
        <div className="ar-quality-bars">
            {bands.map((band, i) => {
                const count = distribution[band] || 0;
                const pct = (count / maxCount) * 100;
                return (
                    <div key={band} className="ar-qb-row">
                        <div className="ar-qb-label" style={{ color: colors[i] }}>{band}</div>
                        <div className="ar-qb-track">
                            <div
                                className="ar-qb-fill"
                                style={{ width: `${pct}%`, background: gradients[i] }}
                            />
                        </div>
                        <div className="ar-qb-count">{count}</div>
                    </div>
                );
            })}
        </div>
    );
}

/* ─────────────── Loading Skeleton ─────────────── */
function LoadingSkeleton() {
    return (
        <div className="ar-skeleton-wrap">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="ar-skeleton-section">
                    <div className="ar-skeleton ar-sk-title" />
                    <div className="ar-skeleton-grid">
                        {[1, 2, 3, 4].map(j => (
                            <div key={j} className="ar-skeleton ar-sk-card" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ─────────────── Styles ─────────────── */
const cssStyles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

/* Header */
.ar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
    flex-wrap: wrap;
    gap: 16px;
}
.ar-title {
    font-family: 'Inter', sans-serif;
    font-size: 2rem;
    font-weight: 800;
    background: linear-gradient(135deg, #7c3aed, #3b82f6, #06b6d4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0;
    letter-spacing: -0.5px;
}
.ar-subtitle {
    font-family: 'Inter', sans-serif;
    color: #94a3b8;
    font-size: 0.9rem;
    margin: 4px 0 0;
}

/* Range Selector */
.ar-range-group {
    display: flex;
    gap: 4px;
    background: rgba(255,255,255,0.04);
    border-radius: 12px;
    padding: 4px;
    border: 1px solid rgba(255,255,255,0.06);
}
.ar-range-btn {
    font-family: 'Inter', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 8px 18px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.25s ease;
}
.ar-range-btn:hover {
    color: #e2e8f0;
    background: rgba(255,255,255,0.06);
}
.ar-range-btn.active {
    background: linear-gradient(135deg, #7c3aed, #3b82f6);
    color: #fff;
    box-shadow: 0 4px 15px rgba(124,58,237,0.3);
}

/* Error */
.ar-error {
    font-family: 'Inter', sans-serif;
    background: rgba(239,68,68,0.12);
    border: 1px solid rgba(239,68,68,0.3);
    color: #fca5a5;
    padding: 14px 20px;
    border-radius: 12px;
    margin-bottom: 24px;
    font-size: 0.9rem;
}

/* Dashboard */
.ar-dashboard {
    display: flex;
    flex-direction: column;
    gap: 32px;
}

/* Sections */
.ar-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.ar-section-title {
    font-family: 'Inter', sans-serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: #e2e8f0;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
}
.ar-section-icon {
    font-size: 1.3rem;
}

/* Grids */
.ar-grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}
.ar-grid-2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
}

@media (max-width: 1024px) {
    .ar-grid-4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
    .ar-grid-4 { grid-template-columns: 1fr; }
    .ar-grid-2 { grid-template-columns: 1fr; }
}

/* Stat Cards */
.ar-stat-card {
    font-family: 'Inter', sans-serif;
    position: relative;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 22px 20px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}
.ar-stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, #7c3aed, #3b82f6, #06b6d4);
    opacity: 0;
    transition: opacity 0.3s ease;
}
.ar-stat-card:hover {
    transform: translateY(-3px);
    border-color: rgba(124,58,237,0.3);
    box-shadow: 0 8px 32px rgba(124,58,237,0.12), 0 2px 12px rgba(0,0,0,0.2);
}
.ar-stat-card:hover::before {
    opacity: 1;
}
.ar-stat-accent {
    background: linear-gradient(135deg, rgba(124,58,237,0.1), rgba(59,130,246,0.08));
    border-color: rgba(124,58,237,0.2);
}
.ar-stat-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}
.ar-stat-icon {
    font-size: 1.3rem;
}
.ar-stat-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.ar-stat-value {
    font-size: 1.8rem;
    font-weight: 800;
    color: #f1f5f9;
    line-height: 1.1;
    display: flex;
    align-items: center;
    gap: 10px;
    letter-spacing: -0.5px;
}
.ar-stat-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 20px;
    letter-spacing: 0;
}
.ar-stat-sub {
    font-size: 0.78rem;
    color: #64748b;
    margin-top: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Glass Card */
.ar-glass-card {
    font-family: 'Inter', sans-serif;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    padding: 24px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    overflow: hidden;
}
.ar-table-scroll {
    overflow-x: auto;
}

/* Tables */
.ar-table-title {
    font-family: 'Inter', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: #cbd5e1;
    margin: 0 0 16px;
}
.ar-table {
    font-family: 'Inter', sans-serif;
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}
.ar-table thead th {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #64748b;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    text-align: left;
    white-space: nowrap;
}
.ar-table tbody tr {
    transition: background 0.2s ease;
}
.ar-table tbody tr:hover {
    background: rgba(255,255,255,0.04);
}
.ar-table tbody td {
    font-size: 0.85rem;
    color: #cbd5e1;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    white-space: nowrap;
}
.ar-table tbody tr:last-child td {
    border-bottom: none;
}

/* Badges */
.ar-provider-badge,
.ar-model-badge,
.ar-type-badge {
    font-family: 'Inter', sans-serif;
    display: inline-block;
    font-size: 0.78rem;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 8px;
    white-space: nowrap;
}
.ar-provider-badge {
    background: rgba(124,58,237,0.15);
    color: #a78bfa;
}
.ar-model-badge {
    background: rgba(59,130,246,0.15);
    color: #93c5fd;
}
.ar-type-badge {
    background: rgba(6,182,212,0.15);
    color: #67e8f9;
}
.ar-cost-cell {
    font-weight: 600;
    color: #fbbf24 !important;
}

/* Quality Bars */
.ar-quality-bars {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 8px 0;
}
.ar-qb-row {
    display: flex;
    align-items: center;
    gap: 14px;
}
.ar-qb-label {
    font-family: 'Inter', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    min-width: 60px;
    text-align: right;
}
.ar-qb-track {
    flex: 1;
    height: 28px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    overflow: hidden;
    position: relative;
}
.ar-qb-fill {
    height: 100%;
    border-radius: 8px;
    transition: width 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    min-width: 2px;
    position: relative;
}
.ar-qb-fill::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%);
    border-radius: 8px;
}
.ar-qb-count {
    font-family: 'Inter', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: #e2e8f0;
    min-width: 36px;
}

/* Fade-in Animation */
@keyframes arFadeIn {
    from { opacity: 0; transform: translateY(18px); }
    to { opacity: 1; transform: translateY(0); }
}
.ar-fade-in {
    animation: arFadeIn 0.5s ease forwards;
    opacity: 0;
}

/* Skeleton Loading */
.ar-skeleton-wrap {
    display: flex;
    flex-direction: column;
    gap: 36px;
}
.ar-skeleton-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.ar-skeleton {
    border-radius: 12px;
    background: linear-gradient(
        90deg,
        rgba(255,255,255,0.04) 25%,
        rgba(255,255,255,0.08) 50%,
        rgba(255,255,255,0.04) 75%
    );
    background-size: 200% 100%;
    animation: arShimmer 1.5s infinite;
}
.ar-sk-title {
    width: 200px;
    height: 24px;
}
.ar-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}
.ar-sk-card {
    height: 120px;
}
@keyframes arShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

@media (max-width: 1024px) {
    .ar-skeleton-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
    .ar-skeleton-grid { grid-template-columns: 1fr; }
    .ar-header { flex-direction: column; align-items: flex-start; }
    .ar-title { font-size: 1.5rem; }
}
`;
