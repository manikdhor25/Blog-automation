'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface TrendingTopic {
    id: string;
    niche: string;
    source: string;
    title: string;
    trend_score: number;
    content_angle: string;
    keyword_opportunity: string;
    content_type?: string;
    search_intent?: string;
    urgency?: string;
    reason?: string;
    status: string;
    discovered_at: string;
}

export default function TrendingPage() {
    const toast = useToast();
    const [trends, setTrends] = useState<TrendingTopic[]>([]);
    const [saved, setSaved] = useState<TrendingTopic[]>([]);
    const [loading, setLoading] = useState(false);
    const [discovering, setDiscovering] = useState(false);
    const [niche, setNiche] = useState('');
    const [source, setSource] = useState<'all' | 'reddit' | 'ai_predict'>('all');
    const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('week');
    const [activeTab, setActiveTab] = useState<'discover' | 'saved'>('discover');

    useEffect(() => {
        fetchSaved();
        fetchRecent();
    }, []);

    const fetchRecent = async () => {
        setLoading(true);
        const res = await fetch('/api/trending?status=new');
        const data = await res.json();
        setTrends(data.trends || []);
        setLoading(false);
    };

    const fetchSaved = async () => {
        const res = await fetch('/api/trending?status=saved');
        const data = await res.json();
        setSaved(data.trends || []);
    };

    const discover = async () => {
        if (!niche) { toast.warning('Enter niche first'); return; }
        setDiscovering(true);
        try {
            const res = await fetch('/api/trending', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'discover', niche, source, timeframe }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Failed'); return; }
            setTrends(data.trends || []);
            toast.success(`Found ${data.count} trending topics`);
        } catch { toast.error('Discovery failed'); }
        finally { setDiscovering(false); }
    };

    const saveTopic = async (id: string) => {
        await fetch('/api/trending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', id }) });
        toast.success('Topic saved');
        fetchSaved();
        setTrends(prev => prev.map(t => t.id === id ? { ...t, status: 'saved' } : t));
    };

    const deleteTopic = async (id: string) => {
        await fetch('/api/trending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
        setTrends(prev => prev.filter(t => t.id !== id));
        setSaved(prev => prev.filter(t => t.id !== id));
    };

    const sourceIcon = (s: string) => ({ reddit: '🔥', google_trends: '📈', ai_predict: '🤖', news: '📰' }[s] || '📊');
    const urgencyColor = (u?: string) => ({ high: '#dc2626', medium: '#d97706', low: '#16a34a' }[u || ''] || 'var(--text-secondary)');
    const intentVariant = (i?: string): 'success' | 'info' | 'warning' => ({ transactional: 'success', commercial: 'warning', informational: 'info' }[i || ''] as 'success' | 'warning' | 'info') || 'info';

    const displayTrends = activeTab === 'saved' ? saved : trends;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Trending Radar</h1>
                        <p className="page-description">Discover trending topics before competitors — Reddit signals + AI prediction</p>
                    </div>
                </div>

                {/* Discovery Controls */}
                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance, home improvement..." onKeyDown={e => e.key === 'Enter' && discover()} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Source</label>
                            <select className="form-select" value={source} onChange={e => setSource(e.target.value as typeof source)}>
                                <option value="all">All Sources</option>
                                <option value="reddit">Reddit</option>
                                <option value="ai_predict">AI Prediction</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Timeframe</label>
                            <select className="form-select" value={timeframe} onChange={e => setTimeframe(e.target.value as typeof timeframe)}>
                                <option value="day">Today</option>
                                <option value="week">This Week</option>
                                <option value="month">This Month</option>
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={discover} disabled={discovering} style={{ marginBottom: 1 }}>
                            {discovering ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Scanning...</> : '🔍 Discover Trends'}
                        </button>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}>Discovered ({trends.length})</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved ({saved.length})</button>
                </div>

                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                        <p className="text-sm text-muted">Loading trends...</p>
                    </div>
                ) : displayTrends.length === 0 ? (
                    <div className="card">
                        <EmptyState icon="📡" title={activeTab === 'saved' ? 'No Saved Topics' : 'No Trends Discovered'}
                            description={activeTab === 'saved' ? 'Save topics from the Discovered tab to track them' : 'Enter your niche and click Discover Trends to find content opportunities'} />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {displayTrends.map(topic => (
                            <div key={topic.id} className="card animate-in" style={{ padding: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.9rem' }}>{sourceIcon(topic.source)}</span>
                                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{topic.title}</span>
                                            {topic.urgency && (
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: urgencyColor(topic.urgency), textTransform: 'uppercase' }}>
                                                    {topic.urgency} urgency
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                            <Badge variant="neutral">Score: {topic.trend_score}</Badge>
                                            {topic.content_type && <Badge variant="info">{topic.content_type}</Badge>}
                                            {topic.search_intent && <Badge variant={intentVariant(topic.search_intent)}>{topic.search_intent}</Badge>}
                                            <Badge variant="neutral">{topic.source}</Badge>
                                        </div>
                                        <div className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                                            <strong>Angle:</strong> {topic.content_angle}
                                        </div>
                                        <div className="text-sm" style={{ color: 'var(--color-primary)' }}>
                                            <strong>Keyword:</strong> {topic.keyword_opportunity}
                                        </div>
                                        {topic.reason && (
                                            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                                💡 {topic.reason}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120 }}>
                                        {topic.status !== 'saved' && (
                                            <button className="btn btn-sm btn-primary" onClick={() => saveTopic(topic.id)}>Save</button>
                                        )}
                                        <a href={`/create?keyword=${encodeURIComponent(topic.keyword_opportunity)}`} className="btn btn-sm btn-success">
                                            Write Post →
                                        </a>
                                        <button className="btn btn-sm btn-danger" onClick={() => deleteTopic(topic.id)}>Dismiss</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
