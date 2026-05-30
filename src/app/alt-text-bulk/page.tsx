'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ScanResult { post_id: string; post_title: string; missing_count: number; image_urls: string[]; keyword: string; }
interface AltResult { url: string; alt_text: string; title_attr: string; }

export default function AltTextBulkPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [scanResults, setScanResults] = useState<ScanResult[]>([]);
    const [altResults, setAltResults] = useState<AltResult[]>([]);
    const [selectedPost, setSelectedPost] = useState<ScanResult | null>(null);
    const [scanning, setScanning] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [pushing, setPushing] = useState(false);

    useEffect(() => { fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])); }, []);

    const scan = async () => {
        if (!siteId) { toast.warning('Select a site'); return; }
        setScanning(true); setScanResults([]);
        const res = await fetch('/api/alt-text-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan', site_id: siteId }) });
        const data = await res.json();
        setScanResults(data.results || []);
        toast.success(`${data.posts_with_missing} posts · ${data.total_missing} images missing alt text`);
        setScanning(false);
    };

    const generateForPost = async (r: ScanResult) => {
        setSelectedPost(r); setAltResults([]); setGenerating(true);
        const res = await fetch('/api/alt-text-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', post_id: r.post_id, keyword: r.keyword }) });
        const data = await res.json();
        setAltResults(data.generated || []);
        toast.success(`Generated ${data.count} alt texts`);
        setGenerating(false);
    };

    const pushToPost = async (postId: string) => {
        setPushing(true);
        const res = await fetch('/api/alt-text-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push_to_wp', post_id: postId }) });
        const data = await res.json();
        toast.success(`Applied ${data.alt_texts_applied} alt texts`);
        setSelectedPost(null); setAltResults([]);
        scan();
        setPushing(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Alt-Text Bulk Generator</h1>
                        <p className="page-description">Scan site for images without alt-text → AI-generate → apply in bulk</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0, flex: '0 1 280px' }}>
                        <label className="form-label">Site to Scan</label>
                        <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                            <option value="">Select site...</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={scan} disabled={!siteId || scanning}>{scanning ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Scanning...</> : '🔍 Scan for Missing Alt-Text'}</button>
                </div>

                {selectedPost && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">{selectedPost.post_title.substring(0, 50)} — {altResults.length} alt texts</h3><button className="btn btn-sm" onClick={() => { setSelectedPost(null); setAltResults([]); }}>✕</button></div>
                        {generating ? <div className="text-sm text-muted">Generating alt texts...</div>
                            : altResults.length > 0 ? (
                                <>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                                        {altResults.map((r, i) => (
                                            <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                                <div className="text-sm text-muted" style={{ marginBottom: 2 }}>{r.url.substring(0, 60)}</div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Alt: {r.alt_text}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="btn btn-success" onClick={() => pushToPost(selectedPost.post_id)} disabled={pushing}>{pushing ? 'Applying...' : 'Apply All Alt Texts to Post'}</button>
                                </>
                            ) : null
                        }
                    </div>
                )}

                <div className="card">
                    {scanResults.length === 0 ? <EmptyState icon="🖼️" title="No Scan Results" description="Select a site and click Scan to find images missing alt-text" />
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {scanResults.map(r => (
                                <div key={r.post_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{r.post_title.substring(0, 60)}</div>
                                        <div className="text-sm text-muted">{r.missing_count} images missing alt text{r.keyword ? ` · keyword: ${r.keyword}` : ''}</div>
                                    </div>
                                    <button className="btn btn-sm btn-primary" onClick={() => generateForPost(r)} disabled={generating}>Generate & Apply →</button>
                                </div>
                            ))}
                        </div>
                    }
                </div>
            </main>
        </div>
    );
}
