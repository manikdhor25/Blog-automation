'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Translation { id: string; source_post_id: string | null; target_language: string; action_type: string; title: string; word_count: number; created_at: string; }
interface GeneratedContent { title: string; content: string; meta_title: string; meta_description: string; hreflang_tag: string; slug_suggestion: string; }

const LANG_NAMES: Record<string, string> = { es: '🇪🇸 Spanish', de: '🇩🇪 German', fr: '🇫🇷 French', pt: '🇧🇷 Portuguese', it: '🇮🇹 Italian', nl: '🇳🇱 Dutch', pl: '🇵🇱 Polish', ja: '🇯🇵 Japanese', zh: '🇨🇳 Chinese', hi: '🇮🇳 Hindi', ar: '🇸🇦 Arabic' };

export default function MultilangPage() {
    const toast = useToast();
    const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [result, setResult] = useState<GeneratedContent | null>(null);
    const [hreflangTags, setHreflangTags] = useState('');
    const [generating, setGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState<'generate' | 'hreflang' | 'saved'>('generate');
    const [form, setForm] = useState({ post_id: '', target_language: 'es', action: 'translate' as 'translate' | 'generate_native', keyword: '', niche: '' });

    useEffect(() => {
        fetch('/api/posts?status=published&limit=50').then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {});
        if (activeTab === 'saved') fetch('/api/multilang').then(r => r.json()).then(d => setTranslations(d.translations || []));
    }, [activeTab]);

    const generate = async () => {
        if (!form.post_id && !form.keyword) { toast.warning('Select a post or enter a keyword'); return; }
        setGenerating(true); setResult(null);
        const res = await fetch('/api/multilang', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: form.action, post_id: form.post_id || undefined, target_language: form.target_language, keyword: form.keyword || undefined, niche: form.niche || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setResult(data.content);
        toast.success(`Generated ${data.language} content via ${data.provider}`);
        setGenerating(false);
    };

    const getHreflang = async () => {
        if (!form.post_id) { toast.warning('Select a post'); return; }
        const res = await fetch('/api/multilang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_hreflang', post_id: form.post_id }) });
        const data = await res.json();
        setHreflangTags(data.hreflang_tags);
        toast.success(`Generated hreflang for ${data.language_count} languages`);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Multi-Language Content</h1>
                        <p className="page-description">Translate + localize posts or generate native content in 11 languages with hreflang</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>Generate / Translate</button>
                    <button className={`tab ${activeTab === 'hreflang' ? 'active' : ''}`} onClick={() => setActiveTab('hreflang')}>Hreflang Builder</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved ({translations.length})</button>
                </div>

                {activeTab === 'hreflang' ? (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Generate Hreflang Tags</h3>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                            <select className="form-select" value={form.post_id} onChange={e => setForm(f => ({ ...f, post_id: e.target.value }))} style={{ flex: 1 }}>
                                <option value="">Select post...</option>
                                {posts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={getHreflang} disabled={!form.post_id}>Generate Tags</button>
                        </div>
                        {hreflangTags && (
                            <>
                                <textarea className="form-input" rows={8} readOnly value={hreflangTags} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(hreflangTags); toast.success('Copied'); }}>Copy Tags</button>
                                    <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>Paste inside &lt;head&gt; on each language version</span>
                                </div>
                            </>
                        )}
                    </div>
                ) : activeTab === 'saved' ? (
                    <div className="card">
                        {translations.length === 0 ? <EmptyState icon="🌍" title="No Translations" description="Generate your first translation to see it here" />
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {translations.map(t => (
                                    <div key={t.id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{t.title.substring(0, 60)}</div>
                                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                                <Badge variant="info">{LANG_NAMES[t.target_language] || t.target_language}</Badge>
                                                <Badge variant="neutral">{t.action_type}</Badge>
                                                <span className="text-sm text-muted">{t.word_count} words · {new Date(t.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/multilang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: t.id }) }); setTranslations(prev => prev.filter(x => x.id !== t.id)); }}>Del</button>
                                    </div>
                                ))}
                            </div>
                        }
                    </div>
                ) : (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        <div className="card">
                            <div className="form-group">
                                <label className="form-label">Source Post</label>
                                <select className="form-select" value={form.post_id} onChange={e => setForm(f => ({ ...f, post_id: e.target.value }))}>
                                    <option value="">Select post (or use keyword below)</option>
                                    {posts.map(p => <option key={p.id} value={p.id}>{p.title.substring(0, 60)}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">OR Keyword <span className="text-muted text-sm">(for native generation)</span></label>
                                <input className="form-input" value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} placeholder="best standing desks" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} placeholder="home office" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Target Language</label>
                                <select className="form-select" value={form.target_language} onChange={e => setForm(f => ({ ...f, target_language: e.target.value }))}>
                                    {Object.entries(LANG_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Mode</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className={`btn btn-sm ${form.action === 'translate' ? 'btn-primary' : ''}`} onClick={() => setForm(f => ({ ...f, action: 'translate' }))}>Translate & Localize</button>
                                    <button className={`btn btn-sm ${form.action === 'generate_native' ? 'btn-primary' : ''}`} onClick={() => setForm(f => ({ ...f, action: 'generate_native' }))}>Generate Native</button>
                                </div>
                                <div className="text-sm text-muted" style={{ marginTop: 6 }}>
                                    {form.action === 'translate' ? 'Translates your post with cultural localization' : 'Writes fresh content as a native speaker would'}
                                </div>
                            </div>
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={generate} disabled={generating}>
                                {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating {LANG_NAMES[form.target_language]}...</> : `🌍 Generate ${LANG_NAMES[form.target_language]}`}
                            </button>
                        </div>

                        <div>
                            {result && !generating && (
                                <div className="card animate-in">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <div style={{ fontWeight: 700 }}>{result.title}</div>
                                        <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(result.content); toast.success('Content copied'); }}>Copy</button>
                                    </div>
                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
                                        <div className="text-sm text-muted">Meta: {result.meta_title}</div>
                                        <div className="text-sm text-muted">Slug: /{result.slug_suggestion}/</div>
                                    </div>
                                    <textarea className="form-input" rows={14} readOnly value={result.content} style={{ fontFamily: 'inherit', fontSize: '0.88rem' }} />
                                    {result.hreflang_tag && (
                                        <div style={{ marginTop: 10 }}>
                                            <div className="form-label">Hreflang Tag</div>
                                            <code style={{ fontSize: '0.8rem', display: 'block', background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: 4 }}>{result.hreflang_tag}</code>
                                        </div>
                                    )}
                                </div>
                            )}
                            {!result && !generating && <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: '3rem', marginBottom: 16 }}>🌍</div><div style={{ fontWeight: 600 }}>Translation appears here</div></div>}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
