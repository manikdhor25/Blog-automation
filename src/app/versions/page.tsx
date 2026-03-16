'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; }
interface Post { id: string; title: string; keyword: string; seo_score: number; }
interface Version {
    id: string; version_number: number; title: string; content: string;
    meta_title: string; meta_description: string; score: number;
    change_summary: string; created_at: string;
}

export default function VersionsPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [selectedPost, setSelectedPost] = useState('');
    const [versions, setVersions] = useState<Version[]>([]);
    const [loading, setLoading] = useState(false);
    const [compareA, setCompareA] = useState<number | null>(null);
    const [compareB, setCompareB] = useState<number | null>(null);
    const [showDiff, setShowDiff] = useState(false);

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

    const fetchVersions = async () => {
        if (!selectedPost) { toast.warning('Select a post'); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/versions?post_id=${selectedPost}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setVersions(data.versions || []);
            if (data.versions?.length === 0) toast.info('No versions saved yet for this post');
            else toast.success(`Found ${data.versions.length} version(s)`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Fetch failed');
        } finally {
            setLoading(false);
        }
    };

    const vA = versions.find(v => v.version_number === compareA);
    const vB = versions.find(v => v.version_number === compareB);

    const computeDiff = (textA: string, textB: string) => {
        const linesA = (textA || '').split('\n');
        const linesB = (textB || '').split('\n');
        const maxLen = Math.max(linesA.length, linesB.length);
        const diff: Array<{ type: 'same' | 'added' | 'removed' | 'changed'; lineA?: string; lineB?: string }> = [];
        for (let i = 0; i < maxLen; i++) {
            const a = linesA[i] ?? '';
            const b = linesB[i] ?? '';
            if (a === b) diff.push({ type: 'same', lineA: a });
            else if (!a && b) diff.push({ type: 'added', lineB: b });
            else if (a && !b) diff.push({ type: 'removed', lineA: a });
            else diff.push({ type: 'changed', lineA: a, lineB: b });
        }
        return diff;
    };

    const scoreChange = vA && vB ? vB.score - vA.score : 0;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Versioning & A/B Testing</h1>
                        <p className="page-description">Track changes, compare versions, and measure score improvements</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16 }}>
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
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={fetchVersions} disabled={loading} style={{ width: '100%' }}>
                                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Loading...</> : '📜 Load Versions'}
                            </button>
                        </div>
                    </div>
                </div>

                {versions.length > 0 && (
                    <>
                        <div className="grid-3" style={{ marginBottom: 24 }}>
                            <StatCard label="Total Versions" value={versions.length} icon="📜" />
                            <StatCard label="Latest Score" value={`${versions[0]?.score || 0}/100`} icon="📊" />
                            <StatCard label="First Score" value={`${versions[versions.length - 1]?.score || 0}/100`} icon="🏁" />
                        </div>

                        {/* Compare selector */}
                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 style={{ margin: '0 0 12px' }}>🔀 Compare Versions</h3>
                            <div className="grid-3" style={{ gap: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Version A (Before)</label>
                                    <select className="form-select" value={compareA ?? ''} onChange={e => setCompareA(Number(e.target.value))}>
                                        <option value="">Select...</option>
                                        {versions.map(v => <option key={v.version_number} value={v.version_number}>v{v.version_number} — {v.change_summary}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Version B (After)</label>
                                    <select className="form-select" value={compareB ?? ''} onChange={e => setCompareB(Number(e.target.value))}>
                                        <option value="">Select...</option>
                                        {versions.map(v => <option key={v.version_number} value={v.version_number}>v{v.version_number} — {v.change_summary}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                    <button className="btn btn-secondary" disabled={!compareA || !compareB} onClick={() => setShowDiff(!showDiff)} style={{ width: '100%' }}>
                                        {showDiff ? '📄 Hide Diff' : '🔀 Show Diff'}
                                    </button>
                                </div>
                            </div>

                            {vA && vB && (
                                <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                    <Badge variant="neutral">v{vA.version_number}: {vA.score}/100</Badge>
                                    <span>→</span>
                                    <Badge variant="neutral">v{vB.version_number}: {vB.score}/100</Badge>
                                    <Badge variant={scoreChange > 0 ? 'success' : scoreChange < 0 ? 'danger' : 'neutral'}>
                                        {scoreChange > 0 ? '+' : ''}{scoreChange} pts
                                    </Badge>
                                </div>
                            )}
                        </div>

                        {/* Diff view */}
                        {showDiff && vA && vB && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 12px' }}>📝 Content Diff (v{vA.version_number} → v{vB.version_number})</h3>
                                <div style={{ maxHeight: 400, overflow: 'auto', borderRadius: 8, background: 'rgba(0,0,0,0.3)', padding: 12 }}>
                                    {computeDiff(vA.content, vB.content).slice(0, 200).map((line, i) => (
                                        <div key={i} style={{
                                            fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.6,
                                            padding: '1px 6px', borderRadius: 3, marginBottom: 1,
                                            background: line.type === 'added' ? 'rgba(34,197,94,0.15)' :
                                                line.type === 'removed' ? 'rgba(239,68,68,0.15)' :
                                                    line.type === 'changed' ? 'rgba(234,179,8,0.12)' : 'transparent',
                                            color: line.type === 'same' ? 'var(--text-muted)' : 'var(--text-primary)',
                                        }}>
                                            {line.type === 'added' && <span style={{ color: '#22c55e' }}>+ {line.lineB}</span>}
                                            {line.type === 'removed' && <span style={{ color: '#ef4444' }}>- {line.lineA}</span>}
                                            {line.type === 'changed' && (
                                                <>
                                                    <span style={{ color: '#ef4444' }}>- {line.lineA}</span>
                                                    <br />
                                                    <span style={{ color: '#22c55e' }}>+ {line.lineB}</span>
                                                </>
                                            )}
                                            {line.type === 'same' && <span>  {line.lineA}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Version list */}
                        <div className="card">
                            <h3 style={{ margin: '0 0 12px' }}>📜 Version History</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {versions.map((v, i) => (
                                    <div key={v.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                        borderRadius: 8, background: i === 0 ? 'rgba(99,102,241,0.08)' : 'transparent',
                                        border: '1px solid var(--border-subtle)',
                                    }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                                            fontSize: '0.8rem', background: 'rgba(99,102,241,0.15)',
                                        }}>v{v.version_number}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{v.change_summary}</div>
                                            <div className="text-sm text-muted">{new Date(v.created_at).toLocaleString()}</div>
                                        </div>
                                        <Badge variant={v.score >= 70 ? 'success' : v.score >= 40 ? 'warning' : 'danger'}>
                                            {v.score}/100
                                        </Badge>
                                        {i === 0 && <Badge variant="info">LATEST</Badge>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {versions.length === 0 && (
                    <div className="card">
                        <EmptyState icon="📜" title="No Versions" description="Select a post to view its version history and compare changes over time." />
                    </div>
                )}
            </main>
        </div>
    );
}
