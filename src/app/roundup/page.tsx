'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Expert { name: string; title: string; website: string; email?: string; twitter?: string; answer?: string; status: 'pending' | 'contacted' | 'responded' | 'declined'; }
interface Roundup { id: string; topic: string; question: string; target_expert_count: number; experts: Expert[]; generated_post?: string; status: 'planning' | 'outreach' | 'collecting' | 'writing' | 'published'; created_at: string; }

export default function RoundupPage() {
    const toast = useToast();
    const [roundups, setRoundups] = useState<Roundup[]>([]);
    const [topic, setTopic] = useState('');
    const [question, setQuestion] = useState('');
    const [expertCount, setExpertCount] = useState('10');
    const [niche, setNiche] = useState('');
    const [selectedRoundup, setSelectedRoundup] = useState<Roundup | null>(null);
    const [generatingPost, setGeneratingPost] = useState(false);
    const [creating, setCreating] = useState(false);
    const [tab, setTab] = useState<'list' | 'create'>('list');

    useEffect(() => { loadRoundups(); }, []);

    const loadRoundups = async () => {
        const res = await fetch('/api/roundup');
        const data = await res.json();
        setRoundups(data.roundups || []);
    };

    const createRoundup = async () => {
        if (!topic || !question) { toast.warning('Topic and question required'); return; }
        setCreating(true);
        const res = await fetch('/api/roundup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', topic, question, expert_count: parseInt(expertCount), niche: niche || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setCreating(false); return; }
        toast.success(`Roundup created with ${data.roundup.experts.length} expert suggestions`);
        setTopic(''); setQuestion(''); setNiche('');
        loadRoundups();
        setTab('list');
        setCreating(false);
    };

    const generatePost = async (id: string) => {
        setGeneratingPost(true);
        const res = await fetch('/api/roundup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_post', roundup_id: id }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success('Post generated!');
            loadRoundups();
        }
        setGeneratingPost(false);
    };

    const updateExpert = async (roundupId: string, expertIndex: number, field: string, value: string) => {
        await fetch('/api/roundup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_expert', roundup_id: roundupId, expert_index: expertIndex, field, value }),
        });
        loadRoundups();
    };

    const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
        planning: 'info', outreach: 'warning', collecting: 'warning', writing: 'info', published: 'success'
    };
    const EXPERT_STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
        pending: 'neutral', contacted: 'warning', responded: 'success', declined: 'danger'
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Expert Roundup Manager</h1>
                        <p className="page-description">Create expert roundups → auto-find contributors → track responses → generate post</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['list', 'create'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t === 'create' ? '+ Create' : 'Roundups'}</button>
                        ))}
                    </div>
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>New Expert Roundup</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Topic *</label>
                                <input className="form-input" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Best tools for content marketing in 2025" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="digital marketing" />
                            </div>
                            <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                <label className="form-label">Question to ask experts *</label>
                                <textarea className="form-input" rows={2} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What is your #1 recommended tool for content marketing and why?" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Target number of experts</label>
                                <select className="form-input" value={expertCount} onChange={e => setExpertCount(e.target.value)}>
                                    {['5', '10', '15', '20', '25'].map(n => <option key={n} value={n}>{n} experts</option>)}
                                </select>
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={createRoundup} disabled={creating}>
                            {creating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Creating...</> : '🎯 Create Roundup & Find Experts'}
                        </button>
                    </div>
                )}

                {tab === 'list' && (
                    <>
                        {roundups.length === 0 ? (
                            <EmptyState icon="🎯" title="No roundups yet" description="Create a roundup to start collecting expert quotes for link-worthy content" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {roundups.map((r, i) => (
                                    <div key={i} className="card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.topic}</div>
                                                <div className="text-sm text-muted" style={{ fontStyle: 'italic', marginBottom: 6 }}>"{r.question}"</div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                                                    <span className="text-sm text-muted">
                                                        {r.experts.filter(e => e.status === 'responded').length}/{r.experts.length} responded
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                <button className="btn btn-sm" onClick={() => setSelectedRoundup(selectedRoundup?.id === r.id ? null : r)}>
                                                    {selectedRoundup?.id === r.id ? 'Hide' : 'Manage'}
                                                </button>
                                                {r.experts.filter(e => e.status === 'responded').length >= 3 && !r.generated_post && (
                                                    <button className="btn btn-sm btn-primary" onClick={() => generatePost(r.id)} disabled={generatingPost}>
                                                        {generatingPost ? 'Writing...' : '✍️ Generate Post'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Progress bar */}
                                        <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', background: 'var(--accent-primary)', width: `${(r.experts.filter(e => e.status === 'responded').length / r.experts.length) * 100}%`, transition: 'width 0.3s' }} />
                                        </div>

                                        {selectedRoundup?.id === r.id && (
                                            <div style={{ marginTop: 12 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {r.experts.map((expert, ei) => (
                                                        <div key={ei} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expert.status === 'responded' ? 6 : 0 }}>
                                                                <div>
                                                                    <span style={{ fontWeight: 600 }}>{expert.name}</span>
                                                                    <span className="text-sm text-muted" style={{ marginLeft: 6 }}>{expert.title}</span>
                                                                    {expert.website && <span className="text-sm text-muted" style={{ marginLeft: 6 }}>· {expert.website}</span>}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                                    <Badge variant={EXPERT_STATUS_VARIANT[expert.status]}>{expert.status}</Badge>
                                                                    {expert.status !== 'responded' && expert.status !== 'declined' && (
                                                                        <button className="btn btn-sm" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                                                            onClick={() => updateExpert(r.id, ei, 'status', expert.status === 'pending' ? 'contacted' : 'responded')}>
                                                                            {expert.status === 'pending' ? 'Mark Contacted' : 'Mark Responded'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {expert.answer && (
                                                                <div className="text-sm" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>"{expert.answer.substring(0, 150)}..."</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {r.generated_post && (
                                                    <div style={{ marginTop: 12 }}>
                                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Generated Post Preview</div>
                                                        <textarea className="form-input" rows={8} defaultValue={r.generated_post} style={{ fontFamily: 'inherit' }} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
