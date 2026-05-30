'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface GeneratedImage {
    id: string;
    title: string;
    prompt: string;
    style: string;
    format: string;
    provider: string;
    image_url: string;
    size: string;
    created_at: string;
}

export default function ImageGenPage() {
    const toast = useToast();
    const [images, setImages] = useState<GeneratedImage[]>([]);
    const [generating, setGenerating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'generate' | 'gallery'>('generate');
    const [form, setForm] = useState({
        title: '',
        keyword: '',
        style: 'realistic',
        format: 'featured',
        provider: 'dall-e-3',
        custom_prompt: '',
    });
    const [generatedImage, setGeneratedImage] = useState<{ image_url: string; alt_text: string; prompt: string; provider: string; size: string } | null>(null);
    const [copiedAlt, setCopiedAlt] = useState(false);

    useEffect(() => { fetchImages(); }, []);

    const fetchImages = async () => {
        setLoading(true);
        const res = await fetch('/api/ai/generate-image');
        const data = await res.json();
        setImages(data.images || []);
        setLoading(false);
    };

    const generate = async () => {
        if (!form.title && !form.keyword && !form.custom_prompt) {
            toast.warning('Enter title, keyword, or custom prompt');
            return;
        }
        setGenerating(true);
        setGeneratedImage(null);
        try {
            const res = await fetch('/api/ai/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate', ...form, prompt: form.custom_prompt || undefined }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Generation failed'); return; }
            setGeneratedImage(data);
            toast.success(`Image generated via ${data.provider}`);
            fetchImages();
        } catch { toast.error('Generation failed'); }
        finally { setGenerating(false); }
    };

    const copyAlt = () => {
        if (!generatedImage?.alt_text) return;
        navigator.clipboard.writeText(generatedImage.alt_text);
        setCopiedAlt(true);
        toast.success('Alt text copied');
        setTimeout(() => setCopiedAlt(false), 2000);
    };

    const downloadImage = (url: string, name: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.png';
        a.target = '_blank';
        a.click();
    };

    const deleteImage = async (id: string) => {
        await fetch('/api/ai/generate-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
        setImages(prev => prev.filter(i => i.id !== id));
        toast.success('Deleted');
    };

    const styles = ['realistic', 'illustration', 'minimalist', 'infographic', 'pinterest', 'product'];
    const formats = [
        { id: 'featured', label: 'Featured Image', desc: '16:9 • Blog header' },
        { id: 'pinterest', label: 'Pinterest Pin', desc: '2:3 • Vertical' },
        { id: 'square', label: 'Square', desc: '1:1 • Instagram' },
        { id: 'wide', label: 'Wide Hero', desc: '16:9 • Landing page' },
    ];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">AI Image Generator</h1>
                        <p className="page-description">Generate featured images, Pinterest pins, and product shots with DALL-E 3</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>Generate</button>
                    <button className={`tab ${activeTab === 'gallery' ? 'active' : ''}`} onClick={() => setActiveTab('gallery')}>Gallery ({images.length})</button>
                </div>

                {activeTab === 'gallery' ? (
                    <div>
                        {loading ? (
                            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                                <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
                            </div>
                        ) : images.length === 0 ? (
                            <div className="card">
                                <EmptyState icon="🖼️" title="No Images Yet" description="Generate your first image to see it here" />
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                                {images.map(img => (
                                    <div key={img.id} className="card" style={{ padding: 12 }}>
                                        <img src={img.image_url} alt={img.title} style={{ width: '100%', borderRadius: 6, marginBottom: 10, objectFit: 'cover', maxHeight: 200 }}
                                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.title}</div>
                                        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                                            <Badge variant="info">{img.style}</Badge>
                                            <Badge variant="neutral">{img.format}</Badge>
                                            <Badge variant="neutral">{img.provider}</Badge>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm" onClick={() => downloadImage(img.image_url, img.title)}>Download</button>
                                            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(img.image_url); toast.success('URL copied'); }}>Copy URL</button>
                                            <button className="btn btn-sm btn-danger" onClick={() => deleteImage(img.id)}>Del</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        {/* Config */}
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Image Settings</h3>

                            <div className="form-group">
                                <label className="form-label">Blog Post Title</label>
                                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="10 Best Standing Desks for Home Office 2025" />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Target Keyword</label>
                                <input className="form-input" value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} placeholder="best standing desks" />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Format</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {formats.map(f => (
                                        <button key={f.id}
                                            className={`btn btn-sm ${form.format === f.id ? 'btn-primary' : ''}`}
                                            style={{ textAlign: 'left', padding: '8px 12px', height: 'auto' }}
                                            onClick={() => setForm(prev => ({ ...prev, format: f.id }))}>
                                            <div style={{ fontWeight: 600 }}>{f.label}</div>
                                            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{f.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Style</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {styles.map(s => (
                                        <button key={s} className={`btn btn-sm ${form.style === s ? 'btn-primary' : ''}`}
                                            onClick={() => setForm(f => ({ ...f, style: s }))}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Provider</label>
                                <select className="form-select" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}>
                                    <option value="dall-e-3">DALL-E 3 (Best quality)</option>
                                    <option value="dall-e-2">DALL-E 2 (Faster)</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Custom Prompt Override <span className="text-muted text-sm">(optional)</span></label>
                                <textarea className="form-input" rows={3} value={form.custom_prompt}
                                    onChange={e => setForm(f => ({ ...f, custom_prompt: e.target.value }))}
                                    placeholder="Leave empty to auto-generate from title/keyword..." />
                            </div>

                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={generate} disabled={generating}>
                                {generating
                                    ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating image...</>
                                    : '✨ Generate Image'}
                            </button>

                            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                <div className="text-sm text-muted">Requires OpenAI API key in Settings. Each DALL-E 3 generation costs ~$0.04. DALL-E 2 ~$0.02.</div>
                            </div>
                        </div>

                        {/* Preview */}
                        <div>
                            {generating && (
                                <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                    <div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} />
                                    <div style={{ fontWeight: 600 }}>Generating image...</div>
                                    <div className="text-sm text-muted" style={{ marginTop: 8 }}>DALL-E typically takes 10-20 seconds</div>
                                </div>
                            )}

                            {generatedImage && !generating && (
                                <div className="card animate-in">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontWeight: 700 }}>Generated Image</div>
                                            <div className="text-sm text-muted">via {generatedImage.provider} · {generatedImage.size}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm" onClick={() => downloadImage(generatedImage.image_url, form.title || form.keyword || 'image')}>Download</button>
                                            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(generatedImage.image_url); toast.success('URL copied'); }}>Copy URL</button>
                                        </div>
                                    </div>

                                    <img src={generatedImage.image_url} alt={generatedImage.alt_text}
                                        style={{ width: '100%', borderRadius: 8, marginBottom: 12 }}
                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; toast.error('Image URL may have expired — OpenAI URLs expire after 1 hour. Download immediately.'); }} />

                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <span className="form-label" style={{ margin: 0 }}>Alt Text</span>
                                            <button className="btn btn-sm" onClick={copyAlt}>{copiedAlt ? 'Copied!' : 'Copy'}</button>
                                        </div>
                                        <div className="text-sm">{generatedImage.alt_text}</div>
                                    </div>

                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '10px 12px' }}>
                                        <div className="form-label" style={{ marginBottom: 4 }}>Prompt Used</div>
                                        <div className="text-sm text-muted">{generatedImage.prompt}</div>
                                    </div>

                                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6 }}>
                                        <div className="text-sm" style={{ color: '#92400e' }}>⚠️ Download within 1 hour — OpenAI image URLs expire.</div>
                                    </div>
                                </div>
                            )}

                            {!generatedImage && !generating && (
                                <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>🖼️</div>
                                    <div style={{ fontWeight: 600 }}>Your image will appear here</div>
                                    <div className="text-sm" style={{ marginTop: 8 }}>Configure settings and click Generate</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
