'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; url: string; }
interface Post { id: string; title: string; slug: string; site_id: string; content_html: string; }

export default function SyndicationPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [selectedPost, setSelectedPost] = useState('');
    const [selectedSourceSite, setSelectedSourceSite] = useState('');
    const [selectedTargetSite, setSelectedTargetSite] = useState('');
    const [loading, setLoading] = useState(false);
    const [rewrittenContent, setRewrittenContent] = useState('');
    const [uniquenessScore, setUniqueScore] = useState<number | null>(null);
    const [step, setStep] = useState<'select' | 'rewrite' | 'publish'>('select');

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    useEffect(() => {
        if (selectedSourceSite) {
            fetch(`/api/queue?site_id=${selectedSourceSite}`)
                .then(r => r.json())
                .then(d => setPosts((d.items || []).filter((p: Post) => p.content_html)))
                .catch(() => { });
        }
    }, [selectedSourceSite]);

    const handleRewrite = async () => {
        const post = posts.find(p => p.id === selectedPost);
        if (!post) { toast.warning('Select a post'); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/syndication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rewrite', content: post.content_html, title: post.title }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setRewrittenContent(data.rewrittenContent || '');
            setStep('rewrite');
            toast.success('Content rewritten for uniqueness!');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Rewrite failed');
        } finally { setLoading(false); }
    };

    const handleCheckUniqueness = async () => {
        const post = posts.find(p => p.id === selectedPost);
        if (!post || !rewrittenContent) return;
        setLoading(true);
        try {
            const res = await fetch('/api/syndication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'check_uniqueness', original: post.content_html, rewritten: rewrittenContent }),
            });
            const data = await res.json();
            setUniqueScore(data.uniquenessScore);
            toast.info(`Uniqueness: ${data.uniquenessScore}%`);
        } catch { toast.error('Check failed'); }
        finally { setLoading(false); }
    };

    const handleSyndicate = async () => {
        if (!selectedTargetSite || !selectedPost) { toast.warning('Select target site'); return; }
        const post = posts.find(p => p.id === selectedPost);
        if (!post) return;
        setLoading(true);
        try {
            const sourceSite = sites.find(s => s.id === selectedSourceSite);
            const res = await fetch('/api/syndication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'syndicate',
                    target_site_id: selectedTargetSite,
                    title: post.title,
                    content: rewrittenContent || post.content_html,
                    canonical_url: sourceSite ? `${sourceSite.url}/${post.slug}` : '',
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(`Published as draft to target site! WP ID: ${data.wpPostId || 'N/A'}`);
            setStep('publish');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Syndication failed');
        } finally { setLoading(false); }
    };

    const targetSites = sites.filter(s => s.id !== selectedSourceSite);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Syndication</h1>
                        <p className="page-description">Rewrite and publish content across multiple sites with canonical URLs</p>
                    </div>
                </div>

                <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard label="Source Sites" value={sites.length} icon="🌐" />
                    <StatCard label="Available Posts" value={posts.length} icon="📝" />
                    <StatCard label="Uniqueness" value={uniquenessScore !== null ? `${uniquenessScore}%` : '—'} icon="🔍" />
                    <StatCard label="Step" value={step === 'select' ? '1/3' : step === 'rewrite' ? '2/3' : '3/3'} icon="📊" />
                </div>

                {/* Step indicators */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="flex gap-3" style={{ justifyContent: 'center' }}>
                        {[
                            { label: '1. Select Content', active: step === 'select' },
                            { label: '2. AI Rewrite', active: step === 'rewrite' },
                            { label: '3. Publish', active: step === 'publish' },
                        ].map((s, i) => (
                            <div key={i} style={{
                                padding: '8px 20px', borderRadius: 20,
                                background: s.active ? 'var(--accent-primary)' : 'var(--bg-glass)',
                                color: s.active ? '#fff' : 'var(--text-muted)',
                                fontWeight: s.active ? 700 : 400, fontSize: '0.85rem',
                            }}>{s.label}</div>
                        ))}
                    </div>
                </div>

                {/* Controls */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Source Site</label>
                            <select className="form-select" value={selectedSourceSite} onChange={e => { setSelectedSourceSite(e.target.value); setSelectedPost(''); setStep('select'); }}>
                                <option value="">Select source...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Post to Syndicate</label>
                            <select className="form-select" value={selectedPost} onChange={e => { setSelectedPost(e.target.value); setStep('select'); }}>
                                <option value="">Select post...</option>
                                {posts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Site</label>
                            <select className="form-select" value={selectedTargetSite} onChange={e => setSelectedTargetSite(e.target.value)}>
                                <option value="">Select target...</option>
                                {targetSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={handleRewrite} disabled={loading || !selectedPost}>
                            {loading && step === 'select' ? '⏳ Rewriting...' : '🤖 AI Rewrite for Uniqueness'}
                        </button>
                        {rewrittenContent && (
                            <button className="btn btn-secondary" onClick={handleCheckUniqueness} disabled={loading}>
                                🔍 Check Uniqueness Score
                            </button>
                        )}
                        <button className="btn btn-primary" onClick={handleSyndicate} disabled={loading || !selectedTargetSite || !selectedPost} style={{ marginLeft: 'auto' }}>
                            {loading && step !== 'select' ? '⏳ Publishing...' : '📤 Syndicate as Draft'}
                        </button>
                    </div>
                </div>

                {/* Rewritten content preview */}
                {rewrittenContent && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div className="card-header">
                            <h2 className="card-title">🤖 Rewritten Content Preview</h2>
                            {uniquenessScore !== null && (
                                <Badge variant={uniquenessScore >= 70 ? 'success' : uniquenessScore >= 50 ? 'warning' : 'danger'}>
                                    {uniquenessScore}% Unique
                                </Badge>
                            )}
                        </div>
                        <div style={{
                            maxHeight: 400, overflow: 'auto', padding: 16,
                            background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)',
                            fontSize: '0.875rem', lineHeight: 1.6,
                        }} dangerouslySetInnerHTML={{ __html: rewrittenContent.slice(0, 3000) }} />
                    </div>
                )}

                {/* Status */}
                {step === 'publish' && (
                    <div className="card">
                        <EmptyState icon="✅" title="Syndication Complete!" description="Content published as draft on the target site with canonical URL pointing to the original. Review and publish when ready." />
                    </div>
                )}

                {!selectedPost && !rewrittenContent && (
                    <div className="card">
                        <EmptyState icon="🔄" title="Multi-Site Content Syndication"
                            description="Syndicate your best content across multiple WordPress sites. AI rewrites ensure uniqueness while canonical URLs maintain SEO link equity." />
                    </div>
                )}
            </main>
        </div>
    );
}
