'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Optimization { titles: Array<{ title: string; click_bait_score: number }>; description: string; tags: string[]; chapters: Array<{ timestamp: string; title: string }>; end_screen_cta: string; thumbnail_text: string; hashtags: string[]; seo_score: number; estimated_monthly_searches: string; }
interface Saved { id: string; keyword: string; primary_title: string; tag_count: number; niche: string; created_at: string; }

export default function YouTubeSEOPage() {
    const toast = useToast();
    const [keyword, setKeyword] = useState('');
    const [niche, setNiche] = useState('');
    const [duration, setDuration] = useState('10');
    const [style, setStyle] = useState<'educational' | 'review' | 'tutorial' | 'entertaining'>('educational');
    const [scripts, setScripts] = useState<Array<{ id: string; keyword: string; blog_title: string }>>([]);
    const [scriptId, setScriptId] = useState('');
    const [result, setResult] = useState<Optimization | null>(null);
    const [saved, setSaved] = useState<Saved[]>([]);
    const [optimizing, setOptimizing] = useState(false);
    const [activeTab, setActiveTab] = useState<'optimize' | 'saved'>('optimize');
    const [copiedDesc, setCopiedDesc] = useState(false);

    useEffect(() => {
        fetch('/api/video-scripts').then(r => r.json()).then(d => setScripts(d.scripts || []));
        if (activeTab === 'saved') fetch('/api/youtube-seo').then(r => r.json()).then(d => setSaved(d.optimizations || []));
    }, [activeTab]);

    const optimize = async () => {
        if (!keyword && !scriptId) { toast.warning('Enter keyword or select a script'); return; }
        setOptimizing(true); setResult(null);
        const res = await fetch('/api/youtube-seo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: scriptId ? 'from_script' : 'optimize', keyword: keyword || undefined, niche: niche || undefined, script_id: scriptId || undefined, video_duration_minutes: parseInt(duration), channel_style: style }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setOptimizing(false); return; }
        setResult(data.optimization);
        toast.success(`SEO score: ${data.optimization.seo_score}/100 via ${data.provider}`);
        setOptimizing(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">YouTube SEO Optimizer</h1>
                        <p className="page-description">AI-optimize title, description, tags, chapters for maximum YouTube discovery</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'optimize' ? 'active' : ''}`} onClick={() => setActiveTab('optimize')}>Optimize</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>History ({saved.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {saved.length === 0 ? <EmptyState icon="▶️" title="No Optimizations" description="Optimize your first YouTube video" />
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {saved.map(s => (
                                    <div key={s.id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div><div style={{ fontWeight: 700 }}>{s.primary_title.substring(0, 60)}</div><div className="text-sm text-muted">{s.keyword} · {s.tag_count} tags · {new Date(s.created_at).toLocaleDateString()}</div></div>
                                    </div>
                                ))}
                            </div>
                        }
                    </div>
                ) : (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        <div className="card">
                            <div className="form-group">
                                <label className="form-label">Target Keyword</label>
                                <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desks 2025" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">OR From Video Script</label>
                                <select className="form-select" value={scriptId} onChange={e => setScriptId(e.target.value)}>
                                    <option value="">Select script...</option>
                                    {scripts.map(s => <option key={s.id} value={s.id}>{s.blog_title}</option>)}
                                </select>
                            </div>
                            <div className="grid-2" style={{ gap: 10 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche</label>
                                    <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="home office" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Duration (min)</label>
                                    <input type="number" className="form-input" value={duration} onChange={e => setDuration(e.target.value)} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Channel Style</label>
                                    <select className="form-select" value={style} onChange={e => setStyle(e.target.value as typeof style)}>
                                        {['educational', 'review', 'tutorial', 'entertaining'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={optimize} disabled={optimizing}>{optimizing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Optimizing...</> : '▶️ Optimize for YouTube'}</button>
                        </div>

                        {result ? (
                            <div className="card animate-in">
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <Badge variant={result.seo_score >= 80 ? 'success' : 'warning'}>SEO: {result.seo_score}/100</Badge>
                                    <Badge variant="neutral">{result.estimated_monthly_searches} searches/mo</Badge>
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Title Options</div>
                                    {result.titles?.map((t, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: i === 0 ? '#f0fdf4' : 'var(--bg-secondary)', borderRadius: 6, marginBottom: 4 }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: i === 0 ? 700 : 400 }}>{t.title}</span>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <span className="text-sm text-muted">{t.title.length}ch</span>
                                                <button className="btn btn-sm" style={{ padding: '1px 6px' }} onClick={() => { navigator.clipboard.writeText(t.title); toast.success('Copied'); }}>Copy</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <div style={{ fontWeight: 700 }}>Description</div>
                                        <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(result.description); setCopiedDesc(true); toast.success('Copied'); setTimeout(() => setCopiedDesc(false), 2000); }}>{copiedDesc ? 'Copied!' : 'Copy'}</button>
                                    </div>
                                    <textarea className="form-input" rows={8} readOnly value={result.description} style={{ fontSize: '0.8rem', fontFamily: 'inherit' }} />
                                </div>

                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Tags ({result.tags?.length})</div>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {result.tags?.map((t, i) => <span key={i} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem' }}>{t}</span>)}
                                    </div>
                                </div>

                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Thumbnail Text</div>
                                    <div style={{ background: '#1a1a2e', color: '#fff', padding: '10px 14px', borderRadius: 6, fontWeight: 900, fontSize: '1.2rem', textAlign: 'center' }}>{result.thumbnail_text}</div>
                                </div>

                                {result.chapters?.length > 0 && (
                                    <div>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Chapters</div>
                                        {result.chapters.map((c, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}><code>{c.timestamp}</code> {c.title}</div>)}
                                    </div>
                                )}
                            </div>
                        ) : !optimizing ? (
                            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>▶️</div>
                                <div style={{ fontWeight: 600 }}>YouTube optimization appears here</div>
                            </div>
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} /><div style={{ fontWeight: 600 }}>Optimizing for YouTube...</div></div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
