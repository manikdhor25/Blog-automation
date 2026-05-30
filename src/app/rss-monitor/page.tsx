'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Feed { id: string; label: string; feed_url: string; competitor_domain?: string; niche?: string; item_count: number; last_checked: string; is_active: boolean; alert_on_new: boolean; }
interface FeedItem { id: string; feed_id: string; title: string; url: string; summary: string; published_at: string; is_new: boolean; }

export default function RssMonitorPage() {
    const toast = useToast();
    const [feeds, setFeeds] = useState<Feed[]>([]);
    const [items, setItems] = useState<FeedItem[]>([]);
    const [tab, setTab] = useState<'feed' | 'add'>('feed');
    const [feedUrl, setFeedUrl] = useState('');
    const [label, setLabel] = useState('');
    const [domain, setDomain] = useState('');
    const [niche, setNiche] = useState('');
    const [alertOnNew, setAlertOnNew] = useState(true);
    const [adding, setAdding] = useState(false);
    const [checking, setChecking] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<Record<string, Record<string, unknown>>>({});

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await fetch('/api/rss-monitor');
        const data = await res.json();
        setFeeds(data.feeds || []);
        setItems(data.items || []);
    };

    const addFeed = async () => {
        if (!feedUrl || !label) { toast.warning('Feed URL and label required'); return; }
        setAdding(true);
        const res = await fetch('/api/rss-monitor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', feed_url: feedUrl, label, competitor_domain: domain || undefined, niche: niche || undefined, alert_on_new: alertOnNew }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success(`Added feed — ${data.items_found} posts found`);
            setFeedUrl(''); setLabel(''); setDomain('');
            load(); setTab('feed');
        }
        setAdding(false);
    };

    const checkFeed = async (feedId: string) => {
        setChecking(feedId);
        const res = await fetch('/api/rss-monitor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check', feed_id: feedId }),
        });
        const data = await res.json();
        if (res.ok) { toast.success(`${data.new_items} new items found`); load(); }
        setChecking(null);
    };

    const analyzeFeed = async (feedId: string) => {
        setAnalyzing(feedId);
        const res = await fetch('/api/rss-monitor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'analyze', feed_id: feedId }),
        });
        const data = await res.json();
        if (res.ok) { setAnalysis(prev => ({ ...prev, [feedId]: data.analysis })); toast.success('Analysis complete'); }
        setAnalyzing(null);
    };

    const deleteFeed = async (feedId: string) => {
        await fetch('/api/rss-monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', feed_id: feedId }) });
        load();
    };

    const newItems = items.filter(i => i.is_new);
    const feedItems = (feedId: string) => items.filter(i => i.feed_id === feedId).slice(0, 5);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">RSS Competitor Monitor</h1>
                        <p className="page-description">Watch competitor RSS feeds — get alerts on new posts, AI analyzes content opportunities</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {newItems.length > 0 && <Badge variant="warning">{newItems.length} new</Badge>}
                        {(['feed', 'add'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                                {t === 'add' ? '+ Add Feed' : `Feeds (${feeds.length})`}
                            </button>
                        ))}
                    </div>
                </div>

                {tab === 'add' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Add RSS Feed</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">RSS Feed URL *</label>
                                <input className="form-input" value={feedUrl} onChange={e => setFeedUrl(e.target.value)} placeholder="https://competitor.com/feed" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Label *</label>
                                <input className="form-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="NerdWallet Blog" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Competitor Domain</label>
                                <input className="form-input" value={domain} onChange={e => setDomain(e.target.value)} placeholder="nerdwallet.com" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance" />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <button className="btn btn-primary" onClick={addFeed} disabled={adding}>{adding ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Adding...</> : '📡 Add Feed'}</button>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={alertOnNew} onChange={e => setAlertOnNew(e.target.checked)} />
                                <span className="text-sm">Alert on new posts</span>
                            </label>
                        </div>
                    </div>
                )}

                {tab === 'feed' && (
                    feeds.length === 0 ? <EmptyState icon="📡" title="No feeds monitored" description="Add competitor RSS feeds to track new content and find content opportunities" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {feeds.map((feed, i) => (
                                <div key={i} className="card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                        <div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 700 }}>{feed.label}</span>
                                                {feed.competitor_domain && <span className="text-sm text-muted">{feed.competitor_domain}</span>}
                                                {feed.niche && <Badge variant="neutral">{feed.niche}</Badge>}
                                                {feed.alert_on_new && <Badge variant="info">Alerts on</Badge>}
                                            </div>
                                            <div className="text-sm text-muted">
                                                {feed.item_count} items · Last checked: {new Date(feed.last_checked).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm" onClick={() => checkFeed(feed.id)} disabled={checking === feed.id}>{checking === feed.id ? '...' : '🔄 Check'}</button>
                                            <button className="btn btn-sm btn-primary" onClick={() => analyzeFeed(feed.id)} disabled={analyzing === feed.id}>{analyzing === feed.id ? '...' : '🤖 Analyze'}</button>
                                            <button className="btn btn-sm" onClick={() => deleteFeed(feed.id)} style={{ color: '#dc2626' }}>🗑</button>
                                        </div>
                                    </div>

                                    {/* Recent items */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {feedItems(feed.id).map((item, ii) => (
                                            <div key={ii} style={{ padding: '6px 8px', background: item.is_new ? '#eff6ff' : 'var(--bg-secondary)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <a href={item.url} target="_blank" rel="noreferrer" style={{ fontWeight: item.is_new ? 700 : 400, fontSize: '0.85rem', color: 'var(--text-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item.title}</a>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                    {item.is_new && <Badge variant="info">New</Badge>}
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(item.published_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* AI Analysis */}
                                    {analysis[feed.id] && (
                                        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f0fdf4', borderRadius: 6 }}>
                                            <div style={{ fontWeight: 700, marginBottom: 6 }}>🤖 Content Opportunities</div>
                                            <div className="grid-2" style={{ gap: 12 }}>
                                                <div>
                                                    <div className="form-label">Gaps You Can Fill</div>
                                                    {(analysis[feed.id].gaps_you_can_fill as string[])?.map((g, gi) => <div key={gi} className="text-sm" style={{ marginBottom: 2 }}>• {g}</div>)}
                                                </div>
                                                <div>
                                                    <div className="form-label">Content Ideas</div>
                                                    {(analysis[feed.id].content_ideas as Array<{ title: string; urgency: string }>)?.slice(0, 3).map((ci, cii) => (
                                                        <div key={cii} className="text-sm" style={{ marginBottom: 2 }}>
                                                            <Badge variant={ci.urgency === 'high' ? 'warning' : 'neutral'} >{ci.urgency}</Badge>
                                                            <span style={{ marginLeft: 6 }}>{ci.title}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
