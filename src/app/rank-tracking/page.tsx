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

export default function RankTrackingPage() {
    const [entries, setEntries] = useState<RankEntry[]>([]);
    const [stats, setStats] = useState({ totalTracked: 0, top3: 0, top10: 0, top20: 0, improved: 0, declined: 0, notRanking: 0 });
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

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
    // Sort oldest first and limit to last 14 data points
    Object.keys(historyByKeyword).forEach(kw => {
        historyByKeyword[kw] = historyByKeyword[kw]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-14);
    });

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
        const y = pad + ((p - minP) / range) * (h - 2 * pad); // higher pos = lower on chart
        return `${x},${y}`;
    });

    // Trend: compare first and last
    const improving = positions[positions.length - 1] < positions[0]; // lower = better
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
            {/* Latest position dot */}
            <circle
                cx={parseFloat(points[points.length - 1].split(',')[0])}
                cy={parseFloat(points[points.length - 1].split(',')[1])}
                r={2.5}
                fill={color}
            />
        </svg>
    );
}
