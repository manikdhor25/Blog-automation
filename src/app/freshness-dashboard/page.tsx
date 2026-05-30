'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { Badge, StatCard, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

// === Freshness Dashboard types ===
interface PostFreshness { id: string; title: string; slug: string; word_count: number; primary_keyword: string; age_months: number; days_since_update: number; freshness_score: number; refresh_priority: string; created_at: string; updated_at: string; }
interface Stats { total: number; urgent: number; high: number; avg_age_months: number; avg_freshness: number; older_than_12mo: number; not_updated_180d: number; }

// === Decay types ===
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

// === Refresh Workflow types ===
interface Workflow {
    id: string; post_id: string; post_title: string; site_id: string | null;
    stage: string; priority: string; refresh_type: string;
    score_before: number; score_after: number | null; score_lift: number | null;
    assignee_email: string | null; notes: string; refresh_plan: Record<string, unknown> | null;
    flagged_at: string; refreshed_at: string | null;
}
interface RefreshPlan {
    refresh_urgency: string; estimated_time_hours: number; likely_issues: string[];
    action_plan: Array<{ task: string; type: string; section: string; effort: string; impact: string; specific_instruction: string }>;
    new_sections_to_add: string[]; target_word_count: number; target_seo_score: number;
}

// === Constants ===
const PRIORITY_COLOR: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' };
const PRIORITY_VARIANT: Record<string, 'danger' | 'warning' | 'info' | 'success'> = { urgent: 'danger', high: 'warning', medium: 'info', low: 'success' };
const STAGES = ['flagged', 'planned', 'in_progress', 'review', 'published', 'measuring'];
const STAGE_COLORS: Record<string, 'danger' | 'warning' | 'info' | 'neutral' | 'success'> = {
    flagged: 'danger', planned: 'warning', in_progress: 'info',
    review: 'warning', published: 'success', measuring: 'info',
};
const WF_PRIORITY_COLORS: Record<string, string> = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' };

export default function FreshnessDashboardPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('dashboard');

    // === Dashboard state ===
    const [posts, setPosts] = useState<PostFreshness[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [siteId, setSiteId] = useState('');
    const [sortBy, setSortBy] = useState('freshness');
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(false);

    // === Decay state ===
    const [decayReports, setDecayReports] = useState<DecayReport[]>([]);
    const [decaySummary, setDecaySummary] = useState<DecaySummary>({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [decayLoading, setDecayLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState<string | null>(null);

    // === Refresh Workflow state ===
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [wfCounts, setWfCounts] = useState<Record<string, number>>({});
    const [avgLift, setAvgLift] = useState(0);
    const [filterStage, setFilterStage] = useState('all');
    const [selectedWf, setSelectedWf] = useState<Workflow | null>(null);
    const [generatingPlan, setGeneratingPlan] = useState(false);
    const [plan, setPlan] = useState<RefreshPlan | null>(null);
    const [wfLoading, setWfLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // === Dashboard fetch ===
    const loadDashboard = async () => {
        if (!siteId) return;
        setLoading(true);
        const res = await fetch(`/api/freshness-dashboard?site_id=${siteId}&sort=${sortBy}`);
        const data = await res.json();
        setPosts(data.posts || []);
        setStats(data.stats || null);
        setLoading(false);
    };

    useEffect(() => { if (siteId) loadDashboard(); }, [siteId, sortBy]);

    // === Decay fetch ===
    useEffect(() => {
        if (activeTab === 'decay') {
            fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
        }
    }, [activeTab]);

    const handleScan = async () => {
        setDecayLoading(true);
        try {
            const url = selectedSite ? `/api/decay?site_id=${selectedSite}` : '/api/decay';
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Scan failed');
            setDecayReports(data.reports || []);
            setDecaySummary(data.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0 });
            setLastScan(new Date().toLocaleTimeString());
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to scan for decay');
        } finally {
            setDecayLoading(false);
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

    // === Refresh Workflow fetch ===
    useEffect(() => { if (activeTab === 'workflow') fetchWorkflows(); }, [activeTab, filterStage]);

    const fetchWorkflows = async () => {
        setWfLoading(true);
        const res = await fetch(`/api/refresh-workflow${filterStage !== 'all' ? `?stage=${filterStage}` : ''}`);
        const data = await res.json();
        setWorkflows(data.workflows || []);
        setWfCounts(data.counts || {});
        setAvgLift(data.avg_lift || 0);
        setWfLoading(false);
    };

    const syncDecay = async () => {
        setSyncing(true);
        await fetch('/api/refresh-workflow?sync_decay=1');
        toast.success('Synced decay alerts to workflow');
        fetchWorkflows();
        setSyncing(false);
    };

    const generatePlan = async (wf: Workflow) => {
        setGeneratingPlan(true); setPlan(null);
        const res = await fetch('/api/refresh-workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_refresh_plan', post_id: wf.post_id }) });
        const data = await res.json();
        if (res.ok) { setPlan(data.plan); toast.success(`Plan generated via ${data.provider}`); fetchWorkflows(); }
        else toast.error(data.error || 'Failed');
        setGeneratingPlan(false);
    };

    const updateStage = async (id: string, stage: string) => {
        await fetch('/api/refresh-workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_stage', id, stage }) });
        fetchWorkflows();
    };

    const measureLift = async (wf: Workflow) => {
        const res = await fetch('/api/refresh-workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'measure_lift', id: wf.id, post_id: wf.post_id }) });
        const data = await res.json();
        if (res.ok) toast.success(`Score lift: +${data.lift} points (${data.score_before} → ${data.score_after})`);
        fetchWorkflows();
    };

    const impactColor = (i: string) => ({ high: '#16a34a', medium: '#d97706', low: '#6b7280' }[i] || '#6b7280');

    // === Helpers ===
    const filtered = posts.filter(p => filter === 'all' || p.refresh_priority === filter);
    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Freshness Dashboard</h1>
                        <p className="page-description">Freshness scoring, decay detection, and refresh workflow — all in one place</p>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
                    <button className={`btn ${activeTab === 'decay' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('decay')}>⏰ Decay Alerts</button>
                    <button className={`btn ${activeTab === 'workflow' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('workflow')}>♻️ Refresh Workflow</button>
                </div>

                {/* ===================== DASHBOARD TAB ===================== */}
                {activeTab === 'dashboard' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="Site ID (UUID from Sites page)" style={{ flex: 1, minWidth: 200 }} onBlur={loadDashboard} />
                                <select className="form-input" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 'auto' }}>
                                    <option value="freshness">Sort: Lowest Freshness First</option>
                                    <option value="age">Sort: Oldest First</option>
                                    <option value="updated">Sort: Longest Since Update</option>
                                </select>
                                <button className="btn btn-primary" onClick={loadDashboard} disabled={loading || !siteId}>{loading ? 'Loading...' : '🔄 Load'}</button>
                            </div>
                        </div>

                        {stats && (
                            <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                                {[
                                    { label: 'Total Posts', value: stats.total, icon: '📄' },
                                    { label: 'Urgent Refresh', value: stats.urgent, icon: '🚨', color: stats.urgent > 0 ? '#dc2626' : '#16a34a' },
                                    { label: 'Avg Freshness', value: `${stats.avg_freshness}/100`, icon: '📊', color: scoreColor(stats.avg_freshness) },
                                    { label: '12mo+ Old', value: stats.older_than_12mo, icon: '📅', color: stats.older_than_12mo > 5 ? '#d97706' : undefined },
                                ].map((s, i) => (
                                    <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                        <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color }}>{s.value}</div>
                                        <div className="text-sm text-muted">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {posts.length > 0 && (
                            <>
                                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                    {['all', 'urgent', 'high', 'medium', 'low'].map(f => (
                                        <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>
                                            {f === 'all' ? `All (${posts.length})` : `${f} (${posts.filter(p => p.refresh_priority === f).length})`}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {filtered.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6, alignItems: 'center', borderLeft: `3px solid ${PRIORITY_COLOR[p.refresh_priority]}` }}>
                                            <div style={{ width: 44, height: 44, borderRadius: '50%', background: `conic-gradient(${scoreColor(p.freshness_score)} ${p.freshness_score * 3.6}deg, var(--border-subtle) 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>{p.freshness_score}</div>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                    <span className="text-sm text-muted">📅 {p.age_months}mo old</span>
                                                    <span className="text-sm text-muted">✏️ {p.days_since_update}d since update</span>
                                                    {p.word_count > 0 && <span className="text-sm text-muted">📝 {p.word_count.toLocaleString()}w</span>}
                                                    {p.primary_keyword && <span className="text-sm text-muted">🔍 {p.primary_keyword}</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                <Badge variant={PRIORITY_VARIANT[p.refresh_priority]}>{p.refresh_priority}</Badge>
                                                <Link href={`/create?post_id=${p.id}`} className="btn btn-sm">✏️ Refresh</Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {!posts.length && !loading && <EmptyState icon="📅" title="Enter site ID to load posts" description="Scores all published posts by age and update recency to prioritize content refreshes" />}
                    </>
                )}

                {/* ===================== DECAY ALERTS TAB ===================== */}
                {activeTab === 'decay' && (
                    <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={handleUpdateAlerts} disabled={updating}>
                                {updating ? <>⏳ Updating...</> : '🔄 Update DB Alerts'}
                            </button>
                            <button className="btn btn-primary" onClick={handleScan} disabled={decayLoading}>
                                {decayLoading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Scanning...</> : '🔍 Scan for Decay'}
                            </button>
                        </div>

                        {/* Severity Summary */}
                        <div className="stat-grid" style={{ marginBottom: 24 }}>
                            <StatCard label="Total Flagged" value={decaySummary.total} icon="⏰" delay={1} />
                            <StatCard label="Critical" value={decaySummary.critical} icon="🔴" delay={2} />
                            <StatCard label="High" value={decaySummary.high} icon="🟠" delay={3} />
                            <StatCard label="Medium" value={decaySummary.medium} icon="🟡" delay={4} />
                            <StatCard label="Low" value={decaySummary.low} icon="🟢" delay={5} />
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
                        {decayReports.length === 0 ? (
                            <div className="card">
                                <EmptyState
                                    icon="⏰"
                                    title="No Decay Data Yet"
                                    description="Click 'Scan for Decay' to analyze your published posts for content staleness, outdated information, and ranking decline signals."
                                    action={
                                        <button className="btn btn-primary" onClick={handleScan} disabled={decayLoading}>
                                            🔍 Run First Scan
                                        </button>
                                    }
                                />
                            </div>
                        ) : (
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">📋 Decay Reports ({decayReports.length})</h2>
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
                                            {decayReports
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
                        {decayReports.length > 0 && (
                            <div className="card" style={{ marginTop: 24 }}>
                                <div className="card-header">
                                    <h2 className="card-title">💡 Suggested Actions</h2>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {decayReports
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
                    </>
                )}

                {/* ===================== REFRESH WORKFLOW TAB ===================== */}
                {activeTab === 'workflow' && (
                    <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm" onClick={syncDecay} disabled={syncing}>{syncing ? 'Syncing...' : '↻ Sync Decay Alerts'}</button>
                        </div>

                        {/* Stats */}
                        <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                            {[
                                { label: 'Need Refresh', value: (wfCounts.flagged || 0) + (wfCounts.planned || 0), icon: '🚨' },
                                { label: 'In Progress', value: wfCounts.in_progress || 0, icon: '✏️' },
                                { label: 'Published', value: wfCounts.published || 0, icon: '✅' },
                                { label: 'Avg Score Lift', value: `+${avgLift}`, icon: '📈' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                    <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Stage filter */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                            {['all', ...STAGES].map(s => (
                                <button key={s} className={`btn btn-sm ${filterStage === s ? 'btn-primary' : ''}`} onClick={() => setFilterStage(s)}>
                                    {s} {s !== 'all' && wfCounts[s] !== undefined ? `(${wfCounts[s]})` : ''}
                                </button>
                            ))}
                        </div>

                        {/* Plan panel */}
                        {selectedWf && (
                            <div className="card animate-in" style={{ marginBottom: 16 }}>
                                <div className="card-header">
                                    <h3 className="card-title">Refresh Plan: {selectedWf.post_title.substring(0, 50)}</h3>
                                    <button className="btn btn-sm" onClick={() => { setSelectedWf(null); setPlan(null); }}>✕</button>
                                </div>

                                {!plan && !generatingPlan && (
                                    <button className="btn btn-primary" onClick={() => generatePlan(selectedWf)}>Generate AI Refresh Plan →</button>
                                )}
                                {generatingPlan && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="spinner" style={{ width: 16, height: 16 }} />Analyzing post and generating plan...</div>}

                                {plan && (
                                    <>
                                        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px' }}><div className="text-sm text-muted">Urgency</div><div style={{ fontWeight: 700, color: WF_PRIORITY_COLORS[plan.refresh_urgency] || '#6b7280' }}>{plan.refresh_urgency}</div></div>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px' }}><div className="text-sm text-muted">Est. Time</div><div style={{ fontWeight: 700 }}>{plan.estimated_time_hours}h</div></div>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px' }}><div className="text-sm text-muted">Target Score</div><div style={{ fontWeight: 700, color: '#16a34a' }}>{plan.target_seo_score}/100</div></div>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px' }}><div className="text-sm text-muted">Target Words</div><div style={{ fontWeight: 700 }}>{plan.target_word_count.toLocaleString()}</div></div>
                                        </div>

                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Issues Found</div>
                                            {plan.likely_issues?.map((issue, i) => <div key={i} className="text-sm" style={{ color: '#dc2626', marginBottom: 4 }}>⚠️ {issue}</div>)}
                                        </div>

                                        <div>
                                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Action Plan ({plan.action_plan?.length} tasks)</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {plan.action_plan?.map((task, i) => (
                                                    <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${impactColor(task.impact)}` }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                            <span style={{ fontWeight: 600 }}>{task.task}</span>
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                <Badge variant="neutral">{task.effort}</Badge>
                                                                <span style={{ fontSize: '0.75rem', color: impactColor(task.impact), fontWeight: 700 }}>{task.impact} impact</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-sm text-muted">📍 {task.section}</div>
                                                        <div className="text-sm" style={{ marginTop: 4, color: 'var(--color-primary)' }}>{task.specific_instruction}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                            <button className="btn btn-primary" onClick={() => updateStage(selectedWf.id, 'in_progress')}>Start Refresh →</button>
                                            <a href={`/optimize?post_id=${selectedWf.post_id}`} className="btn btn-sm btn-success">Open in Editor →</a>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Workflow list */}
                        <div className="card">
                            {wfLoading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                                : workflows.length === 0 ? <EmptyState icon="♻️" title="No Refresh Tasks" description="Click 'Sync Decay Alerts' to import posts that need refreshing" />
                                : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {workflows.map(wf => (
                                        <div key={wf.id} className="card" style={{ padding: 14, borderLeft: `3px solid ${WF_PRIORITY_COLORS[wf.priority] || '#6b7280'}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{wf.post_title}</div>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <Badge variant={STAGE_COLORS[wf.stage] || 'info'}>{wf.stage.replace('_', ' ')}</Badge>
                                                        <span style={{ fontSize: '0.75rem', color: WF_PRIORITY_COLORS[wf.priority], fontWeight: 700 }}>{wf.priority}</span>
                                                        <Badge variant="neutral">{wf.refresh_type.replace('_', ' ')}</Badge>
                                                        <span className="text-sm text-muted">Score: {wf.score_before}</span>
                                                        {wf.score_lift && wf.score_lift > 0 && <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.85rem' }}>+{wf.score_lift} lift ✅</span>}
                                                        {wf.assignee_email && <span className="text-sm text-muted">👤 {wf.assignee_email}</span>}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                    <select className="form-select" style={{ padding: '4px 6px', fontSize: '0.8rem', minWidth: 110 }} value={wf.stage} onChange={e => updateStage(wf.id, e.target.value)}>
                                                        {STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                                    </select>
                                                    <button className="btn btn-sm btn-primary" onClick={() => { setSelectedWf(wf); setPlan((wf.refresh_plan as unknown as RefreshPlan) || null); }}>Plan</button>
                                                    {wf.stage === 'published' && <button className="btn btn-sm" onClick={() => measureLift(wf)}>Measure</button>}
                                                    <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/refresh-workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: wf.id }) }); fetchWorkflows(); }}>Del</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            }
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
