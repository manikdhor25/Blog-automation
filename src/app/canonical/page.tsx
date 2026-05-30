'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

export default function CanonicalPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);
    const [results, setResults] = useState<Array<{ post_id: string; title: string; post_url: string; canonical_status: string; existing_canonical: string | null; needs_attention: boolean }>>([]);
    const [canonicals, setCanonicals] = useState<Array<{ post_id: string; canonical_url: string; set_at: string }>>([]);
    const [scanning, setScanning] = useState(false);
    const [postId, setPostId] = useState('');
    const [canonicalUrl, setCanonicalUrl] = useState('');
    const [setting, setSetting] = useState(false);
    const [note, setNote] = useState('');

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
        fetch('/api/posts?status=published&limit=50').then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {});
        fetch('/api/canonical').then(r => r.json()).then(d => setCanonicals(d.canonicals || []));
    }, []);

    const scan = async () => {
        if (!siteId) { toast.warning('Select a site'); return; }
        setScanning(true);
        const res = await fetch('/api/canonical', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan', site_id: siteId }) });
        const data = await res.json();
        setResults(data.results || []);
        toast.success(`Scanned ${data.results?.length} posts — ${data.needs_attention} need attention`);
        setScanning(false);
    };

    const setCanonical = async () => {
        if (!postId || !canonicalUrl) { toast.warning('Post and canonical URL required'); return; }
        setSetting(true);
        const res = await fetch('/api/canonical', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_canonical', post_id: postId, canonical_url: canonicalUrl }) });
        const data = await res.json();
        if (res.ok) { setNote(data.note); toast.success('Canonical set'); fetch('/api/canonical').then(r => r.json()).then(d => setCanonicals(d.canonicals || [])); }
        setSetting(false);
    };

    const statusColor = (s: string) => ({ correct: '#16a34a', missing: '#dc2626', pointing_elsewhere: '#d97706' }[s] || '#6b7280');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Canonical Manager</h1>
                        <p className="page-description">Detect missing/incorrect canonical tags on syndicated content → set correct URLs</p>
                    </div>
                </div>

                <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Scan Site for Canonical Issues</h3>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={scan} disabled={!siteId || scanning}>{scanning ? 'Scanning...' : 'Scan'}</button>
                        </div>
                    </div>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Set Canonical URL</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <select className="form-select" value={postId} onChange={e => setPostId(e.target.value)}>
                                <option value="">Select post...</option>
                                {posts.map(p => <option key={p.id} value={p.id}>{p.title.substring(0, 50)}</option>)}
                            </select>
                            <input className="form-input" value={canonicalUrl} onChange={e => setCanonicalUrl(e.target.value)} placeholder="https://yoursite.com/original-post/" />
                            <button className="btn btn-primary btn-sm" onClick={setCanonical} disabled={!postId || !canonicalUrl || setting}>{setting ? 'Setting...' : 'Set Canonical'}</button>
                        </div>
                        {note && <div className="text-sm text-muted" style={{ marginTop: 8 }}>{note}</div>}
                    </div>
                </div>

                {results.length > 0 && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Scan Results</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {results.filter(r => r.needs_attention).map(r => (
                                <div key={r.post_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${statusColor(r.canonical_status)}` }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{r.title.substring(0, 50)}</div>
                                        <div className="text-sm text-muted">{r.post_url.substring(0, 60)}</div>
                                    </div>
                                    <Badge variant={r.canonical_status === 'correct' ? 'success' : r.canonical_status === 'missing' ? 'danger' : 'warning'}>{r.canonical_status.replace('_', ' ')}</Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="card">
                    <h3 className="card-title" style={{ marginBottom: 12 }}>Saved Canonicals</h3>
                    {canonicals.length === 0 ? <EmptyState icon="🔗" title="No Canonicals Set" description="Set canonical URLs for syndicated or duplicate content" />
                        : canonicals.map(c => (
                            <div key={c.post_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                                <div className="text-sm text-muted">{c.canonical_url}</div>
                                <div className="text-sm text-muted">{new Date(c.set_at).toLocaleDateString()}</div>
                            </div>
                        ))
                    }
                </div>
            </main>
        </div>
    );
}
