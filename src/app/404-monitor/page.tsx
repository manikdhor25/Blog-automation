'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Page404 { id: string; url: string; referrer?: string; hit_count: number; status: string; first_seen: string; last_seen: string; }
interface Redirect { id: string; from_url: string; to_url: string; redirect_type: string; hit_count: number; is_active: boolean; }

export default function Monitor404Page() {
    const toast = useToast();
    const [pages, setPages] = useState<Page404[]>([]);
    const [redirects, setRedirects] = useState<Redirect[]>([]);
    const [siteId, setSiteId] = useState('');
    const [filter, setFilter] = useState('unresolved');
    const [tab, setTab] = useState<'404s' | 'redirects'>('404s');
    const [unresolvedCount, setUnresolvedCount] = useState(0);
    const [redirecting, setRedirecting] = useState<string | null>(null);
    const [redirectTo, setRedirectTo] = useState<Record<string, string>>({});

    useEffect(() => { load(); }, [filter, siteId]);

    const load = async () => {
        const params = new URLSearchParams({ status: filter });
        if (siteId) params.set('site_id', siteId);
        const res = await fetch(`/api/404-monitor?${params}`);
        const data = await res.json();
        setPages(data.pages || []);
        setRedirects(data.redirects || []);
        setUnresolvedCount(data.unresolved_count || 0);
    };

    const createRedirect = async (fromUrl: string) => {
        const toUrl = redirectTo[fromUrl];
        if (!toUrl) { toast.warning('Enter redirect destination'); return; }
        setRedirecting(fromUrl);
        const res = await fetch('/api/404-monitor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create_redirect', from_url: fromUrl, to_url: toUrl, site_id: siteId || undefined }),
        });
        if (res.ok) { toast.success('301 redirect created'); load(); }
        else { const d = await res.json(); toast.error(d.error || 'Failed'); }
        setRedirecting(null);
    };

    const markResolved = async (id: string) => {
        await fetch('/api/404-monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_resolved', page_id: id }) });
        load();
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">404 Monitor</h1>
                        <p className="page-description">Track broken pages, create 301 redirects, recover lost link equity</p>
                    </div>
                    {unresolvedCount > 0 && <Badge variant="danger">{unresolvedCount} unresolved</Badge>}
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                    <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="Site ID (optional filter)" style={{ flex: 1, minWidth: 200 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['404s', 'redirects'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>{t}</button>
                        ))}
                    </div>
                </div>

                {tab === '404s' && (
                    <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                            {['unresolved', 'redirected', 'resolved', 'all'].map(s => (
                                <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : ''}`} onClick={() => setFilter(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
                            ))}
                        </div>

                        {pages.length === 0 ? (
                            <EmptyState icon="🔍" title="No 404s found" description="Install the tracking snippet or log 404s via API to monitor broken pages" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {pages.map((p, i) => (
                                    <div key={i} className="card" style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, marginBottom: 2 }}>{p.url}</div>
                                                <div style={{ display: 'flex', gap: 12 }}>
                                                    <span style={{ fontWeight: 700, color: p.hit_count >= 10 ? '#dc2626' : '#d97706' }}>{p.hit_count} hits</span>
                                                    {p.referrer && <span className="text-sm text-muted">from: {p.referrer}</span>}
                                                    <span className="text-sm text-muted">last: {new Date(p.last_seen).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            <Badge variant={p.status === 'unresolved' ? 'danger' : p.status === 'redirected' ? 'success' : 'neutral'}>{p.status}</Badge>
                                        </div>
                                        {p.status === 'unresolved' && (
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <input className="form-input" value={redirectTo[p.url] || ''} onChange={e => setRedirectTo(prev => ({ ...prev, [p.url]: e.target.value }))} placeholder="Redirect to: /new-url" style={{ flex: 1 }} />
                                                <button className="btn btn-sm btn-primary" onClick={() => createRedirect(p.url)} disabled={redirecting === p.url}>{redirecting === p.url ? '...' : '→ 301'}</button>
                                                <button className="btn btn-sm" onClick={() => markResolved(p.id)}>✓ Resolved</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {tab === 'redirects' && (
                    redirects.length === 0 ? <EmptyState icon="↗️" title="No redirects created" description="Create 301 redirects from the 404s tab to fix broken pages" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {redirects.map((r, i) => (
                                <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{r.from_url}</span>
                                        <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>→</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#16a34a' }}>{r.to_url}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Badge variant="info">{r.redirect_type}</Badge>
                                        <span className="text-sm text-muted">{r.hit_count} hits</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
