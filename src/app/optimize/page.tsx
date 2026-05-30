'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import { ScoreBar, ScoreRing, Badge, StatCard, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site {
    id: string;
    name: string;
    url: string;
}

interface WPPost {
    id: number;
    title: { rendered: string };
    content: { rendered: string };
    slug: string;
    status: string;
    link: string;
}

interface ContentVersion {
    id: string; version_number: number; title: string; content: string;
    meta_title: string; meta_description: string; score: number;
    change_summary: string; created_at: string;
}

// From /optimized
interface Version {
    id: string; post_id: string; version_number: number; title: string;
    content: string; meta_title: string; meta_description: string;
    score: number; change_summary: string; created_at: string;
}

interface GroupedPost {
    post_id: string; title: string; latestScore: number; versionCount: number;
    lastOptimized: string; keyword: string; versions: Version[];
}

export default function OptimizePage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('main');

    // === Optimizer state ===
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [posts, setPosts] = useState<WPPost[]>([]);
    const [selectedPost, setSelectedPost] = useState<WPPost | null>(null);
    const [keyword, setKeyword] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [result, setResult] = useState<{
        content: { title: string; metaTitle: string; metaDescription: string; content: string; faqSection: { question: string; answer: string }[]; schemaMarkup: Record<string, unknown> };
        score: { seo: number; aeo: number; eeat: number; readability: number; snippet: number; schema: number; links: number; freshness: number; depth: number; intent: number; geo: number; overall: number; humanness?: number; userValue?: number; competitive?: number; publishReadiness?: { decision: string; rankability: string; overallQC: number; improvements: string[] } };
        competitorInsight: { avgWordCount: number; commonTopics: string[]; contentGaps: string[] };
    } | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [versions, setVersions] = useState<ContentVersion[]>([]);
    const [showVersions, setShowVersions] = useState(false);

    // === History tab state (from /optimized) ===
    const [historyVersions, setHistoryVersions] = useState<Version[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [expandedPost, setExpandedPost] = useState<string | null>(null);
    const [viewingVersion, setViewingVersion] = useState<Version | null>(null);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
    }, []);

    // Load history versions when History tab is first selected
    useEffect(() => {
        if (activeTab === 'history' && historyVersions.length === 0) {
            fetchAllVersions();
        }
    }, [activeTab]);

    const handleFetchPosts = async () => {
        if (!selectedSite) return;
        setFetching(true);
        try {
            const site = sites.find(s => s.id === selectedSite);
            if (!site) return;
            const res = await fetch(`${site.url.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=50&_fields=id,title,content,slug,status,link`);
            if (res.ok) {
                const data = await res.json();
                setPosts(data);
            }
        } catch {
            toast.error('Failed to fetch posts. Make sure the site is accessible.');
        } finally {
            setFetching(false);
        }
    };

    const fetchVersions = useCallback(async (postSlug: string) => {
        try {
            const res = await fetch(`/api/versions?post_id=${postSlug}`);
            const data = await res.json();
            setVersions(data.versions || []);
        } catch { /* ignore */ }
    }, []);

    const handleOptimize = async () => {
        if (!selectedPost || !keyword.trim()) {
            toast.warning('Please select a post and enter a target keyword');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const res = await fetch('/api/content/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword,
                    site_id: selectedSite,
                    existing_content: selectedPost.content.rendered,
                    action: 'optimize',
                }),
            });

            if (!res.ok) throw new Error('Optimization failed');
            const data = await res.json();
            setResult(data);

            // Auto-save version
            try {
                await fetch('/api/versions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        post_id: selectedPost.slug,
                        title: data.content.title,
                        content: data.content.content,
                        meta_title: data.content.metaTitle,
                        meta_description: data.content.metaDescription,
                        score: data.score.overall,
                        change_summary: `Optimized for "${keyword}" — score: ${data.score.overall}/100`,
                    }),
                });
                fetchVersions(selectedPost.slug);
            } catch { /* version save failed silently */ }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to optimize');
        } finally {
            setLoading(false);
        }
    };

    const handlePublish = async (status: 'draft' | 'publish', force = false) => {
        if (!result || !selectedSite) return;
        setPublishing(true);
        try {
            const res = await fetch('/api/content/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_id: selectedSite,
                    wp_post_id: selectedPost?.id,
                    title: result.content.title,
                    content: result.content.content,
                    status,
                    meta_title: result.content.metaTitle,
                    meta_description: result.content.metaDescription,
                    schema_markup: result.content.schemaMarkup,
                    keyword,
                    force,
                }),
            });
            const data = await res.json();

            if (res.status === 409 && data.duplicate) {
                const confirmed = window.confirm(
                    `⚠️ Duplicate post detected!\n\n` +
                    `An existing post "${data.duplicate.title}" (/${data.duplicate.slug}) ` +
                    `with status "${data.duplicate.status}" was found.\n\n` +
                    `Do you still want to publish this as a new post?`
                );
                if (confirmed) {
                    setPublishing(false);
                    return handlePublish(status, true);
                }
                toast.warning('Publishing cancelled — duplicate post already exists');
                return;
            }

            if (!res.ok) throw new Error(data.error);
            toast.success(`Optimized post ${status === 'draft' ? 'saved as draft' : 'published'}!`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Publish failed');
        } finally {
            setPublishing(false);
        }
    };

    // === History tab functions (from /optimized) ===
    const fetchAllVersions = async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch('/api/versions');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setHistoryVersions(data.versions || []);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to load optimized content');
        } finally {
            setHistoryLoading(false);
        }
    };

    // Group versions by post_id
    const grouped: GroupedPost[] = Object.values(
        historyVersions.reduce((acc: Record<string, GroupedPost>, v) => {
            if (!acc[v.post_id]) {
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
            if (new Date(v.created_at) > new Date(acc[v.post_id].lastOptimized)) {
                acc[v.post_id].lastOptimized = v.created_at;
                acc[v.post_id].latestScore = v.score;
                acc[v.post_id].title = v.title;
            }
            return acc;
        }, {})
    ).sort((a, b) => new Date(b.lastOptimized).getTime() - new Date(a.lastOptimized).getTime());

    const totalOptimizations = historyVersions.length;
    const avgScore = historyVersions.length > 0 ? Math.round(historyVersions.reduce((s, v) => s + (v.score || 0), 0) / historyVersions.length) : 0;
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
                        <h1 className="page-title">Content Optimizer</h1>
                        <p className="page-description">Analyze & optimize existing posts to outrank competitors</p>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>🚀 Optimizer</button>
                    <button className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('history')}>📄 History</button>
                </div>

                {/* ===== MAIN TAB: Optimizer ===== */}
                {activeTab === 'main' && (
                    <>
                        {/* Step 1: Select Post */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="card-header">
                                <h2 className="card-title">1️⃣ Select Post to Optimize</h2>
                            </div>
                            <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">WordPress Site</label>
                                    <select className="form-select" value={selectedSite} onChange={e => { setSelectedSite(e.target.value); setPosts([]); }}>
                                        <option value="">Select a site...</option>
                                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                    <button className="btn btn-secondary" onClick={handleFetchPosts} disabled={!selectedSite || fetching} style={{ width: '100%' }}>
                                        {fetching ? 'Fetching...' : '📥 Fetch Posts'}
                                    </button>
                                </div>
                            </div>

                            {posts.length > 0 && (
                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                    {posts.map(post => (
                                        <div
                                            key={post.id}
                                            onClick={() => setSelectedPost(post)}
                                            style={{
                                                padding: '12px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                                marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                background: selectedPost?.id === post.id ? 'var(--gradient-glow)' : 'var(--bg-glass)',
                                                border: `1px solid ${selectedPost?.id === post.id ? 'var(--border-accent)' : 'transparent'}`,
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            <span style={{ fontWeight: 500, fontSize: '0.875rem' }}
                                                dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
                                            <Badge variant={post.status === 'publish' ? 'success' : 'warning'}>{post.status}</Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Step 2: Enter Keyword & Optimize */}
                        {selectedPost && (
                            <div className="card" style={{ marginBottom: 24 }}>
                                <div className="card-header">
                                    <h2 className="card-title">2️⃣ Target Keyword & Optimize</h2>
                                </div>
                                <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)' }}>
                                    <span className="text-sm text-muted">Selected: </span>
                                    <span style={{ fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: selectedPost.title.rendered }} />
                                </div>
                                <div className="flex gap-3" style={{ marginBottom: 16 }}>
                                    <input className="form-input" placeholder="Target keyword for this post..." value={keyword}
                                        onChange={e => setKeyword(e.target.value)} style={{ flex: 1 }} />
                                    <button className="btn btn-primary" onClick={handleOptimize} disabled={loading || !keyword.trim()}>
                                        {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Optimizing...</> : '🚀 Optimize'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Results */}
                        {result && (
                            <div className="grid-2" style={{ marginBottom: 24 }}>
                                <div className="card animate-in">
                                    <div className="card-header">
                                        <h2 className="card-title">📊 Optimized Score</h2>
                                        <ScoreRing score={result.score.overall} />
                                    </div>
                                    <div className="score-bar-container">
                                        <ScoreBar label="SEO" score={result.score.seo} />
                                        <ScoreBar label="AEO" score={result.score.aeo} />
                                        <ScoreBar label="E-E-A-T" score={result.score.eeat} />
                                        <ScoreBar label="Readability" score={result.score.readability} />
                                        <ScoreBar label="Snippet" score={result.score.snippet} />
                                        <ScoreBar label="Schema" score={result.score.schema} />
                                        <ScoreBar label="Links" score={result.score.links} />
                                        <ScoreBar label="Depth" score={result.score.depth} />
                                        <ScoreBar label="Intent Match" score={result.score.intent} />
                                        <ScoreBar label="GEO" score={result.score.geo} />
                                        <ScoreBar label="Freshness" score={result.score.freshness} />
                                        {result.score.humanness !== undefined && <ScoreBar label="Humanness" score={result.score.humanness} />}
                                        {result.score.userValue !== undefined && <ScoreBar label="User Value" score={result.score.userValue} />}
                                        {result.score.competitive !== undefined && <ScoreBar label="Competitive" score={result.score.competitive} />}
                                    </div>
                                    {result.score.publishReadiness && (
                                        <div style={{ marginTop: 16, padding: '12px 16px', background: result.score.publishReadiness.decision === 'Publish Immediately' ? 'rgba(34,197,94,0.08)' : result.score.publishReadiness.decision === 'Reject' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${result.score.publishReadiness.decision === 'Publish Immediately' ? 'rgba(34,197,94,0.25)' : result.score.publishReadiness.decision === 'Reject' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: 'var(--radius-md)' }}>
                                            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                                                <Badge variant={result.score.publishReadiness.decision === 'Publish Immediately' ? 'success' : result.score.publishReadiness.decision === 'Reject' ? 'danger' : 'warning'}>
                                                    {result.score.publishReadiness.decision}
                                                </Badge>
                                                <span className="text-sm text-muted">QC: {result.score.publishReadiness.overallQC}/10 · {result.score.publishReadiness.rankability.replace(/_/g, ' ')}</span>
                                            </div>
                                            {result.score.publishReadiness.improvements.length > 0 && (
                                                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                    {result.score.publishReadiness.improvements.slice(0, 3).map((imp, i) => (
                                                        <div key={i} style={{ marginBottom: 2 }}>• {imp}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="card animate-in animate-delay-1">
                                    <div className="card-header">
                                        <h2 className="card-title">📝 Optimized Content</h2>
                                        <div className="flex gap-2">
                                            <button className="btn btn-secondary btn-sm" onClick={() => setShowVersions(!showVersions)}>
                                                📋 Versions ({versions.length})
                                            </button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => handlePublish('draft')} disabled={publishing}>📥 Draft</button>
                                            <button className="btn btn-success btn-sm" onClick={() => handlePublish('publish')} disabled={publishing}>📤 Publish</button>
                                        </div>
                                    </div>

                                    {showVersions && versions.length > 0 && (
                                        <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', maxHeight: 200, overflowY: 'auto' }}>
                                            <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8 }}>📋 Version History</div>
                                            {versions.map(v => (
                                                <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', marginBottom: 4, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.02)' }}>
                                                    <div>
                                                        <span className="text-sm" style={{ fontWeight: 500 }}>v{v.version_number}</span>
                                                        <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{v.change_summary}</span>
                                                        <span style={{ marginLeft: 8 }}><Badge variant="info">{v.score}/100</Badge></span>
                                                    </div>
                                                    <div className="flex gap-2 items-center">
                                                        <span className="text-sm text-muted">{new Date(v.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 12 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Google Preview</div>
                                        <div style={{ color: '#8ab4f8', fontWeight: 500 }}>{result.content.metaTitle}</div>
                                        <div className="text-sm" style={{ color: '#bdc1c6' }}>{result.content.metaDescription}</div>
                                    </div>
                                    <div style={{ maxHeight: 400, overflowY: 'auto', padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', lineHeight: 1.8 }}
                                        dangerouslySetInnerHTML={{ __html: result.content.content }}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ===== HISTORY TAB (from /optimized) ===== */}
                {activeTab === 'history' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                            <button className="btn btn-primary btn-sm" onClick={fetchAllVersions} disabled={historyLoading}>
                                {historyLoading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Loading...</> : '🔄 Refresh'}
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="grid-3" style={{ marginBottom: 24 }}>
                            <StatCard label="Unique Posts" value={uniquePosts} icon="📄" />
                            <StatCard label="Total Optimizations" value={totalOptimizations} icon="✨" />
                            <StatCard label="Avg Score" value={`${avgScore}/100`} icon="📊" />
                        </div>

                        {/* Content List */}
                        {historyLoading ? (
                            <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                                <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
                                <p className="text-muted">Loading optimized content...</p>
                            </div>
                        ) : grouped.length === 0 ? (
                            <div className="card">
                                <EmptyState
                                    icon="📄"
                                    title="No Optimized Content"
                                    description="Go to the Optimizer tab to optimize your first post. All optimized versions will appear here."
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
                                                                <button
                                                                    className="btn btn-primary btn-sm"
                                                                    onClick={() => setActiveTab('main')}
                                                                >✏️ Re-optimize</button>
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
                    </>
                )}
            </main>
        </div>
    );
}
