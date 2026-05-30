'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface RankEntry {
    id: string; keyword: string; keyword_id: string; site_id: string;
    position: number | null; previous_position: number | null;
    url: string | null; serp_features: string[]; checked_at: string;
}
interface Site { id: string; name: string; url: string; }

// From /rank-history
interface Mover { keyword: string; change: number; current: number; previous: number; direction: string; }

export default function RankTrackingPage() {
    const [activeTab, setActiveTab] = useState<string>('main');

    // === Main tab state ===
    const [entries, setEntries] = useState<RankEntry[]>([]);
    const [stats, setStats] = useState({ totalTracked: 0, top3: 0, top10: 0, top20: 0, improved: 0, declined: 0, notRanking: 0 });
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

    // === History tab state (from /rank-history) ===
    const [historyData, setHistoryData] = useState<Record<string, Array<{ date: string; position: number }>>>({});
    const [movers, setMovers] = useState<Mover[]>([]);
    const [historySearch, setHistorySearch] = useState('');
    const [historyDays, setHistoryDays] = useState('90');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    const fetchHistory = async (siteId: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/rank-tracking?site_id=${siteId}`);
            const data = await res.json();
            setEntries(data.entries || []);
            setStats(data.stats || stats);
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    useEffect(() => { if (selectedSite) fetchHistory(selectedSite); }, [selectedSite]);

    const handleCheckRanks = async () => {
        if (!selectedSite) { toast.warning('Select a site first'); return; }
        setChecking(true);
        try {
            const res = await fetch('/api/rank-tracking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_id: selectedSite, device }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(`Checked ${data.checked} keywords`);
            fetchHistory(selectedSite);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Rank check failed');
        } finally { setChecking(false); }
    };

    const getChangeIcon = (pos: number | null, prev: number | null) => {
        if (!pos || !prev) return '—';
        const diff = prev - pos;
        if (diff > 0) return <span style={{ color: 'var(--accent-success)', fontWeight: 700 }}>↑{diff}</span>;
        if (diff < 0) return <span style={{ color: 'var(--accent-danger)', fontWeight: 700 }}>↓{Math.abs(diff)}</span>;
        return <span style={{ color: 'var(--text-muted)' }}>→</span>;
    };

    const getPositionColor = (pos: number | null) => {
        if (!pos) return 'var(--text-muted)';
        if (pos <= 3) return 'var(--accent-success)';
        if (pos <= 10) return 'var(--accent-info)';
        if (pos <= 20) return 'var(--accent-warning)';
        return 'var(--accent-danger)';
    };

    // Deduplicate: show latest entry per keyword
    const latestByKeyword: Record<string, RankEntry> = {};
    entries.forEach(e => { if (!latestByKeyword[e.keyword]) latestByKeyword[e.keyword] = e; });
    const latestEntries = Object.values(latestByKeyword);

    // Build history per keyword for sparklines
    const historyByKeyword: Record<string, { position: number; date: string }[]> = {};
    entries.forEach(e => {
        if (!e.position) return;
        if (!historyByKeyword[e.keyword]) historyByKeyword[e.keyword] = [];
        historyByKeyword[e.keyword].push({ position: e.position, date: e.checked_at });
    });
    Object.keys(historyByKeyword).forEach(kw => {
        historyByKeyword[kw] = historyByKeyword[kw]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-14);
    });

    // === History tab functions (from /rank-history) ===
    const loadRankHistory = async () => {
        if (!selectedSite && !historySearch) return;
        setHistoryLoading(true);
        const params = new URLSearchParams({ days: historyDays, limit: '20' });
        if (selectedSite) params.set('site_id', selectedSite);
        if (historySearch) params.set('keyword', historySearch);
        const res = await fetch(`/api/rank-history?${params}`);
        const data = await res.json();
        setHistoryData(data.history || {});
        setMovers(data.movers || []);
        setHistoryLoading(false);
    };

    // Auto-load history when switching to history tab with a site selected
    useEffect(() => {
        if (activeTab === 'history' && selectedSite && Object.keys(historyData).length === 0) {
            loadRankHistory();
        }
    }, [activeTab, selectedSite]);

    const renderSparkline = (positions: Array<{ date: string; position: number }>, width = 120, height = 32) => {
        if (positions.length < 2) return null;
        const maxPos = Math.max(...positions.map(p => p.position), 100);
        const minPos = Math.min(...positions.map(p => p.position), 1);
        const range = maxPos - minPos || 1;
        const points = positions.map((p, i) => {
            const x = (i / (positions.length - 1)) * width;
            const y = height - ((p.position - minPos) / range) * height;
            return `${x},${y}`;
        }).join(' ');
        const first = positions[0].position;
        const last = positions[positions.length - 1].position;
        const improved = last < first;
        return (
            <svg width={width} height={height} style={{ overflow: 'visible' }}>
                <polyline points={points} fill="none" stroke={improved ? '#16a34a' : '#dc2626'} strokeWidth="2" />
                <circle cx={(positions.length - 1) / (positions.length - 1) * width} cy={height - ((last - minPos) / range) * height} r="3" fill={improved ? '#16a34a' : '#dc2626'} />
            </svg>
        );
    };

    const changeColor = (change: number) => change > 0 ? '#16a34a' : change < 0 ? '#dc2626' : '#6b7280';
    const posColor = (pos: number) => pos <= 3 ? '#16a34a' : pos <= 10 ? '#d97706' : pos <= 30 ? '#6b7280' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Rank Tracker</h1>
                        <p className="page-description">Monitor keyword positions in Google search results</p>
                    </div>
                    <button className="btn btn-primary" onClick={handleCheckRanks} disabled={checking || !selectedSite}>
                        {checking ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Checking...</> : '🔍 Check Ranks Now'}
                    </button>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>📊 Rankings</button>
                    <button className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('history')}>📈 History</button>
                </div>

                {/* ===== MAIN TAB: Rankings ===== */}
                {activeTab === 'main' && (
                    <>
                        <div className="stat-grid" style={{ marginBottom: 24 }}>
                            <StatCard label="Keywords Tracked" value={stats.totalTracked} icon="🔍" />
                            <StatCard label="Top 3" value={stats.top3} icon="🥇" />
                            <StatCard label="Top 10" value={stats.top10} icon="📊" />
                            <StatCard label="Improved" value={stats.improved} icon="📈" />
                            <StatCard label="Declined" value={stats.declined} icon="📉" />
                            <StatCard label="Not Ranking" value={stats.notRanking} icon="❌" />
                        </div>

                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="flex items-center gap-3">
                                <div className="form-group" style={{ margin: 0, minWidth: 250 }}>
                                    <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                        <option value="">Select a site to track...</option>
                                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <span className="text-sm text-muted">Select a site to view rank data and run checks</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                    <button className={`btn btn-sm ${device === 'desktop' ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => setDevice('desktop')}>🖥️ Desktop</button>
                                    <button className={`btn btn-sm ${device === 'mobile' ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => setDevice('mobile')}>📱 Mobile</button>
                                </div>
                            </div>
                        </div>

                        {!selectedSite ? (
                            <div className="card">
                                <EmptyState icon="📈" title="Select a Site" description="Choose a WordPress site above to view keyword ranking positions and track changes over time." />
                            </div>
                        ) : loading ? (
                            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                <div className="spinner" style={{ margin: '0 auto 16px' }} />
                                <p className="text-sm text-muted">Loading rank data...</p>
                            </div>
                        ) : latestEntries.length === 0 ? (
                            <div className="card">
                                <EmptyState icon="📈" title="No Rank Data Yet"
                                    description="Click 'Check Ranks Now' to scan Google for your keyword positions. Make sure you have keywords saved for this site."
                                    action={<button className="btn btn-primary" onClick={handleCheckRanks} disabled={checking}>🔍 Run First Check</button>} />
                            </div>
                        ) : (
                            <>
                                {/* Position Distribution */}
                                <div className="card" style={{ marginBottom: 24 }}>
                                    <div className="card-header"><h2 className="card-title">📊 Position Distribution</h2></div>
                                    <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                                        {[
                                            { label: 'Top 3', count: stats.top3, color: '#22c55e', total: stats.totalTracked },
                                            { label: 'Top 10', count: stats.top10 - stats.top3, color: '#6366f1', total: stats.totalTracked },
                                            { label: 'Top 20', count: stats.top20 - stats.top10, color: '#f59e0b', total: stats.totalTracked },
                                            { label: '20+', count: stats.totalTracked - stats.top20 - stats.notRanking, color: '#ef4444', total: stats.totalTracked },
                                            { label: 'Not Ranking', count: stats.notRanking, color: '#6b7280', total: stats.totalTracked },
                                        ].map((seg, i) => (
                                            <div key={i} style={{ flex: 1, minWidth: 100, textAlign: 'center', padding: 12, background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${seg.color}` }}>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: seg.color }}>{seg.count}</div>
                                                <div className="text-sm" style={{ fontWeight: 500 }}>{seg.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Rankings Table */}
                                <div className="card">
                                    <div className="card-header"><h2 className="card-title">🔍 Keyword Rankings ({latestEntries.length})</h2></div>
                                    <div className="table-wrapper">
                                        <table className="data-table">
                                            <thead><tr><th>Keyword</th><th>Position</th><th>Trend</th><th>Change</th><th>AIO</th><th>URL</th><th>SERP Features</th><th>Last Check</th></tr></thead>
                                            <tbody>
                                                {latestEntries.sort((a, b) => (a.position || 999) - (b.position || 999)).map(entry => (
                                                    <tr key={entry.id}>
                                                        <td style={{ fontWeight: 600 }}>{entry.keyword}</td>
                                                        <td>
                                                            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: getPositionColor(entry.position) }}>
                                                                {entry.position ? `#${entry.position}` : '—'}
                                                            </span>
                                                        </td>
                                                        <td>{getChangeIcon(entry.position, entry.previous_position)}</td>
                                                        <td><MiniSparkline data={historyByKeyword[entry.keyword] || []} /></td>
                                                        <td>
                                                            {entry.serp_features?.includes('ai_overview') ? (
                                                                <span title="Cited in AI Overview" style={{ cursor: 'help' }}>
                                                                    <Badge variant="success">🤖 AIO</Badge>
                                                                </span>
                                                            ) : entry.serp_features?.some(f => f.toLowerCase().includes('ai')) ? (
                                                                <span title="AI Overview present but not cited" style={{ cursor: 'help' }}>
                                                                    <Badge variant="neutral">🤖</Badge>
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted">—</span>
                                                            )}
                                                        </td>
                                                        <td className="text-sm text-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {entry.url ? <a href={entry.url} target="_blank" rel="noopener" style={{ color: 'var(--accent-primary-light)' }}>{new URL(entry.url).pathname}</a> : '—'}
                                                        </td>
                                                        <td>
                                                            <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                                                                {entry.serp_features?.slice(0, 3).map((f, i) => <Badge key={i} variant="neutral">{f}</Badge>)}
                                                            </div>
                                                        </td>
                                                        <td className="text-sm text-muted">{new Date(entry.checked_at).toLocaleDateString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* ===== HISTORY TAB (from /rank-history) ===== */}
                {activeTab === 'history' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                                    <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                        <option value="">Select a site...</option>
                                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <input className="form-input" value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Filter keyword..." style={{ flex: 1, minWidth: 140 }} onKeyDown={e => e.key === 'Enter' && loadRankHistory()} />
                                <select className="form-input" value={historyDays} onChange={e => { setHistoryDays(e.target.value); }} style={{ width: 'auto' }}>
                                    <option value="30">30 days</option>
                                    <option value="90">90 days</option>
                                    <option value="180">6 months</option>
                                    <option value="365">1 year</option>
                                </select>
                                <button className="btn btn-primary" onClick={loadRankHistory} disabled={historyLoading}>{historyLoading ? '...' : '📈 Load'}</button>
                            </div>
                        </div>

                        {movers.length > 0 && (
                            <>
                                <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 10, color: '#16a34a' }}>📈 Top Movers (Gained)</h3>
                                        {movers.filter(m => m.change > 0).slice(0, 5).map((m, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setSelectedKeyword(m.keyword === selectedKeyword ? null : m.keyword)}>
                                                <span className="text-sm">{m.keyword}</span>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <span style={{ fontWeight: 700, color: '#16a34a' }}>+{m.change} ↑</span>
                                                    <span style={{ color: posColor(m.current), fontWeight: 700 }}>#{m.current}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 10, color: '#dc2626' }}>📉 Top Losers (Dropped)</h3>
                                        {movers.filter(m => m.change < 0).slice(0, 5).map((m, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setSelectedKeyword(m.keyword === selectedKeyword ? null : m.keyword)}>
                                                <span className="text-sm">{m.keyword}</span>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <span style={{ fontWeight: 700, color: '#dc2626' }}>{m.change} ↓</span>
                                                    <span style={{ color: posColor(m.current), fontWeight: 700 }}>#{m.current}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="card">
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>All Keywords — {historyDays} Day History</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {Object.entries(historyData).map(([kw, positions], i) => {
                                            const current = positions[positions.length - 1]?.position;
                                            const first = positions[0]?.position;
                                            const change = first - current;
                                            const isSelected = selectedKeyword === kw;

                                            return (
                                                <div key={i} style={{ padding: '8px 12px', background: isSelected ? 'var(--bg-card)' : 'var(--bg-secondary)', borderRadius: 6, cursor: 'pointer', border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent' }}
                                                    onClick={() => setSelectedKeyword(isSelected ? null : kw)}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                            <span style={{ fontWeight: 600 }}>{kw}</span>
                                                            <span style={{ fontWeight: 700, color: posColor(current), fontSize: '1rem' }}>#{current}</span>
                                                            {change !== 0 && <span style={{ fontWeight: 700, color: changeColor(change), fontSize: '0.8rem' }}>{change > 0 ? '+' : ''}{change}</span>}
                                                        </div>
                                                        {renderSparkline(positions)}
                                                    </div>

                                                    {isSelected && positions.length > 0 && (
                                                        <div style={{ marginTop: 12 }}>
                                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                                {positions.map((p, pi) => (
                                                                    <div key={pi} style={{ textAlign: 'center', minWidth: 40 }}>
                                                                        <div style={{ fontWeight: 700, color: posColor(p.position), fontSize: '0.85rem' }}>#{p.position}</div>
                                                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{p.date.substring(5)}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}

                        {!Object.keys(historyData).length && !historyLoading && <EmptyState icon="📈" title="Select a site and load history" description="Shows keyword position trends, movers, and sparkline charts over time" />}
                    </>
                )}
            </main>
        </div>
    );
}

// Mini SVG sparkline component for rank history
function MiniSparkline({ data }: { data: { position: number; date: string }[] }) {
    if (data.length < 2) return <span className="text-muted text-xs">—</span>;

    const w = 80, h = 24, pad = 2;
    const positions = data.map(d => d.position);
    const minP = Math.min(...positions);
    const maxP = Math.max(...positions);
    const range = maxP - minP || 1;

    // Note: lower position = better rank, so we invert Y axis
    const points = positions.map((p, i) => {
        const x = pad + (i / (positions.length - 1)) * (w - 2 * pad);
        const y = pad + ((p - minP) / range) * (h - 2 * pad);
        return `${x},${y}`;
    });

    const improving = positions[positions.length - 1] < positions[0];
    const color = improving ? '#22c55e' : positions[positions.length - 1] > positions[0] ? '#ef4444' : '#6b7280';

    return (
        <svg width={w} height={h} style={{ display: 'block' }}>
            <polyline
                points={points.join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle
                cx={parseFloat(points[points.length - 1].split(',')[0])}
                cy={parseFloat(points[points.length - 1].split(',')[1])}
                r={2.5}
                fill={color}
            />
        </svg>
    );
}
