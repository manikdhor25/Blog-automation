'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface SocialPost {
    id: string;
    platform: string;
    url: string;
    title: string;
    snippet: string;
    author: string;
    upvotes: number;
    comments: number;
    posted_at: string;
    opportunity_type: 'question' | 'complaint' | 'recommendation_request' | 'discussion' | 'trend';
    content_angle: string;
    affiliate_potential: 'high' | 'medium' | 'low';
    trending_score: number;
}

interface ListeningResult {
    keyword: string;
    total_found: number;
    posts: SocialPost[];
    top_pain_points: string[];
    content_ideas: string[];
    trending_topics: string[];
    provider: string;
}

const OPPORTUNITY_ICONS: Record<string, string> = {
    question: '❓', complaint: '😤', recommendation_request: '🙋', discussion: '💬', trend: '📈'
};
const AFFILIATE_COLOR: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };

export default function SocialListeningPage() {
    const toast = useToast();
    const [keyword, setKeyword] = useState('');
    const [niche, setNiche] = useState('');
    const [platform, setPlatform] = useState('reddit');
    const [result, setResult] = useState<ListeningResult | null>(null);
    const [fetching, setFetching] = useState(false);
    const [filterType, setFilterType] = useState('all');

    const search = async () => {
        if (!keyword) { toast.warning('Enter keyword or topic'); return; }
        setFetching(true);
        const res = await fetch('/api/social-listening', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, niche: niche || undefined, platform }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setFetching(false); return; }
        setResult(data.result);
        toast.success(`Found ${data.result.total_found} posts via ${data.result.provider}`);
        setFetching(false);
    };

    const filtered = result?.posts.filter(p => filterType === 'all' || p.opportunity_type === filterType) || [];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Social Listening Monitor</h1>
                        <p className="page-description">Reddit/forums → pain points → content angles → affiliate opportunities</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desk, protein powder, etc." style={{ flex: 2, minWidth: 200 }} onKeyDown={e => e.key === 'Enter' && search()} />
                        <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="Niche (optional)" style={{ flex: 1, minWidth: 120 }} />
                        <select className="form-input" value={platform} onChange={e => setPlatform(e.target.value)} style={{ flex: '0 0 120px' }}>
                            <option value="reddit">Reddit</option>
                            <option value="quora">Quora</option>
                            <option value="all">All platforms</option>
                        </select>
                        <button className="btn btn-primary" onClick={search} disabled={fetching}>{fetching ? 'Listening...' : '📡 Listen'}</button>
                    </div>
                </div>

                {result && (
                    <>
                        <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'Posts Found', value: result.total_found, icon: '📊' },
                                { label: 'High Affiliate', value: result.posts.filter(p => p.affiliate_potential === 'high').length, icon: '💰' },
                                { label: 'Content Ideas', value: result.content_ideas.length, icon: '💡' },
                                { label: 'Pain Points', value: result.top_pain_points.length, icon: '😤' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                    <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10 }}>🔥 Content Ideas</h3>
                                {result.content_ideas.map((idea, i) => (
                                    <div key={i} style={{ padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 6 }}>
                                        <div className="text-sm">💡 {idea}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 10 }}>😤 Top Pain Points</h3>
                                {result.top_pain_points.map((pain, i) => (
                                    <div key={i} className="text-sm" style={{ marginBottom: 6, padding: '6px 8px', background: '#fef2f2', borderRadius: 4, color: '#991b1b' }}>• {pain}</div>
                                ))}
                                {result.trending_topics.length > 0 && (
                                    <>
                                        <div style={{ fontWeight: 700, marginTop: 12, marginBottom: 8 }}>📈 Trending Topics</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {result.trending_topics.map((t, i) => (
                                                <span key={i} style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 10, fontSize: '0.8rem' }}>{t}</span>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                            {['all', 'question', 'complaint', 'recommendation_request', 'discussion', 'trend'].map(type => (
                                <button key={type} className={`btn btn-sm ${filterType === type ? 'btn-primary' : ''}`} onClick={() => setFilterType(type)}>
                                    {type === 'all' ? 'All' : `${OPPORTUNITY_ICONS[type]} ${type.replace('_', ' ')}`}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {filtered.map((post, i) => (
                                <div key={i} className="card" style={{ padding: '12px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span>{OPPORTUNITY_ICONS[post.opportunity_type]}</span>
                                            <Badge variant="neutral">{post.platform}</Badge>
                                            <span style={{ fontSize: '0.75rem', color: AFFILIATE_COLOR[post.affiliate_potential], fontWeight: 700 }}>{post.affiliate_potential} affiliate</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Score: {post.trending_score}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            <span>▲ {post.upvotes}</span>
                                            <span>💬 {post.comments}</span>
                                        </div>
                                    </div>
                                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                                        <a href={post.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{post.title}</a>
                                    </div>
                                    <div className="text-sm text-muted" style={{ marginBottom: 6 }}>{post.snippet}</div>
                                    <div style={{ padding: '6px 8px', background: '#f0fdf4', borderRadius: 4 }}>
                                        <div className="text-sm" style={{ color: '#166534' }}>📝 Content angle: {post.content_angle}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {filtered.length === 0 && <EmptyState icon="📡" title="No posts match filter" description="Try a different filter type" />}
                    </>
                )}

                {!result && !fetching && (
                    <EmptyState icon="📡" title="Enter keyword to start listening" description="Finds Reddit discussions, questions, and pain points to turn into content and affiliate opportunities" />
                )}
            </main>
        </div>
    );
}
