'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface BrokenLink { id: string; url: string; anchor: string; context: string; http_status: number | null; error: string | null; post_id: string; }
interface Suggestion { url: string; title: string; why: string; authority: string; }

export default function LinkFixerPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [postId, setPostId] = useState('');
    const [brokenLinks, setBrokenLinks] = useState<BrokenLink[]>([]);
    const [scanResult, setScanResult] = useState<{ total_links: number; broken_count: number; post_title: string } | null>(null);
    const [suggestions, setSuggestions] = useState<{ suggestions: Suggestion[]; original_topic: string; search_query: string } | null>(null);
    const [selectedLink, setSelectedLink] = useState<BrokenLink | null>(null);
    const [replacement, setReplacement] = useState('');
    const [scanning, setScanning] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [fixing, setFixing] = useState(false);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
        fetch('/api/posts?status=published&limit=50').then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {});
        fetch('/api/link-fixer').then(r => r.json()).then(d => setBrokenLinks(d.broken_links || []));
    }, []);

    const scanPost = async () => {
        if (!postId) { toast.warning('Select a post'); return; }
        setScanning(true); setScanResult(null);
        const res = await fetch('/api/link-fixer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan_post', post_id: postId }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setScanning(false); return; }
        setScanResult({ total_links: data.total_links, broken_count: data.broken_count, post_title: data.post_title });
        toast.success(`Scanned ${data.total_links} links — ${data.broken_count} broken`);
        fetch('/api/link-fixer').then(r => r.json()).then(d => setBrokenLinks(d.broken_links || []));
        setScanning(false);
    };

    const getSuggestions = async (link: BrokenLink) => {
        setSelectedLink(link); setSuggestions(null); setSuggesting(true);
        const res = await fetch('/api/link-fixer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'suggest_replacement', broken_url: link.url, context: link.context }) });
        const data = await res.json();
        setSuggestions(data.suggestions ? data : null);
        setSuggesting(false);
    };

    const applyFix = async () => {
        if (!selectedLink || !replacement) { toast.warning('Select replacement URL'); return; }
        setFixing(true);
        const res = await fetch('/api/link-fixer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply_fix', post_id: selectedLink.post_id, broken_url: selectedLink.url, replacement_url: replacement }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setFixing(false); return; }
        toast.success(`Fixed ${data.replacements} occurrence${data.replacements > 1 ? 's' : ''}`);
        setSelectedLink(null); setSuggestions(null); setReplacement('');
        fetch('/api/link-fixer').then(r => r.json()).then(d => setBrokenLinks(d.broken_links || []));
        setFixing(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Outbound Link Fixer</h1>
                        <p className="page-description">Detect broken outbound links in posts → AI suggests replacements → fix in one click</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0, flex: '1 1 280px' }}>
                            <label className="form-label">Select Post to Scan</label>
                            <select className="form-select" value={postId} onChange={e => setPostId(e.target.value)}>
                                <option value="">Select post...</option>
                                {posts.map(p => <option key={p.id} value={p.id}>{p.title.substring(0, 60)}</option>)}
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={scanPost} disabled={!postId || scanning} style={{ marginBottom: 1 }}>{scanning ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Scanning...</> : '🔍 Scan Links'}</button>
                    </div>
                    {scanResult && <div className="text-sm text-muted" style={{ marginTop: 8 }}>Scanned {scanResult.total_links} links in "{scanResult.post_title}" — <strong style={{ color: scanResult.broken_count > 0 ? '#dc2626' : '#16a34a' }}>{scanResult.broken_count} broken</strong></div>}
                </div>

                {selectedLink && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Fix: {selectedLink.url.substring(0, 60)}...</h3><button className="btn btn-sm" onClick={() => { setSelectedLink(null); setSuggestions(null); }}>✕</button></div>
                        {suggesting ? <div className="text-sm text-muted">Getting AI replacement suggestions...</div>
                            : suggestions ? (
                                <>
                                    <div style={{ marginBottom: 10 }}>
                                        <div className="form-label">AI Replacement Suggestions</div>
                                        {suggestions.suggestions?.map((s, i) => (
                                            <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 6, cursor: 'pointer', border: replacement === s.url ? '2px solid var(--color-primary)' : '1px solid transparent' }} onClick={() => setReplacement(s.url)}>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.title}</div>
                                                <div className="text-sm text-muted">{s.url}</div>
                                                <div className="text-sm" style={{ color: '#2563eb' }}>{s.why}</div>
                                                <Badge variant="neutral">{s.authority}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className="form-input" value={replacement} onChange={e => setReplacement(e.target.value)} placeholder="Or paste replacement URL manually" style={{ flex: 1 }} />
                                        <button className="btn btn-success" onClick={applyFix} disabled={!replacement || fixing}>{fixing ? 'Fixing...' : 'Apply Fix'}</button>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginTop: 6 }}>Search manually: {suggestions.search_query}</div>
                                </>
                            ) : null
                        }
                    </div>
                )}

                <div className="card">
                    {brokenLinks.length === 0 ? <EmptyState icon="🔗" title="No Broken Links" description="Scan posts to detect broken outbound links" />
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {brokenLinks.map(link => (
                                <div key={link.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#dc2626' }}>{link.url.substring(0, 70)}</div>
                                        <div className="text-sm text-muted">{link.anchor} {link.http_status ? `· HTTP ${link.http_status}` : link.error ? `· ${link.error}` : ''}</div>
                                    </div>
                                    <button className="btn btn-sm btn-primary" onClick={() => getSuggestions(link)} disabled={suggesting}>Fix</button>
                                </div>
                            ))}
                        </div>
                    }
                </div>
            </main>
        </div>
    );
}
