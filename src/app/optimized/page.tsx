'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, ScoreRing, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Version {
    id: string; post_id: string; version_number: number; title: string;
    content: string; meta_title: string; meta_description: string;
    score: number; change_summary: string; created_at: string;
}

interface GroupedPost {
    post_id: string; title: string; latestScore: number; versionCount: number;
    lastOptimized: string; keyword: string; versions: Version[];
}

export default function OptimizedContentPage() {
    const toast = useToast();
    const [versions, setVersions] = useState<Version[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedPost, setExpandedPost] = useState<string | null>(null);
    const [viewingVersion, setViewingVersion] = useState<Version | null>(null);

    useEffect(() => {
        fetchAllVersions();
    }, []);

    const fetchAllVersions = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/versions');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setVersions(data.versions || []);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to load optimized content');
        } finally {
            setLoading(false);
        }
    };

    // Group versions by post_id
    const grouped: GroupedPost[] = Object.values(
        versions.reduce((acc: Record<string, GroupedPost>, v) => {
            if (!acc[v.post_id]) {
                // Extract keyword from change_summary: 'Optimized for "keyword" — score: X/100'
                const kwMatch = v.change_summary?.match(/Optimized for "([^"]+)"/);
                acc[v.post_id] = {
                    post_id: v.post_id,
                    title: v.title,
                    latestScore: v.score,
                    versionCount: 0,
                    lastOptimized: v.created_at,
                    keyword: kwMatch?.[1] || '',
                    versions: [],
                };
            }
            acc[v.post_id].versions.push(v);
            acc[v.post_id].versionCount++;
            // Keep latest data (versions are sorted by created_at desc)
            if (new Date(v.created_at) > new Date(acc[v.post_id].lastOptimized)) {
                acc[v.post_id].lastOptimized = v.created_at;
                acc[v.post_id].latestScore = v.score;
                acc[v.post_id].title = v.title;
            }
            return acc;
        }, {})
    ).sort((a, b) => new Date(b.lastOptimized).getTime() - new Date(a.lastOptimized).getTime());

    const totalOptimizations = versions.length;
    const avgScore = versions.length > 0 ? Math.round(versions.reduce((s, v) => s + (v.score || 0), 0) / versions.length) : 0;
    const uniquePosts = grouped.length;

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'var(--accent-success)';
        if (score >= 60) return 'var(--accent-warning)';
        return 'var(--accent-danger)';
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Optimized Content</h1>
                        <p className="page-description">Browse and review all your AI-optimized articles</p>
                    </div>
                    <button className="btn btn-primary" onClick={fetchAllVersions} disabled={loading}>
                        {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Loading...</> : '🔄 Refresh'}
                    </button>
                </div>

                {/* Stats */}
                <div className="grid-3" style={{ marginBottom: 24 }}>
                    <StatCard label="Unique Posts" value={uniquePosts} icon="📄" />
                    <StatCard label="Total Optimizations" value={totalOptimizations} icon="✨" />
                    <StatCard label="Avg Score" value={`${avgScore}/100`} icon="📊" />
                </div>

                {/* Content List */}
                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
                        <p className="text-muted">Loading optimized content...</p>
                    </div>
                ) : grouped.length === 0 ? (
                    <div className="card">
                        <EmptyState
                            icon="📄"
                            title="No Optimized Content"
                            description="Go to the Optimizer to optimize your first post. All optimized versions will appear here."
                        />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {grouped.map(post => (
                            <div key={post.post_id} className="card animate-in" style={{ overflow: 'hidden' }}>
                                {/* Post Header Row */}
                                <div
                                    onClick={() => setExpandedPost(expandedPost === post.post_id ? null : post.post_id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        padding: '16px 20px', cursor: 'pointer',
                                        transition: 'background 0.2s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {/* Score Ring */}
                                    <div style={{ flexShrink: 0 }}>
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '50%', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', fontWeight: 800,
                                            fontSize: '0.85rem',
                                            background: `conic-gradient(${getScoreColor(post.latestScore)} ${(post.latestScore / 100) * 360}deg, rgba(255,255,255,0.06) 0deg)`,
                                            color: getScoreColor(post.latestScore),
                                        }}>
                                            {post.latestScore}
                                        </div>
                                    </div>

                                    {/* Post Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {post.title}
                                        </div>
                                        <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
                                            {post.keyword && <Badge variant="info">🎯 {post.keyword}</Badge>}
                                            <Badge variant="neutral">v{post.versionCount}</Badge>
                                            <span className="text-sm text-muted">
                                                {new Date(post.lastOptimized).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expand Arrow */}
                                    <div style={{
                                        fontSize: '1.2rem', transition: 'transform 0.2s', flexShrink: 0,
                                        transform: expandedPost === post.post_id ? 'rotate(180deg)' : 'rotate(0deg)',
                                        color: 'var(--text-muted)',
                                    }}>▾</div>
                                </div>

                                {/* Expanded: Version List */}
                                {expandedPost === post.post_id && (
                                    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                                        {/* Version Rows */}
                                        <div style={{ padding: '12px 20px' }}>
                                            <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>
                                                Version History
                                            </div>
                                            {post.versions.map(v => (
                                                <div
                                                    key={v.id}
                                                    onClick={() => setViewingVersion(viewingVersion?.id === v.id ? null : v)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 10,
                                                        padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                                        marginBottom: 4, cursor: 'pointer',
                                                        background: viewingVersion?.id === v.id ? 'var(--gradient-glow)' : 'var(--bg-glass)',
                                                        border: `1px solid ${viewingVersion?.id === v.id ? 'var(--border-accent)' : 'transparent'}`,
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    <div style={{
                                                        width: 28, height: 28, borderRadius: '50%', display: 'flex',
                                                        alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                                                        fontSize: '0.7rem', background: 'rgba(99,102,241,0.15)',
                                                        flexShrink: 0,
                                                    }}>v{v.version_number}</div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div className="text-sm" style={{ fontWeight: 500 }}>{v.change_summary}</div>
                                                        <div className="text-sm text-muted">{new Date(v.created_at).toLocaleString()}</div>
                                                    </div>
                                                    <Badge variant={v.score >= 70 ? 'success' : v.score >= 40 ? 'warning' : 'danger'}>
                                                        {v.score}/100
                                                    </Badge>
                                                    <span className="text-sm" style={{ color: 'var(--accent-primary-light)', fontWeight: 500 }}>
                                                        {viewingVersion?.id === v.id ? '▲ Hide' : '👁️ View'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Content Viewer */}
                                        {viewingVersion && post.versions.some(v => v.id === viewingVersion.id) && (
                                            <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
                                                {/* Meta Preview */}
                                                <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)' }}>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>Google Preview</div>
                                                    <div style={{ color: '#8ab4f8', fontWeight: 500, fontSize: '0.95rem', marginBottom: 2 }}>
                                                        {viewingVersion.meta_title || viewingVersion.title}
                                                    </div>
                                                    <div className="text-sm" style={{ color: '#bdc1c6' }}>
                                                        {viewingVersion.meta_description || 'No meta description saved.'}
                                                    </div>
                                                </div>

                                                {/* Score + Actions */}
                                                <div className="flex gap-3 items-center" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
                                                    <ScoreRing score={viewingVersion.score} />
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{viewingVersion.title}</div>
                                                        <div className="text-sm text-muted">Version {viewingVersion.version_number} · {new Date(viewingVersion.created_at).toLocaleDateString()}</div>
                                                    </div>
                                                    <div style={{ marginLeft: 'auto' }} className="flex gap-2">
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigator.clipboard.writeText(viewingVersion.content);
                                                                toast.success('Content copied to clipboard!');
                                                            }}
                                                        >📋 Copy HTML</button>
                                                        <a
                                                            href={`/optimize`}
                                                            className="btn btn-primary btn-sm"
                                                            style={{ textDecoration: 'none' }}
                                                        >✏️ Re-optimize</a>
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div style={{
                                                    maxHeight: 500, overflowY: 'auto', padding: '20px 24px',
                                                    background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)',
                                                    border: '1px solid var(--border-subtle)', lineHeight: 1.8,
                                                    fontSize: '0.92rem',
                                                }}
                                                    dangerouslySetInnerHTML={{ __html: viewingVersion.content }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
