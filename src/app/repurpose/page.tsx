'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; url: string; }
interface Post { id: string; title: string; keyword: string; slug: string; }

export default function RepurposePage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [selectedPost, setSelectedPost] = useState('');
    const [formats, setFormats] = useState(['twitter', 'linkedin', 'email', 'video_script']);
    const [loading, setLoading] = useState(false);
    const [snippets, setSnippets] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    useEffect(() => {
        if (!selectedSite) { setPosts([]); return; }
        fetch(`/api/sites/sync?site_id=${selectedSite}`)
            .then(r => r.json())
            .then(d => setPosts(d.posts || []))
            .catch(() => { });
    }, [selectedSite]);

    const toggleFormat = (f: string) => {
        setFormats(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
    };

    const handleRepurpose = async () => {
        if (!selectedPost) { toast.warning('Select a post first'); return; }
        if (formats.length === 0) { toast.warning('Select at least one format'); return; }
        setLoading(true);
        setSnippets(null);
        try {
            const res = await fetch('/api/repurpose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: selectedPost, site_id: selectedSite, formats }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSnippets(data.snippets);
            toast.success('Content repurposed successfully!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Repurposing failed');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    const formatLabels: Record<string, { icon: string; label: string }> = {
        twitter: { icon: '🐦', label: 'Twitter/X Thread' },
        linkedin: { icon: '💼', label: 'LinkedIn Post' },
        email: { icon: '📧', label: 'Email Newsletter' },
        video_script: { icon: '🎬', label: 'Video Script' },
    };

    const renderSnippet = (key: string, data: Record<string, unknown>) => {
        const info = formatLabels[key] || { icon: '📄', label: key };
        return (
            <div key={key} className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{info.icon} {info.label}</h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => copyToClipboard(JSON.stringify(data, null, 2))}>
                        📋 Copy
                    </button>
                </div>
                <pre style={{
                    background: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 8,
                    fontSize: '0.8rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    color: 'var(--text-secondary)', maxHeight: 300, overflow: 'auto',
                }}>
                    {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
                </pre>
            </div>
        );
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Repurposing</h1>
                        <p className="page-description">Transform blog posts into social media, email, and video content</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Site</label>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Post</label>
                            <select className="form-select" value={selectedPost} onChange={e => setSelectedPost(e.target.value)}>
                                <option value="">Select post...</option>
                                {posts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label className="form-label">Output Formats</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {Object.entries(formatLabels).map(([key, val]) => (
                                <button key={key}
                                    className={`btn btn-sm ${formats.includes(key) ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => toggleFormat(key)}
                                >{val.icon} {val.label}</button>
                            ))}
                        </div>
                    </div>

                    <button className="btn btn-primary" onClick={handleRepurpose} disabled={loading}>
                        {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating...</> : '🔄 Repurpose Content'}
                    </button>
                </div>

                {snippets ? (
                    Object.entries(snippets).map(([key, data]) =>
                        renderSnippet(key, data as Record<string, unknown>)
                    )
                ) : (
                    <div className="card">
                        <EmptyState icon="🔄" title="No Repurposed Content Yet" description="Select a post and generate social media snippets, email content, and video scripts." />
                    </div>
                )}
            </main>
        </div>
    );
}
