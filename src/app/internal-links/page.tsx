'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; url: string; }

interface LinkSuggestion {
    id: string;
    anchorText: string;
    targetUrl: string;
    targetTitle: string;
    relevanceScore: number;
    type: 'internal' | 'external';
}

interface PostAnalysis {
    postId: string;
    wpPostId: number;
    title: string;
    slug: string;
    currentInternalLinks: number;
    suggestions: LinkSuggestion[];
}

interface Stats {
    totalPosts: number;
    totalSuggestions: number;
    postsWithNoLinks: number;
    avgLinksPerPost: number;
}

export default function InternalLinksPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [applying, setApplying] = useState(false);
    const [results, setResults] = useState<PostAnalysis[]>([]);
    const [stats, setStats] = useState<Stats>({ totalPosts: 0, totalSuggestions: 0, postsWithNoLinks: 0, avgLinksPerPost: 0 });
    const [expandedPost, setExpandedPost] = useState<string | null>(null);
    const [selectedLinks, setSelectedLinks] = useState<Record<string, boolean>>({});
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    // Analyze all posts for internal linking opportunities
    const handleAnalyze = async () => {
        if (!selectedSite) { toast.warning('Select a site first'); return; }
        setAnalyzing(true);
        setResults([]);
        setSelectedLinks({});
        setProgress({ current: 0, total: 0 });

        try {
            let allResults: PostAnalysis[] = [];
            let offset = 0;
            let hasMore = true;
            const limit = 10;

            while (hasMore) {
                const res = await fetch('/api/internal-links/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ site_id: selectedSite, offset, limit }),
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Analysis failed');
                }

                const data = await res.json();
                allResults = [...allResults, ...data.results];
                hasMore = data.hasMore;
                offset += limit;

                setProgress({ current: allResults.length, total: data.total });
                setResults([...allResults]);
                setStats(data.stats);

                // Auto-select all suggestions with relevance >= 0.7
                const autoSelect: Record<string, boolean> = {};
                for (const post of data.results) {
                    for (const s of post.suggestions) {
                        if (s.relevanceScore >= 0.7) {
                            autoSelect[s.id] = true;
                        }
                    }
                }
                setSelectedLinks(prev => ({ ...prev, ...autoSelect }));
            }

            const totalSuggestions = allResults.reduce((sum, r) => sum + r.suggestions.length, 0);
            toast.success(`Found ${totalSuggestions} link opportunities across ${allResults.length} posts`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Analysis failed');
        } finally {
            setAnalyzing(false);
        }
    };

    // Apply selected links
    const handleApply = async () => {
        const changes = results
            .filter(post => post.suggestions.some(s => selectedLinks[s.id]))
            .map(post => ({
                postId: post.postId,
                wpPostId: post.wpPostId,
                links: post.suggestions.filter(s => selectedLinks[s.id]),
            }));

        if (changes.length === 0) {
            toast.warning('No links selected. Check some suggestions first.');
            return;
        }

        setApplying(true);
        try {
            const res = await fetch('/api/internal-links/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_id: selectedSite, changes }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Apply failed');
            }

            const data = await res.json();
            toast.success(`Updated ${data.summary.postsUpdated} posts with ${data.summary.totalLinksAdded} new internal links!`);

            if (data.summary.failures > 0) {
                toast.warning(`${data.summary.failures} posts failed to update`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to apply links');
        } finally {
            setApplying(false);
        }
    };

    const toggleLink = (linkId: string) => {
        setSelectedLinks(prev => ({ ...prev, [linkId]: !prev[linkId] }));
    };

    const toggleAllForPost = (post: PostAnalysis) => {
        const allSelected = post.suggestions.every(s => selectedLinks[s.id]);
        const updates: Record<string, boolean> = {};
        post.suggestions.forEach(s => { updates[s.id] = !allSelected; });
        setSelectedLinks(prev => ({ ...prev, ...updates }));
    };

    const selectedCount = Object.values(selectedLinks).filter(Boolean).length;
    const postsWithSelections = results.filter(p => p.suggestions.some(s => selectedLinks[s.id])).length;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Internal Links Analyzer</h1>
                        <p className="page-description">
                            Analyze your WordPress posts, discover internal linking opportunities, and apply them in bulk
                        </p>
                    </div>
                </div>

                {/* Step 1: Site selector + Analyze */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="card-header">
                        <h2 className="card-title">1️⃣ Select Site & Analyze</h2>
                    </div>
                    <div className="grid-3" style={{ gap: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">WordPress Site</label>
                            <select
                                className="form-select"
                                value={selectedSite}
                                onChange={e => { setSelectedSite(e.target.value); setResults([]); }}
                            >
                                <option value="">Select a site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button
                                className="btn btn-primary"
                                onClick={handleAnalyze}
                                disabled={!selectedSite || analyzing}
                                style={{ width: '100%' }}
                            >
                                {analyzing ? (
                                    <>
                                        <span className="spinner" style={{ width: 16, height: 16 }} />
                                        {' '}Analyzing {progress.current}/{progress.total}...
                                    </>
                                ) : '🔍 Analyze Internal Links'}
                            </button>
                        </div>
                        {results.length > 0 && (
                            <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                <button
                                    className="btn btn-success"
                                    onClick={handleApply}
                                    disabled={applying || selectedCount === 0}
                                    style={{ width: '100%' }}
                                >
                                    {applying ? (
                                        <><span className="spinner" style={{ width: 16, height: 16 }} /> Applying...</>
                                    ) : `✅ Apply ${selectedCount} Links to ${postsWithSelections} Posts`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Stats */}
                {stats.totalPosts > 0 && (
                    <div className="grid-4" style={{ marginBottom: 24 }}>
                        <StatCard label="Total Posts" value={stats.totalPosts} icon="📄" />
                        <StatCard label="Link Opportunities" value={stats.totalSuggestions} icon="🔗" />
                        <StatCard label="Posts Without Links" value={stats.postsWithNoLinks} icon="⚠️" />
                        <StatCard label="Avg Links/Post" value={stats.avgLinksPerPost} icon="📊" />
                    </div>
                )}

                {/* Results */}
                <div className="card">
                    {results.length === 0 && !analyzing ? (
                        <EmptyState
                            icon="🔗"
                            title="No Analysis Yet"
                            description="Select a WordPress site and click 'Analyze Internal Links' to discover linking opportunities across all your posts."
                        />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {results.map(post => (
                                <div
                                    key={post.postId}
                                    className="card"
                                    style={{
                                        border: expandedPost === post.postId
                                            ? '1px solid var(--accent-primary)'
                                            : '1px solid var(--border-subtle)',
                                        transition: 'border-color 0.2s ease',
                                    }}
                                >
                                    {/* Post header row */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            cursor: 'pointer',
                                            flexWrap: 'wrap',
                                        }}
                                        onClick={() => setExpandedPost(expandedPost === post.postId ? null : post.postId)}
                                    >
                                        <span style={{ fontSize: '1.1rem' }}>
                                            {post.currentInternalLinks === 0 ? '⚠️' : post.suggestions.length > 0 ? '💡' : '✅'}
                                        </span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{post.title}</div>
                                            <div className="text-sm text-muted">/{post.slug}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <Badge variant={post.currentInternalLinks > 0 ? 'info' : 'danger'}>
                                                🔗 {post.currentInternalLinks} existing
                                            </Badge>
                                            <Badge variant={post.suggestions.length > 0 ? 'success' : 'neutral'}>
                                                💡 {post.suggestions.length} suggested
                                            </Badge>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {expandedPost === post.postId ? '▲' : '▼'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded suggestions */}
                                    {expandedPost === post.postId && (
                                        <div style={{
                                            marginTop: 12,
                                            paddingTop: 12,
                                            borderTop: '1px solid var(--border-subtle)',
                                        }}>
                                            {post.suggestions.length === 0 ? (
                                                <div className="text-sm text-muted" style={{ padding: '8px 0' }}>
                                                    No additional internal link opportunities found for this post.
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        marginBottom: 8,
                                                    }}>
                                                        <span className="text-sm" style={{ fontWeight: 600 }}>
                                                            Suggested Internal Links
                                                        </span>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={(e) => { e.stopPropagation(); toggleAllForPost(post); }}
                                                        >
                                                            {post.suggestions.every(s => selectedLinks[s.id])
                                                                ? 'Deselect All' : 'Select All'}
                                                        </button>
                                                    </div>
                                                    {post.suggestions.map(s => (
                                                        <div
                                                            key={s.id}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 12,
                                                                padding: '10px 12px',
                                                                marginBottom: 4,
                                                                borderRadius: 'var(--radius-sm)',
                                                                background: selectedLinks[s.id]
                                                                    ? 'rgba(34, 197, 94, 0.08)'
                                                                    : 'var(--bg-glass)',
                                                                border: `1px solid ${selectedLinks[s.id]
                                                                    ? 'rgba(34, 197, 94, 0.3)'
                                                                    : 'transparent'}`,
                                                                transition: 'all 0.2s ease',
                                                                cursor: 'pointer',
                                                            }}
                                                            onClick={(e) => { e.stopPropagation(); toggleLink(s.id); }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={!!selectedLinks[s.id]}
                                                                onChange={() => toggleLink(s.id)}
                                                                onClick={e => e.stopPropagation()}
                                                                style={{ width: 18, height: 18, cursor: 'pointer' }}
                                                            />
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                                    <span className="text-sm" style={{
                                                                        fontWeight: 600,
                                                                        color: 'var(--accent-primary)',
                                                                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                                        padding: '2px 8px',
                                                                        borderRadius: 'var(--radius-sm)',
                                                                    }}>
                                                                        &quot;{s.anchorText}&quot;
                                                                    </span>
                                                                    <span className="text-sm text-muted">→</span>
                                                                    <span className="text-sm" style={{ fontWeight: 500 }}>
                                                                        {s.targetTitle}
                                                                    </span>
                                                                </div>
                                                                <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                                                                    {s.targetUrl}
                                                                </div>
                                                            </div>
                                                            <Badge variant={
                                                                s.relevanceScore >= 0.8 ? 'success' :
                                                                    s.relevanceScore >= 0.6 ? 'warning' : 'neutral'
                                                            }>
                                                                {Math.round(s.relevanceScore * 100)}%
                                                            </Badge>
                                                        </div>
                                                    ))}
                                                </>
                                            )}
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
