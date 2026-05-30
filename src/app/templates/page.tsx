'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Template { id: string; template_name: string; template_type: string; seo_score: number; overall_score: number; word_count_target: number; times_used: number; created_at: string; }
interface Adapted { adapted_title: string; adapted_headings: Array<{ level: number; text: string }>; meta_title: string; meta_description: string; content_notes: string[]; }

export default function TemplatesPage() {
    const toast = useToast();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);
    const [activeTab, setActiveTab] = useState<'templates' | 'apply'>('templates');
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [keyword, setKeyword] = useState('');
    const [newNiche, setNewNiche] = useState('');
    const [adapted, setAdapted] = useState<Adapted | null>(null);
    const [applying, setApplying] = useState(false);
    const [postToSave, setPostToSave] = useState('');
    const [templateType, setTemplateType] = useState<'review' | 'comparison' | 'how_to' | 'listicle' | 'beginner_guide' | 'roundup'>('how_to');
    const [savingFrom, setSavingFrom] = useState('');

    useEffect(() => {
        fetch('/api/templates').then(r => r.json()).then(d => setTemplates(d.templates || []));
        fetch('/api/posts?status=published&limit=50').then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {});
    }, []);

    const saveFromPost = async () => {
        if (!postToSave) { toast.warning('Select a post'); return; }
        setSavingFrom('saving');
        const res = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_from_post', post_id: postToSave, template_type: templateType }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setSavingFrom(''); return; }
        toast.success('Template saved');
        setSavingFrom('');
        fetch('/api/templates').then(r => r.json()).then(d => setTemplates(d.templates || []));
    };

    const apply = async () => {
        if (!selectedTemplate || !keyword) { toast.warning('Select template and keyword'); return; }
        setApplying(true); setAdapted(null);
        const res = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_from_template', id: selectedTemplate, new_keyword: keyword, new_niche: newNiche || undefined }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setApplying(false); return; }
        setAdapted(data.adapted);
        toast.success(`Template adapted via ${data.provider}`);
        setApplying(false);
    };

    const TYPES = ['review', 'comparison', 'how_to', 'listicle', 'news', 'case_study', 'beginner_guide', 'roundup'];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Post Templates</h1>
                        <p className="page-description">Save successful post structures → reuse for new keywords with AI adaptation</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>Template Library ({templates.length})</button>
                    <button className={`tab ${activeTab === 'apply' ? 'active' : ''}`} onClick={() => setActiveTab('apply')}>Apply Template</button>
                </div>

                {activeTab === 'templates' ? (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 className="card-title" style={{ marginBottom: 12 }}>Save Template from Post</h3>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div className="form-group" style={{ margin: 0, flex: '1 1 250px' }}>
                                    <label className="form-label">Source Post</label>
                                    <select className="form-select" value={postToSave} onChange={e => setPostToSave(e.target.value)}>
                                        <option value="">Select high-performing post...</option>
                                        {posts.map(p => <option key={p.id} value={p.id}>{p.title.substring(0, 60)}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Template Type</label>
                                    <select className="form-select" value={templateType} onChange={e => setTemplateType(e.target.value as typeof templateType)}>
                                        {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                    </select>
                                </div>
                                <button className="btn btn-primary" onClick={saveFromPost} disabled={!postToSave || savingFrom === 'saving'} style={{ marginBottom: 1 }}>{savingFrom === 'saving' ? 'Saving...' : 'Save as Template'}</button>
                            </div>
                        </div>

                        {templates.length === 0 ? <div className="card"><EmptyState icon="📋" title="No Templates" description="Save your best-performing posts as templates to reuse their structure" /></div>
                            : <div className="grid-3" style={{ gap: 12 }}>
                                {templates.map(t => (
                                    <div key={t.id} className="card" style={{ padding: 14 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.template_name.substring(0, 40)}</span>
                                            <Badge variant="neutral">{t.template_type}</Badge>
                                        </div>
                                        <div className="grid-2" style={{ gap: 6, marginBottom: 8 }}>
                                            <div className="text-sm text-muted">SEO Score: <strong>{t.seo_score}</strong></div>
                                            <div className="text-sm text-muted">Words: <strong>{t.word_count_target}</strong></div>
                                            <div className="text-sm text-muted">Used: <strong>{t.times_used}×</strong></div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm btn-primary" onClick={() => { setSelectedTemplate(t.id); setActiveTab('apply'); }}>Use Template</button>
                                            <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: t.id }) }); setTemplates(prev => prev.filter(x => x.id !== t.id)); }}>Del</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        }
                    </>
                ) : (
                    <div className="grid-2" style={{ gap: 16 }}>
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Apply Template to New Keyword</h3>
                            <div className="form-group">
                                <label className="form-label">Template *</label>
                                <select className="form-select" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                                    <option value="">Select template...</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.template_name} ({t.template_type})</option>)}
                                </select>
                            </div>
                            <div className="form-group"><label className="form-label">New Target Keyword *</label><input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best protein powder for weight loss" /></div>
                            <div className="form-group"><label className="form-label">Niche</label><input className="form-input" value={newNiche} onChange={e => setNewNiche(e.target.value)} placeholder="fitness" /></div>
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={apply} disabled={applying}>{applying ? 'Adapting...' : 'Adapt Template →'}</button>
                        </div>

                        {adapted ? (
                            <div className="card animate-in">
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 12 }}>{adapted.adapted_title}</div>
                                <div style={{ marginBottom: 10 }}>
                                    <div className="form-label">Meta Title</div><div style={{ background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: 4, fontSize: '0.85rem' }}>{adapted.meta_title}</div>
                                </div>
                                <div style={{ marginBottom: 12 }}>
                                    <div className="form-label">Adapted H2 Structure</div>
                                    {adapted.adapted_headings.filter(h => h.level === 2).map((h, i) => <div key={i} style={{ padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4, fontSize: '0.85rem' }}>H{h.level}: {h.text}</div>)}
                                </div>
                                {adapted.content_notes?.length > 0 && (
                                    <div>
                                        <div className="form-label">Content Tips</div>
                                        {adapted.content_notes.map((n, i) => <div key={i} className="text-sm text-muted" style={{ marginBottom: 3 }}>• {n}</div>)}
                                    </div>
                                )}
                                <a href={`/create?keyword=${encodeURIComponent(keyword)}`} className="btn btn-success" style={{ marginTop: 14, display: 'inline-block' }}>Write Post with This Structure →</a>
                            </div>
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>📋</div>
                                <div>Adapted structure appears here</div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
