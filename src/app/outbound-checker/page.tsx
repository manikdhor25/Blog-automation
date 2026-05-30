'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface BrokenLink { post_id: string; post_title: string; url: string; status: number; error?: string; is_affiliate: boolean; }
interface CheckResult { id: string; posts_checked: number; links_checked: number; broken_count: number; broken_links: BrokenLink[]; checked_at: string; }

export default function OutboundCheckerPage() {
    const toast = useToast();
    const [siteId, setSiteId] = useState('');
    const [affiliateOnly, setAffiliateOnly] = useState(false);
    const [results, setResults] = useState<CheckResult | null>(null);
    const [history, setHistory] = useState<CheckResult[]>([]);
    const [checking, setChecking] = useState(false);

    useEffect(() => { loadHistory(); }, []);

    const loadHistory = async () => {
        const res = await fetch('/api/outbound-checker');
        const data = await res.json();
        setHistory(data.results || []);
    };

    const check = async () => {
        if (!siteId) { toast.warning('Enter site ID'); return; }
        setChecking(true);
        const res = await fetch('/api/outbound-checker', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check', site_id: siteId, include_affiliate_only: affiliateOnly }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setChecking(false); return; }
        setResults({ ...data.saved, broken_links: data.broken_links });
        toast[data.broken_links.length > 0 ? 'warning' : 'success'](`Checked ${data.links_checked} links — ${data.broken_links.length} broken`);
        loadHistory();
        setChecking(false);
    };

    const statusColor = (s: number) => s === 404 ? '#dc2626' : s === 0 ? '#6b7280' : s >= 500 ? '#ea580c' : '#d97706';
    const statusLabel = (s: number, err?: string) => s === 0 ? (err || 'timeout') : `HTTP ${s}`;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Broken Outbound Link Checker</h1>
                        <p className="page-description">Scan posts for broken affiliate and external links — find dead links before they kill revenue</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="Site ID (UUID from Sites page)" style={{ flex: 1, minWidth: 200 }} />
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={affiliateOnly} onChange={e => setAffiliateOnly(e.target.checked)} />
                            <span className="text-sm">Affiliate links only</span>
                        </label>
                        <button className="btn btn-primary" onClick={check} disabled={checking || !siteId}>
                            {checking ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Checking...</> : '🔍 Check Links'}
                        </button>
                    </div>
                    <div className="text-sm text-muted" style={{ marginTop: 8 }}>Checks up to 15 links per post, 20 posts max. Checks HEAD requests with 8s timeout.</div>
                </div>

                {results && (
                    <>
                        <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'Posts Checked', value: results.posts_checked, icon: '📄' },
                                { label: 'Links Checked', value: results.links_checked, icon: '🔗' },
                                { label: 'Broken Links', value: results.broken_count, icon: '💔', color: results.broken_count > 0 ? '#dc2626' : '#16a34a' },
                                { label: 'Affiliate Broken', value: results.broken_links?.filter(l => l.is_affiliate).length || 0, icon: '💰', color: (results.broken_links?.filter(l => l.is_affiliate).length || 0) > 0 ? '#dc2626' : '#16a34a' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                    <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {results.broken_links?.length === 0 ? (
                            <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
                                <div style={{ fontWeight: 700, color: '#16a34a' }}>All links working!</div>
                                <div className="text-sm text-muted">No broken outbound links found</div>
                            </div>
                        ) : (
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Broken Links</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {results.broken_links.map((link, i) => (
                                        <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${statusColor(link.status)}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                                                        {link.is_affiliate && <Badge variant="warning">Affiliate</Badge>}
                                                        <span style={{ fontWeight: 600, fontSize: '0.75rem', color: statusColor(link.status) }}>{statusLabel(link.status, link.error)}</span>
                                                    </div>
                                                    <div className="text-sm text-muted" style={{ marginBottom: 2 }}>Post: <strong>{link.post_title}</strong></div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{link.url}</div>
                                                </div>
                                                <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success('URL copied'))} style={{ flexShrink: 0, marginLeft: 8 }}>📋</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {history.length > 0 && !results && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Previous Checks</h3>
                        {history.map((h, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => setResults(h)}>
                                <div>
                                    <span className="text-sm">{h.posts_checked} posts · {h.links_checked} links</span>
                                    {h.broken_count > 0 && <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>{h.broken_count} broken</span>}
                                </div>
                                <span className="text-sm text-muted">{new Date(h.checked_at).toLocaleDateString()}</span>
                            </div>
                        ))}
                    </div>
                )}

                {!results && !checking && history.length === 0 && <EmptyState icon="🔍" title="Enter site ID to check links" description="Scans all posts for broken outbound and affiliate links" />}
            </main>
        </div>
    );
}
