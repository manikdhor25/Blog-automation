'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ScriptRecord { id: string; blog_title: string; keyword: string; format: string; video_title: string; word_count: number; created_at: string; }
interface ScriptData { video_title: string; video_description: string; tags: string[]; thumbnail_text: string; script: string; hook: string; cta: string; estimated_duration: string; word_count: number; sections: Array<{ title: string; duration_seconds: number; content: string }>; }

const FORMATS = [
    { id: 'youtube_long', label: 'YouTube (Long)', icon: '▶️', desc: '8-15 min' },
    { id: 'youtube_short', label: 'YouTube Shorts', icon: '📱', desc: '60 sec' },
    { id: 'podcast', label: 'Podcast', icon: '🎙️', desc: '20-30 min' },
    { id: 'tiktok', label: 'TikTok', icon: '🎵', desc: '30-60 sec' },
    { id: 'reel', label: 'Reel', icon: '🎬', desc: '30-60 sec' },
];

export default function VideoScriptsPage() {
    const toast = useToast();
    const [scripts, setScripts] = useState<ScriptRecord[]>([]);
    const [activeTab, setActiveTab] = useState<'generate' | 'saved'>('generate');
    const [form, setForm] = useState({ blog_title: '', keyword: '', niche: '', format: 'youtube_long', channel_style: 'educational' });
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<ScriptData | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => { if (activeTab === 'saved') fetch('/api/video-scripts').then(r => r.json()).then(d => setScripts(d.scripts || [])); }, [activeTab]);

    const generate = async () => {
        if (!form.blog_title && !form.keyword) { toast.warning('Title or keyword required'); return; }
        setGenerating(true); setResult(null);
        const res = await fetch('/api/video-scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', ...form }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setResult(data.script);
        toast.success(`Script generated via ${data.provider}`);
        setGenerating(false);
    };

    const copyScript = () => {
        if (!result) return;
        navigator.clipboard.writeText(result.script);
        setCopied(true);
        toast.success('Script copied');
        setTimeout(() => setCopied(false), 2000);
    };

    const formatLabel = (f: string) => FORMATS.find(x => x.id === f)?.label || f;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Video Script Generator</h1>
                        <p className="page-description">Blog post → YouTube, Shorts, Podcast, TikTok, Reels script</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>Generate</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved ({scripts.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {scripts.length === 0 ? <EmptyState icon="🎬" title="No Scripts" description="Generate your first video script" /> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {scripts.map(s => (
                                    <div key={s.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{s.video_title}</div>
                                            <div className="text-sm text-muted">{s.keyword} · {formatLabel(s.format)} · {s.word_count} words · {new Date(s.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/video-scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: s.id }) }); setScripts(prev => prev.filter(x => x.id !== s.id)); }}>Del</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Script Settings</h3>
                            <div className="form-group">
                                <label className="form-label">Blog Post Title</label>
                                <input className="form-input" value={form.blog_title} onChange={e => setForm(f => ({ ...f, blog_title: e.target.value }))} placeholder="10 Best Standing Desks for Home Office" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Target Keyword</label>
                                <input className="form-input" value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} placeholder="best standing desks" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} placeholder="home office, productivity" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Format</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {FORMATS.map(f => (
                                        <button key={f.id} className={`btn btn-sm ${form.format === f.id ? 'btn-primary' : ''}`} style={{ textAlign: 'left', padding: '8px 10px', height: 'auto' }} onClick={() => setForm(prev => ({ ...prev, format: f.id }))}>
                                            <div>{f.icon} {f.label}</div>
                                            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{f.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Channel Style</label>
                                <select className="form-select" value={form.channel_style} onChange={e => setForm(f => ({ ...f, channel_style: e.target.value }))}>
                                    {['educational', 'entertaining', 'review', 'tutorial', 'listicle'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={generate} disabled={generating}>
                                {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating script...</> : '🎬 Generate Script'}
                            </button>
                        </div>

                        <div>
                            {generating && <div className="card" style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} /><div style={{ fontWeight: 600 }}>Writing script...</div></div>}
                            {result && !generating && (
                                <div className="card animate-in">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{result.video_title}</div>
                                            <div className="text-sm text-muted">{result.estimated_duration} · {result.word_count} words</div>
                                        </div>
                                        <button className="btn btn-sm" onClick={copyScript}>{copied ? 'Copied!' : 'Copy Script'}</button>
                                    </div>

                                    {result.thumbnail_text && (
                                        <div style={{ background: '#1a1a2e', color: '#fff', padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' }}>
                                            THUMBNAIL: {result.thumbnail_text}
                                        </div>
                                    )}

                                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 4, color: '#166534' }}>🎣 Hook (first line)</div>
                                        <div className="text-sm">{result.hook}</div>
                                    </div>

                                    {result.tags?.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Tags</div>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {result.tags.map((t, i) => <span key={i} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem' }}>#{t}</span>)}
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <div className="form-label">Full Script</div>
                                        <textarea className="form-input" rows={16} readOnly value={result.script} style={{ fontFamily: 'inherit', fontSize: '0.85rem' }} />
                                    </div>
                                </div>
                            )}
                            {!result && !generating && (
                                <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎬</div>
                                    <div style={{ fontWeight: 600 }}>Script appears here</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
