'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Idea { id: string; title: string; keyword: string; search_volume_estimate: string; search_intent: string; content_type: string; monetization: string; revenue_potential: string; cluster: string; why_now: string; priority_score: number; difficulty: string; status: string; }

const REVENUE_COLORS: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };
const DIFF_COLORS: Record<string, string> = { easy: '#16a34a', medium: '#d97706', hard: '#dc2626' };

export default function IdeaGeneratorPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [niche, setNiche] = useState('');
    const [goal, setGoal] = useState(0);
    const [focus, setFocus] = useState<'affiliate' | 'informational' | 'mixed'>('mixed');
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [generating, setGenerating] = useState(false);
    const [filter, setFilter] = useState<'new' | 'saved' | 'all'>('new');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
        fetchIdeas();
    }, [filter]);

    const fetchIdeas = async () => {
        setLoading(true);
        const res = await fetch(`/api/idea-generator?status=${filter}`);
        const data = await res.json();
        setIdeas(data.ideas || []);
        setLoading(false);
    };

    const generate = async () => {
        setGenerating(true);
        const res = await fetch('/api/idea-generator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', site_id: siteId || undefined, niche: niche || undefined, monthly_revenue_goal: goal || undefined, content_type_focus: focus }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        toast.success(`${data.count} content ideas generated via ${data.provider}`);
        fetchIdeas();
        setGenerating(false);
    };

    const act = async (id: string, action: 'save' | 'dismiss') => {
        await fetch('/api/idea-generator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }) });
        fetchIdeas();
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Idea Generator</h1>
                        <p className="page-description">AI analyzes YOUR site gaps → generates 20 specific, monetizable content ideas</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0, flex: '0 1 250px' }}>
                            <label className="form-label">Site</label>
                            <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                                <option value="">All sites</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Monthly Revenue Goal ($)</label>
                            <input type="number" className="form-input" value={goal || ''} onChange={e => setGoal(parseFloat(e.target.value) || 0)} placeholder="5000" style={{ width: 120 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Focus</label>
                            <select className="form-select" value={focus} onChange={e => setFocus(e.target.value as typeof focus)}>
                                <option value="affiliate">Affiliate</option>
                                <option value="informational">Informational</option>
                                <option value="mixed">Mixed</option>
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={generate} disabled={generating} style={{ marginBottom: 1 }}>{generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : '💡 Generate Ideas'}</button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {(['new', 'saved', 'all'] as const).map(f => <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
                </div>

                {loading ? <div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                    : ideas.length === 0 ? <div className="card"><EmptyState icon="💡" title="No Ideas" description="Select your site and click Generate Ideas to get personalized content suggestions" /></div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {ideas.map(idea => (
                            <div key={idea.id} className="card animate-in" style={{ padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{idea.title}</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                            <Badge variant="neutral">Score: {idea.priority_score}</Badge>
                                            <Badge variant="info">{idea.content_type}</Badge>
                                            <Badge variant={idea.search_intent === 'transactional' ? 'success' : idea.search_intent === 'commercial' ? 'warning' : 'info'}>{idea.search_intent}</Badge>
                                            <span style={{ fontSize: '0.75rem', color: REVENUE_COLORS[idea.revenue_potential], fontWeight: 700 }}>{idea.revenue_potential} revenue</span>
                                            <span style={{ fontSize: '0.75rem', color: DIFF_COLORS[idea.difficulty], fontWeight: 600 }}>{idea.difficulty}</span>
                                            <span className="text-sm text-muted">~{idea.search_volume_estimate}</span>
                                        </div>
                                        <div className="text-sm text-muted"><strong>Keyword:</strong> {idea.keyword}</div>
                                        <div className="text-sm text-muted"><strong>Monetize:</strong> {idea.monetization}</div>
                                        <div className="text-sm text-muted"><strong>Why now:</strong> {idea.why_now}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                                        <a href={`/create?keyword=${encodeURIComponent(idea.keyword)}`} className="btn btn-sm btn-success">Write →</a>
                                        {idea.status !== 'saved' && <button className="btn btn-sm" onClick={() => act(idea.id, 'save')}>Save</button>}
                                        <button className="btn btn-sm btn-danger" onClick={() => act(idea.id, 'dismiss')}>Dismiss</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                }
            </main>
        </div>
    );
}
