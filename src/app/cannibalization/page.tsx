'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ConflictPost {
    postId: string; title: string; slug: string; score: number; status: string;
}

interface Conflict {
    keyword: string;
    severity: 'high' | 'medium' | 'low';
    type: 'exact' | 'partial';
    posts: ConflictPost[];
    recommendation: string;
    searchVolume?: number;
    difficulty?: number;
}

interface Site { id: string; name: string; url: string; }

export default function CannibalizationPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [conflicts, setConflicts] = useState<Conflict[]>([]);
    const [summary, setSummary] = useState({ total: 0, high: 0, medium: 0, low: 0 });
    const [loading, setLoading] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    const handleScan = async () => {
        if (!selectedSite) { toast.warning('Select a site first'); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/cannibalization?site_id=${selectedSite}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setConflicts(data.conflicts || []);
            setSummary(data.summary || { total: 0, high: 0, medium: 0, low: 0 });
            if (data.conflicts.length === 0) {
                toast.success('No cannibalization detected! Your keywords are well-targeted.');
            } else {
                toast.warning(`Found ${data.conflicts.length} cannibalization issue(s)`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Scan failed');
        } finally {
            setLoading(false);
        }
    };

    const severityColor = (s: string) =>
        s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'info';

    const severityIcon = (s: string) =>
        s === 'high' ? '🔴' : s === 'medium' ? '🟡' : '🟢';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Keyword Cannibalization</h1>
                        <p className="page-description">Detect pages competing for the same keywords</p>
                    </div>
                </div>

                {/* Controls */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Site</label>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select a site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleScan} disabled={loading} style={{ width: '100%' }}>
                                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Scanning...</> : '🔍 Scan for Cannibalization'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Summary stats */}
                {summary.total > 0 && (
                    <div className="grid-4" style={{ marginBottom: 24 }}>
                        <StatCard label="Total Issues" value={summary.total} icon="⚠️" />
                        <StatCard label="High Severity" value={summary.high} icon="🔴" />
                        <StatCard label="Medium" value={summary.medium} icon="🟡" />
                        <StatCard label="Low" value={summary.low} icon="🟢" />
                    </div>
                )}

                {/* Results */}
                <div className="card">
                    {conflicts.length === 0 ? (
                        <EmptyState
                            icon="🎯"
                            title="No Cannibalization Issues"
                            description="Select a site and scan to detect keyword conflicts between your posts."
                        />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {conflicts.map((conflict, i) => (
                                <div
                                    key={i}
                                    className="card"
                                    style={{
                                        cursor: 'pointer',
                                        border: expandedIdx === i ? '1px solid var(--accent-primary)' : undefined,
                                        transition: 'border 0.2s',
                                    }}
                                    onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                                >
                                    {/* Conflict header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '1.2rem' }}>{severityIcon(conflict.severity)}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                                                {conflict.keyword}
                                            </div>
                                            <div className="text-sm text-muted">
                                                {conflict.posts.length} posts • {conflict.type === 'exact' ? 'Exact match' : 'Partial overlap'}
                                            </div>
                                        </div>
                                        <Badge variant={severityColor(conflict.severity)}>
                                            {conflict.severity.toUpperCase()}
                                        </Badge>
                                        {conflict.searchVolume && (
                                            <div className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                                                {conflict.searchVolume.toLocaleString()} vol
                                            </div>
                                        )}
                                        <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                                            {expandedIdx === i ? '▼' : '▶'}
                                        </span>
                                    </div>

                                    {/* Expanded details */}
                                    {expandedIdx === i && (
                                        <div style={{ marginTop: 16 }}>
                                            {/* Recommendation */}
                                            <div style={{
                                                padding: '10px 14px', borderRadius: 8,
                                                background: 'rgba(99, 102, 241, 0.08)',
                                                border: '1px solid rgba(99, 102, 241, 0.15)',
                                                marginBottom: 16, fontSize: '0.85rem',
                                                color: 'var(--text-secondary)',
                                            }}>
                                                💡 <strong>Recommendation:</strong> {conflict.recommendation}
                                            </div>

                                            {/* Posts table */}
                                            <div className="table-wrapper">
                                                <table className="data-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Post Title</th>
                                                            <th>Slug</th>
                                                            <th>SEO Score</th>
                                                            <th>Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {conflict.posts.map((post, j) => (
                                                            <tr key={j}>
                                                                <td style={{ fontWeight: j === 0 ? 600 : 400, color: 'var(--text-primary)' }}>
                                                                    {j === 0 && '👑 '}{post.title}
                                                                </td>
                                                                <td className="text-sm font-mono text-muted">/{post.slug}</td>
                                                                <td>
                                                                    <Badge variant={post.score >= 70 ? 'success' : post.score >= 40 ? 'warning' : 'danger'}>
                                                                        {post.score}/100
                                                                    </Badge>
                                                                </td>
                                                                <td><Badge variant="neutral">{post.status}</Badge></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
