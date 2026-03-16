'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface DecayReport {
    postId: string;
    title: string;
    slug: string;
    siteId: string;
    publishedAt: string;
    daysSincePublish: number;
    daysSinceOptimize: number | null;
    currentScore: number;
    decayReason: { type: string; description: string; weight: number }[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    suggestedAction: string;
}

interface DecaySummary {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
}

interface Site {
    id: string;
    name: string;
}

export default function DecayPage() {
    const [reports, setReports] = useState<DecayReport[]>([]);
    const [summary, setSummary] = useState<DecaySummary>({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    const handleScan = async () => {
        setLoading(true);
        try {
            const url = selectedSite ? `/api/decay?site_id=${selectedSite}` : '/api/decay';
            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Scan failed');

            setReports(data.reports || []);
            setSummary(data.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0 });
            setLastScan(new Date().toLocaleTimeString());
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to scan for decay');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateAlerts = async () => {
        setUpdating(true);
        try {
            const res = await fetch('/api/decay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_id: selectedSite || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(`Updated ${data.updated} posts. ${data.alerts} decay alerts flagged.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update alerts');
        } finally {
            setUpdating(false);
        }
    };

    const getSeverityVariant = (severity: string): 'danger' | 'warning' | 'info' | 'success' => {
        switch (severity) {
            case 'critical': return 'danger';
            case 'high': return 'warning';
            case 'medium': return 'info';
            default: return 'success';
        }
    };

    const handleQueueRefresh = async (report: DecayReport) => {
        setRefreshing(report.postId);
        try {
            const res = await fetch('/api/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_id: report.siteId,
                    title: `[REFRESH] ${report.title}`,
                    keyword: '',
                    slug: report.slug,
                    status: 'review',
                    priority: report.severity === 'critical' ? 'urgent' : 'high',
                    meta_description: `Content refresh - ${report.suggestedAction}`,
                }),
            });
            if (res.ok) toast.success(`Queued "${report.title}" for refresh!`);
            else toast.error('Failed to queue');
        } catch { toast.error('Failed to queue'); }
        finally { setRefreshing(null); }
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'critical': return '🔴';
            case 'high': return '🟠';
            case 'medium': return '🟡';
            default: return '🟢';
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Decay Detection</h1>
                        <p className="page-description">Monitor published posts for staleness and ranking drops</p>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={handleUpdateAlerts} disabled={updating}>
                            {updating ? <>⏳ Updating...</> : '🔄 Update DB Alerts'}
                        </button>
                        <button className="btn btn-primary" onClick={handleScan} disabled={loading}>
                            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Scanning...</> : '🔍 Scan for Decay'}
                        </button>
                    </div>
                </div>

                {/* Severity Summary */}
                <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard label="Total Flagged" value={summary.total} icon="⏰" delay={1} />
                    <StatCard label="Critical" value={summary.critical} icon="🔴" delay={2} />
                    <StatCard label="High" value={summary.high} icon="🟠" delay={3} />
                    <StatCard label="Medium" value={summary.medium} icon="🟡" delay={4} />
                    <StatCard label="Low" value={summary.low} icon="🟢" delay={5} />
                </div>

                {/* Controls */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="form-group" style={{ margin: 0, minWidth: 220 }}>
                                <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                    <option value="">All Sites</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            {lastScan && (
                                <span className="text-sm text-muted">Last scan: {lastScan}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Automation Status */}
                <div style={{
                    padding: '10px 16px', marginBottom: 16, borderRadius: 'var(--radius-sm)',
                    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div className="flex items-center gap-2">
                        <span>⏰</span>
                        <span className="text-sm">Auto-scan runs <strong>every Sunday at midnight</strong> via CRON</span>
                    </div>
                    <Badge variant="info">Automation Active</Badge>
                </div>

                {/* Decay Reports */}
                {reports.length === 0 ? (
                    <div className="card">
                        <EmptyState
                            icon="⏰"
                            title="No Decay Data Yet"
                            description="Click 'Scan for Decay' to analyze your published posts for content staleness, outdated information, and ranking decline signals."
                            action={
                                <button className="btn btn-primary" onClick={handleScan} disabled={loading}>
                                    🔍 Run First Scan
                                </button>
                            }
                        />
                    </div>
                ) : (
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">📋 Decay Reports ({reports.length})</h2>
                        </div>
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Severity</th>
                                        <th>Post</th>
                                        <th>Published</th>
                                        <th>Days Old</th>
                                        <th>Score</th>
                                        <th>Decay Reasons</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reports
                                        .sort((a, b) => {
                                            const order = { critical: 0, high: 1, medium: 2, low: 3 };
                                            return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
                                        })
                                        .map((report, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <Badge variant={getSeverityVariant(report.severity)}>
                                                        {getSeverityIcon(report.severity)} {report.severity.toUpperCase()}
                                                    </Badge>
                                                </td>
                                                <td style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {report.title}
                                                </td>
                                                <td className="text-sm text-muted">
                                                    {new Date(report.publishedAt).toLocaleDateString()}
                                                </td>
                                                <td className="font-mono">
                                                    {report.daysSincePublish}d
                                                </td>
                                                <td>
                                                    <span style={{
                                                        fontWeight: 700,
                                                        color: report.currentScore >= 70 ? 'var(--accent-success)' :
                                                            report.currentScore >= 50 ? 'var(--accent-warning)' :
                                                                'var(--accent-danger)'
                                                    }}>
                                                        {report.currentScore}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                                                        {report.decayReason.slice(0, 3).map((reason, j) => (
                                                            <Badge key={j} variant="neutral">{reason.type.replace(/_/g, ' ')}</Badge>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="flex gap-2">
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() => handleQueueRefresh(report)}
                                                            disabled={refreshing === report.postId}
                                                        >
                                                            {refreshing === report.postId ? '...' : '✏️ Queue Refresh'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Suggested Actions */}
                {reports.length > 0 && (
                    <div className="card" style={{ marginTop: 24 }}>
                        <div className="card-header">
                            <h2 className="card-title">💡 Suggested Actions</h2>
                        </div>
                        <div className="flex flex-col gap-3">
                            {reports
                                .filter(r => r.severity === 'critical' || r.severity === 'high')
                                .slice(0, 5)
                                .map((report, i) => (
                                    <div key={i} style={{
                                        padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                                        background: report.severity === 'critical' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)',
                                        border: `1px solid ${report.severity === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}`,
                                    }}>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                                    {getSeverityIcon(report.severity)} {report.title}
                                                </span>
                                                <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                                    {report.suggestedAction}
                                                </div>
                                            </div>
                                            <a href={`/optimize`} className="btn btn-secondary btn-sm">Fix →</a>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
