'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ContentRecord {
    id: string;
    keyword: string;
    title: string;
    slug: string;
    content_type: string;
    language: string;
    ai_provider: string;
    ai_model: string;
    word_count_target: number;
    word_count_actual: number;
    competitor_count: number;
    section_count: number;
    internal_link_count: number;
    external_link_count: number;
    generation_duration_ms: number;
    overall_score: number;
    seo_score: number;
    aeo_score: number;
    eeat_score: number;
    readability_score: number;
    naturalness_score: number;
    outline_data: Record<string, unknown>;
    blueprint_data: Record<string, unknown>;
    score_details: Record<string, unknown>;
    meta_title: string;
    meta_description: string;
    site_name: string;
    site_url: string;
    publish_status: string;
    published_at: string | null;
    wp_post_id: number | null;
    created_at: string;
    updated_at: string;
}

interface Site { id: string; name: string; }

export default function ContentRecordsPage() {
    const toast = useToast();
    const [records, setRecords] = useState<ContentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [sites, setSites] = useState<Site[]>([]);
    const [stats, setStats] = useState({ total: 0, avgScore: 0, totalWords: 0, avgDuration: 0 });
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });

    // Filters
    const [siteFilter, setSiteFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [keywordSearch, setKeywordSearch] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // UI state
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchRecords = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: '25',
                sort: sortBy,
                dir: sortDir,
            });
            if (siteFilter) params.set('site_id', siteFilter);
            if (statusFilter) params.set('status', statusFilter);
            if (keywordSearch) params.set('keyword', keywordSearch);

            const res = await fetch(`/api/content-records?${params}`);
            const data = await res.json();
            setRecords(data.records || []);
            setStats(data.stats || { total: 0, avgScore: 0, totalWords: 0, avgDuration: 0 });
            setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 });
        } catch {
            toast.error('Failed to load content records');
        } finally {
            setLoading(false);
        }
    }, [sortBy, sortDir, siteFilter, statusFilter, keywordSearch, toast]);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === records.length) setSelected(new Set());
        else setSelected(new Set(records.map(r => r.id)));
    };

    const handleDelete = async (ids: string[]) => {
        if (!confirm(`Delete ${ids.length} record(s)? This cannot be undone.`)) return;
        try {
            await fetch(`/api/content-records?ids=${ids.join(',')}`, { method: 'DELETE' });
            toast.success(`Deleted ${ids.length} record(s)`);
            setSelected(new Set());
            fetchRecords(pagination.page);
        } catch {
            toast.error('Failed to delete records');
        }
    };

    const handleSort = (col: string) => {
        if (sortBy === col) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(col);
            setSortDir('desc');
        }
    };

    const handleExportCSV = () => {
        if (records.length === 0) return;
        const headers = ['Keyword', 'Title', 'Type', 'AI Provider', 'Words Target', 'Words Actual', 'Score', 'Competitors', 'Sections', 'Internal Links', 'External Links', 'Duration (s)', 'Status', 'Site', 'Created'];
        const rows = records.map(r => [
            r.keyword, r.title, r.content_type, r.ai_provider,
            r.word_count_target, r.word_count_actual, r.overall_score,
            r.competitor_count, r.section_count, r.internal_link_count,
            r.external_link_count, (r.generation_duration_ms / 1000).toFixed(1),
            r.publish_status, r.site_name, new Date(r.created_at).toLocaleDateString(),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content-records-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    const getStatusBadge = (status: string): 'success' | 'warning' | 'info' | 'danger' | 'neutral' => {
        switch (status) {
            case 'published': return 'success';
            case 'draft': return 'info';
            case 'queued': return 'warning';
            case 'generated': return 'neutral';
            default: return 'neutral';
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 70) return 'var(--accent-success)';
        if (score >= 50) return 'var(--accent-warning)';
        return 'var(--accent-danger)';
    };

    const SortIcon = ({ col }: { col: string }) => (
        <span style={{ opacity: sortBy === col ? 1 : 0.3, marginLeft: 4, fontSize: '0.7rem' }}>
            {sortBy === col && sortDir === 'asc' ? '▲' : '▼'}
        </span>
    );

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Records</h1>
                        <p className="page-description">Track every generated article — metadata, scores, AI details & publish status</p>
                    </div>
                    <div className="flex gap-2">
                        {selected.size > 0 && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(Array.from(selected))}>
                                🗑️ Delete {selected.size}
                            </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={handleExportCSV} disabled={records.length === 0}>
                            📥 Export CSV
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard label="Total Records" value={stats.total} icon="📊" />
                    <StatCard label="Avg Score" value={stats.avgScore} icon="⭐" />
                    <StatCard label="Total Words" value={stats.totalWords.toLocaleString()} icon="📝" />
                    <StatCard label="Avg Gen Time" value={formatDuration(stats.avgDuration)} icon="⏱️" />
                </div>

                {/* Filters */}
                <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0, minWidth: 200, flex: 1 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>🔍 Search Keyword</label>
                            <input
                                className="form-input"
                                placeholder="Filter by keyword..."
                                value={keywordSearch}
                                onChange={e => setKeywordSearch(e.target.value)}
                                style={{ padding: '8px 12px' }}
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>🌐 Site</label>
                            <select className="form-select" value={siteFilter} onChange={e => setSiteFilter(e.target.value)} style={{ padding: '8px 12px' }}>
                                <option value="">All Sites</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>📋 Status</label>
                            <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px' }}>
                                <option value="">All Statuses</option>
                                <option value="generated">Generated</option>
                                <option value="queued">Queued</option>
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                            </select>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setSiteFilter(''); setStatusFilter(''); setKeywordSearch(''); }} style={{ height: 38 }}>
                            ✕ Clear
                        </button>
                    </div>
                </div>

                {/* Data Table */}
                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                        <div className="spinner" style={{ margin: '0 auto 16px' }} />
                        <p className="text-sm text-muted">Loading content records...</p>
                    </div>
                ) : records.length === 0 ? (
                    <div className="card">
                        <EmptyState
                            icon="📊"
                            title="No Content Records"
                            description="Generate articles through the Content Writer to start tracking content records."
                            action={<a href="/create" className="btn btn-primary">✍️ Create Content</a>}
                        />
                    </div>
                ) : (
                    <div className="card">
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" checked={selected.size === records.length && records.length > 0} onChange={toggleAll} /></th>
                                        <th onClick={() => handleSort('keyword')} style={{ cursor: 'pointer' }}>Keyword <SortIcon col="keyword" /></th>
                                        <th onClick={() => handleSort('overall_score')} style={{ cursor: 'pointer' }}>Score <SortIcon col="overall_score" /></th>
                                        <th onClick={() => handleSort('word_count_actual')} style={{ cursor: 'pointer' }}>Words <SortIcon col="word_count_actual" /></th>
                                        <th>AI Provider</th>
                                        <th>Competitors</th>
                                        <th>Links</th>
                                        <th onClick={() => handleSort('generation_duration_ms')} style={{ cursor: 'pointer' }}>Duration <SortIcon col="generation_duration_ms" /></th>
                                        <th>Status</th>
                                        <th>Site</th>
                                        <th onClick={() => handleSort('created_at')} style={{ cursor: 'pointer' }}>Created <SortIcon col="created_at" /></th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map(record => (
                                        <React.Fragment key={record.id}>
                                            <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}>
                                                <td onClick={e => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selected.has(record.id)} onChange={() => toggleSelect(record.id)} />
                                                </td>
                                                <td style={{ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    <div>{record.keyword}</div>
                                                    <div className="text-sm text-muted" style={{ fontWeight: 400, fontSize: '0.75rem' }}>{record.title.slice(0, 50)}{record.title.length > 50 ? '...' : ''}</div>
                                                </td>
                                                <td>
                                                    <span style={{ fontWeight: 700, fontSize: '1rem', color: getScoreColor(record.overall_score) }}>
                                                        {Math.round(record.overall_score)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="text-sm">{record.word_count_actual.toLocaleString()}</div>
                                                    <div className="text-sm text-muted" style={{ fontSize: '0.7rem' }}>/ {record.word_count_target.toLocaleString()}</div>
                                                </td>
                                                <td>
                                                    <Badge variant="info">{record.ai_provider || '—'}</Badge>
                                                </td>
                                                <td className="text-sm">{record.competitor_count}</td>
                                                <td>
                                                    <div className="text-sm">🏠 {record.internal_link_count}</div>
                                                    <div className="text-sm">🌐 {record.external_link_count}</div>
                                                </td>
                                                <td className="text-sm">{formatDuration(record.generation_duration_ms)}</td>
                                                <td><Badge variant={getStatusBadge(record.publish_status)}>{record.publish_status}</Badge></td>
                                                <td className="text-sm">{record.site_name || '—'}</td>
                                                <td className="text-sm text-muted">{new Date(record.created_at).toLocaleDateString()}</td>
                                                <td onClick={e => e.stopPropagation()}>
                                                    <button className="btn btn-sm" style={{ padding: '2px 8px', color: 'var(--accent-danger)', fontSize: '0.75rem' }}
                                                        onClick={() => handleDelete([record.id])}>🗑️</button>
                                                </td>
                                            </tr>

                                            {/* Expanded Detail Row */}
                                            {expandedId === record.id && (
                                                <tr>
                                                    <td colSpan={12} style={{ padding: 0, background: 'var(--bg-glass)' }}>
                                                        <div style={{ padding: '20px 24px' }}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                                                                {/* Score Breakdown */}
                                                                <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                                                                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 10 }}>📊 Score Breakdown</div>
                                                                    {[
                                                                        { label: 'SEO', value: record.seo_score },
                                                                        { label: 'AEO', value: record.aeo_score },
                                                                        { label: 'E-E-A-T', value: record.eeat_score },
                                                                        { label: 'Readability', value: record.readability_score },
                                                                        { label: 'Naturalness', value: record.naturalness_score },
                                                                        ...((record.score_details as { humanness?: number; userValue?: number; competitive?: number }).humanness != null ? [
                                                                            { label: 'Humanness', value: (record.score_details as { humanness: number }).humanness },
                                                                            { label: 'User Value', value: (record.score_details as { userValue: number }).userValue },
                                                                            { label: 'Competitive', value: (record.score_details as { competitive: number }).competitive },
                                                                        ] : []),
                                                                    ].map(s => (
                                                                        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                            <span className="text-sm text-muted">{s.label}</span>
                                                                            <span className="text-sm" style={{ fontWeight: 600, color: getScoreColor(s.value) }}>{Math.round(s.value)}</span>
                                                                        </div>
                                                                    ))}
                                                                    {(record.score_details as { publishReadiness?: { decision: string; rankability: string; overallQC: number } }).publishReadiness && (
                                                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                                                                            <div className="text-sm text-muted" style={{ fontSize: '0.7rem', marginBottom: 4 }}>Publish Readiness</div>
                                                                            <Badge variant={
                                                                                (record.score_details as { publishReadiness: { decision: string } }).publishReadiness.decision === 'Publish Immediately' ? 'success'
                                                                                    : (record.score_details as { publishReadiness: { decision: string } }).publishReadiness.decision === 'Reject' ? 'danger' : 'warning'
                                                                            }>
                                                                                {(record.score_details as { publishReadiness: { decision: string } }).publishReadiness.decision}
                                                                            </Badge>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Content Details */}
                                                                <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                                                                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 10 }}>📝 Content Details</div>
                                                                    {[
                                                                        { label: 'Type', value: record.content_type },
                                                                        { label: 'Language', value: record.language },
                                                                        { label: 'Sections', value: record.section_count },
                                                                        { label: 'Slug', value: `/${record.slug}` },
                                                                        { label: 'WP Post ID', value: record.wp_post_id || '—' },
                                                                    ].map(d => (
                                                                        <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                            <span className="text-sm text-muted">{d.label}</span>
                                                                            <span className="text-sm" style={{ fontWeight: 500 }}>{d.value}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {/* Meta Tags */}
                                                                <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                                                                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 10 }}>🏷️ Meta Tags</div>
                                                                    <div style={{ marginBottom: 8 }}>
                                                                        <div className="text-sm text-muted" style={{ fontSize: '0.7rem' }}>Meta Title</div>
                                                                        <div className="text-sm" style={{ fontWeight: 500 }}>{record.meta_title || '—'}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm text-muted" style={{ fontSize: '0.7rem' }}>Meta Description</div>
                                                                        <div className="text-sm">{record.meta_description || '—'}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Site & Publish */}
                                                                <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                                                                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 10 }}>🌐 Site & Publish</div>
                                                                    {[
                                                                        { label: 'Site', value: record.site_name || '—' },
                                                                        { label: 'Site URL', value: record.site_url || '—' },
                                                                        { label: 'Status', value: record.publish_status },
                                                                        { label: 'Published', value: record.published_at ? new Date(record.published_at).toLocaleString() : '—' },
                                                                    ].map(d => (
                                                                        <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                            <span className="text-sm text-muted">{d.label}</span>
                                                                            <span className="text-sm" style={{ fontWeight: 500 }}>{String(d.value)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            {/* Outline & Blueprint */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                                                {record.outline_data && Object.keys(record.outline_data).length > 0 && (
                                                                    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                                                                        <div className="text-sm" style={{ fontWeight: 600, marginBottom: 10 }}>📋 Outline Data</div>
                                                                        <pre style={{
                                                                            background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)',
                                                                            padding: 10, overflow: 'auto', maxHeight: 200,
                                                                            fontSize: '0.7rem', color: 'var(--text-secondary)',
                                                                        }}>
                                                                            {JSON.stringify(record.outline_data, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                )}
                                                                {record.blueprint_data && Object.keys(record.blueprint_data).length > 0 && (
                                                                    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                                                                        <div className="text-sm" style={{ fontWeight: 600, marginBottom: 10 }}>🏗️ Blueprint Data</div>
                                                                        <pre style={{
                                                                            background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)',
                                                                            padding: 10, overflow: 'auto', maxHeight: 200,
                                                                            fontSize: '0.7rem', color: 'var(--text-secondary)',
                                                                        }}>
                                                                            {JSON.stringify(record.blueprint_data, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                                <span className="text-sm text-muted">
                                    Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        disabled={pagination.page <= 1}
                                        onClick={() => fetchRecords(pagination.page - 1)}
                                    >
                                        ← Previous
                                    </button>
                                    <span className="text-sm" style={{ padding: '6px 12px', fontWeight: 600 }}>
                                        {pagination.page} / {pagination.totalPages}
                                    </span>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        disabled={pagination.page >= pagination.totalPages}
                                        onClick={() => fetchRecords(pagination.page + 1)}
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
