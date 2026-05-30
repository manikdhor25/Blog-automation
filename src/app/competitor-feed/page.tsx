'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Feed { id: string; domain: string; label: string; feed_url: string; last_checked: string; last_post_title: string | null; last_post_url: string | null; last_post_date: string | null; is_active: boolean; }
interface FeedItem { id: string; title: string; url: string; published_at: string; summary: string; is_read: boolean; competitor_feeds: { domain: string; label: string }; }

export default function CompetitorFeedPage() {
    const toast = useToast();
    const [feeds, setFeeds] = useState<Feed[]>([]);
    const [items, setItems] = useState<FeedItem[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [activeTab, setActiveTab] = useState<'feeds' | 'items'>('items');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [form, setForm] = useState({ domain: '', feed_url: '', label: '' });

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [fRes, iRes] = await Promise.all([fetch('/api/competitor-feed'), fetch('/api/competitor-feed?view=items')]);
        const [fData, iData] = await Promise.all([fRes.json(), iRes.json()]);
        setFeeds(fData.feeds || []);
        setItems(iData.items || []);
        setLoading(false);
    };

    const addFeed = async () => {
        if (!form.domain && !form.feed_url) { toast.warning('Domain or feed URL required'); return; }
        const res = await fetch('/api/competitor-feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_feed', ...form }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success(`Feed added — ${data.initial_items} initial posts`);
        setShowAdd(false);
        setForm({ domain: '', feed_url: '', label: '' });
        fetchAll();
    };

    const refreshAll = async () => {
        setRefreshing(true);
        const res = await fetch('/api/competitor-feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh_all' }) });
        const data = await res.json();
        toast.success(`Checked ${data.feeds_checked} feeds — ${data.new_items} new posts`);
        fetchAll();
        setRefreshing(false);
    };

    const markRead = async (id: string) => {
        await fetch('/api/competitor-feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_read', id }) });
        setItems(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i));
    };

    const unread = items.filter(i => !i.is_read).length;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Competitor Feed Monitor</h1>
                        <p className="page-description">Track when competitors publish new content — find timing opportunities</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={refreshAll} disabled={refreshing}>{refreshing ? 'Refreshing...' : '↻ Refresh All'}</button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Feed</button>
                    </div>
                </div>

                <div className="grid-3" style={{ gap: 16, marginBottom: 24 }}>
                    {[{ label: 'Feeds', value: feeds.length, icon: '📡' }, { label: 'Unread Posts', value: unread, icon: '🆕' }, { label: 'Total Posts', value: items.length, icon: '📄' }].map((s, i) => (
                        <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                            <div className="text-sm text-muted">{s.label}</div>
                        </div>
                    ))}
                </div>

                {showAdd && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Add Competitor Feed</h3><button className="btn btn-sm" onClick={() => setShowAdd(false)}>✕</button></div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Domain <span className="text-muted text-sm">(auto-discovers RSS)</span></label>
                                <input className="form-input" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="competitor.com" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">OR Direct Feed URL</label>
                                <input className="form-input" value={form.feed_url} onChange={e => setForm(f => ({ ...f, feed_url: e.target.value }))} placeholder="https://competitor.com/feed" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Label</label>
                                <input className="form-input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Main competitor" />
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={addFeed}>Add Feed</button>
                    </div>
                )}

                <div className="tabs" style={{ marginBottom: 12 }}>
                    <button className={`tab ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>Posts {unread > 0 && <Badge variant="danger">{unread} new</Badge>}</button>
                    <button className={`tab ${activeTab === 'feeds' ? 'active' : ''}`} onClick={() => setActiveTab('feeds')}>Feeds ({feeds.length})</button>
                </div>

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : activeTab === 'feeds' ? (
                            feeds.length === 0 ? <EmptyState icon="📡" title="No Feeds" description="Add competitor domains to monitor their publishing activity" />
                                : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {feeds.map(f => (
                                        <div key={f.id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{f.label || f.domain}</div>
                                                <div className="text-sm text-muted">{f.domain} · Last checked: {new Date(f.last_checked).toLocaleDateString()}</div>
                                                {f.last_post_title && <div className="text-sm text-muted">Latest: {f.last_post_title.substring(0, 60)}</div>}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-sm" onClick={async () => { await fetch('/api/competitor-feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh', id: f.id }) }); fetchAll(); }}>Refresh</button>
                                                <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/competitor-feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: f.id }) }); fetchAll(); }}>Del</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                        ) : (
                            items.length === 0 ? <EmptyState icon="📄" title="No Posts Yet" description="Add competitor feeds and click Refresh All to fetch their latest posts" />
                                : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {items.map(item => (
                                        <div key={item.id} className="card" style={{ padding: 12, opacity: item.is_read ? 0.6 : 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                                        {!item.is_read && <Badge variant="danger">New</Badge>}
                                                        <span className="text-sm text-muted">{item.competitor_feeds?.label || item.competitor_feeds?.domain}</span>
                                                        <span className="text-sm text-muted">{new Date(item.published_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}>{item.title}</a>
                                                    {item.summary && <div className="text-sm text-muted" style={{ marginTop: 4 }}>{item.summary.substring(0, 150)}...</div>}
                                                </div>
                                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                                    {!item.is_read && <button className="btn btn-sm" onClick={() => markRead(item.id)}>Read</button>}
                                                    <a href={`/create?keyword=${encodeURIComponent(item.title.split(' ').slice(0, 5).join(' '))}`} className="btn btn-sm btn-success">Write Similar →</a>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                        )
                    }
                </div>
            </main>
        </div>
    );
}
