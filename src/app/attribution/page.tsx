'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import DataTable from '@/components/DataTable';

interface FunnelRow {
    post_id: string;
    post_title: string;
    keyword: string | null;
    search_volume: number;
    intent: string | null;
    seo_score: number;
    overall_score: number;
    status: string;
    affiliate_clicks: number;
    conversions: number;
    est_revenue: number;
    published_at: string | null;
}

interface Summary {
    total_posts_with_keywords: number;
    total_affiliate_clicks: number;
    total_revenue: number;
    top_earning_post: FunnelRow | null;
    avg_clicks_per_post: number;
}

export default function AttributionPage() {
    const [funnel, setFunnel] = useState<FunnelRow[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'funnel' | 'keywords'>('funnel');
    const [topKeywords, setTopKeywords] = useState<Array<{ keyword: string; volume: number; clicks: number; conversions: number }>>([]);

    useEffect(() => {
        fetchFunnel();
        fetchTopKeywords();
    }, []);

    const fetchFunnel = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/attribution?view=funnel');
            const data = await res.json();
            setFunnel(data.funnel || []);
            setSummary(data.summary || null);
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    const fetchTopKeywords = async () => {
        const res = await fetch('/api/attribution?view=top_keywords');
        const data = await res.json();
        setTopKeywords(data.top_keywords || []);
    };

    const intentColors: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
        transactional: 'success', commercial: 'warning', informational: 'info', navigational: 'danger',
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Revenue Attribution</h1>
                        <p className="page-description">Full funnel: keyword → post → affiliate clicks → revenue</p>
                    </div>
                    <button className="btn btn-sm" onClick={fetchFunnel}>Refresh</button>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                        {[
                            { label: 'Monetized Posts', value: summary.total_posts_with_keywords, icon: '📝' },
                            { label: 'Total Affiliate Clicks', value: summary.total_affiliate_clicks.toLocaleString(), icon: '👆' },
                            { label: 'Total Revenue', value: `$${summary.total_revenue.toFixed(2)}`, icon: '💰' },
                            { label: 'Avg Clicks/Post', value: summary.avg_clicks_per_post, icon: '📊' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {summary?.top_earning_post && (
                    <div className="card" style={{ marginBottom: 24, background: '#f0fdf4', border: '1px solid #86efac' }}>
                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>🏆 Top Performer: {summary.top_earning_post.post_title}</div>
                        <div className="text-sm" style={{ color: '#15803d' }}>
                            Keyword: <strong>{summary.top_earning_post.keyword}</strong> ·
                            {summary.top_earning_post.affiliate_clicks} clicks ·
                            {summary.top_earning_post.conversions} conversions ·
                            ${summary.top_earning_post.est_revenue.toFixed(2)} est. revenue
                        </div>
                    </div>
                )}

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'funnel' ? 'active' : ''}`} onClick={() => setActiveTab('funnel')}>Attribution Funnel</button>
                    <button className={`tab ${activeTab === 'keywords' ? 'active' : ''}`} onClick={() => setActiveTab('keywords')}>Top Keywords</button>
                </div>

                <div className="card">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                            <p className="text-sm text-muted">Building attribution funnel...</p>
                        </div>
                    ) : activeTab === 'funnel' ? (
                        funnel.length === 0 ? (
                            <EmptyState icon="🔗" title="No Attribution Data"
                                description="Publish posts with keywords and add affiliate links to see full-funnel attribution" />
                        ) : (
                            <DataTable
                                data={funnel as unknown as Record<string, unknown>[]}
                                searchKeys={['post_title', 'keyword']}
                                pageSize={25}
                                columns={[
                                    { key: 'post_title', label: 'Post', render: (r) => <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{String(r.post_title).substring(0, 50)}</span> },
                                    { key: 'keyword', label: 'Keyword', render: (r) => r.keyword ? <span className="text-sm">{String(r.keyword)}</span> : <span className="text-muted text-sm">—</span> },
                                    { key: 'search_volume', label: 'Vol', render: (r) => <span className="font-mono text-sm">{Number(r.search_volume).toLocaleString()}</span> },
                                    { key: 'intent', label: 'Intent', render: (r) => r.intent ? <Badge variant={intentColors[String(r.intent)] || 'info'}>{String(r.intent).substring(0, 3)}</Badge> : null },
                                    { key: 'overall_score', label: 'Score', render: (r) => <span className={`font-mono text-sm ${Number(r.overall_score) >= 80 ? 'text-success' : ''}`}>{Number(r.overall_score)}</span> },
                                    { key: 'affiliate_clicks', label: 'Clicks', render: (r) => <span className="font-mono" style={{ fontWeight: 700 }}>{Number(r.affiliate_clicks).toLocaleString()}</span> },
                                    { key: 'conversions', label: 'Conv', render: (r) => <span className="font-mono">{Number(r.conversions)}</span> },
                                    { key: 'est_revenue', label: 'Est. Revenue', render: (r) => <span className="font-mono" style={{ color: Number(r.est_revenue) > 0 ? '#16a34a' : undefined, fontWeight: 600 }}>${Number(r.est_revenue).toFixed(2)}</span> },
                                    { key: 'status', label: 'Status', render: (r) => <Badge variant={String(r.status) === 'published' ? 'success' : 'info'}>{String(r.status)}</Badge> },
                                ]}
                            />
                        )
                    ) : (
                        topKeywords.length === 0 ? (
                            <EmptyState icon="🔑" title="No Keyword Data" description="Keyword attribution data will appear after affiliate clicks are tracked" />
                        ) : (
                            <DataTable
                                data={topKeywords as unknown as Record<string, unknown>[]}
                                searchKeys={['keyword']}
                                pageSize={25}
                                columns={[
                                    { key: 'keyword', label: 'Keyword', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.keyword)}</span> },
                                    { key: 'volume', label: 'Search Volume', render: (r) => <span className="font-mono">{Number(r.volume).toLocaleString()}</span> },
                                    { key: 'clicks', label: 'Affiliate Clicks', render: (r) => <span className="font-mono" style={{ fontWeight: 700 }}>{Number(r.clicks).toLocaleString()}</span> },
                                    { key: 'conversions', label: 'Conversions', render: (r) => <span className="font-mono">{Number(r.conversions)}</span> },
                                    { key: 'cpc', label: 'CPC', render: (r) => <span className="font-mono">${Number(r.cpc).toFixed(2)}</span> },
                                ]}
                            />
                        )
                    )}
                </div>
            </main>
        </div>
    );
}
