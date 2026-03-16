'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import { ScoreBar, ScoreRing, Badge } from '@/components/ui';
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

export default function OptimizePage() {
    const toast = useToast();
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

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
    }, []);

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
                    wp_post_id: selectedPost?.id,  // Send WP post ID so API updates existing post
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

            // Handle duplicate detection (409 Conflict)
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

                            {/* Version History Panel */}
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
            </main>
        </div>
    );
}
