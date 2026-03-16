'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; }
interface ImageSuggestion {
    prompt: string; alt_text: string; placement: string; type: string;
    filename_suggestion?: string; dimensions?: string;
}

export default function ImageSEOPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [title, setTitle] = useState('');
    const [keyword, setKeyword] = useState('');
    const [content, setContent] = useState('');
    const [count, setCount] = useState(3);
    const [loading, setLoading] = useState(false);
    const [images, setImages] = useState<ImageSuggestion[]>([]);
    const [ogImage, setOgImage] = useState<{ prompt: string; alt_text: string } | null>(null);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    const handleGenerate = async () => {
        if (!title.trim()) { toast.warning('Enter an article title'); return; }
        setLoading(true);
        setImages([]);
        try {
            const res = await fetch('/api/images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, keyword, content, count }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setImages(data.images?.images || []);
            setOgImage(data.images?.open_graph || null);
            toast.success(`Generated ${data.images?.images?.length || 0} image suggestions!`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Generation failed');
        } finally {
            setLoading(false);
        }
    };

    const copyPrompt = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Prompt copied!');
    };

    const typeColors: Record<string, string> = {
        hero: 'success', infographic: 'info', diagram: 'warning', photo: 'neutral', illustration: 'info',
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Image SEO & AI Generation</h1>
                        <p className="page-description">Generate AI image prompts and SEO-optimized alt text</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Article Title *</label>
                            <input className="form-input" placeholder="e.g. 10 Best SEO Tools for 2025" value={title} onChange={e => setTitle(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Keyword</label>
                            <input className="form-input" placeholder="e.g. best SEO tools" value={keyword} onChange={e => setKeyword(e.target.value)} />
                        </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label className="form-label">Content Preview (optional)</label>
                        <textarea className="form-input" rows={4} placeholder="Paste article content for more relevant image suggestions..." value={content} onChange={e => setContent(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Number of Images</label>
                            <select className="form-select" value={count} onChange={e => setCount(Number(e.target.value))}>
                                {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
                            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating...</> : '🖼️ Generate Image Suggestions'}
                        </button>
                    </div>
                </div>

                {ogImage && (
                    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: '0 0 4px' }}>🌐 Open Graph Image</h3>
                                <div className="text-sm text-muted">Alt: {ogImage.alt_text}</div>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => copyPrompt(ogImage.prompt)}>📋 Copy Prompt</button>
                        </div>
                        <pre className="text-sm" style={{ marginTop: 8, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                            {ogImage.prompt}
                        </pre>
                    </div>
                )}

                {images.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {images.map((img, i) => (
                            <div key={i} className="card" style={{ cursor: 'pointer', border: expandedIdx === i ? '1px solid var(--accent-primary)' : undefined }}
                                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '1.3rem' }}>🖼️</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600 }}>{img.placement}</div>
                                        <div className="text-sm text-muted">{img.alt_text}</div>
                                    </div>
                                    <Badge variant={(typeColors[img.type] || 'neutral') as 'success' | 'info' | 'warning' | 'neutral' | 'danger'}>{img.type}</Badge>
                                    {img.dimensions && <span className="text-sm font-mono text-muted">{img.dimensions}</span>}
                                    <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); copyPrompt(img.prompt); }}>📋</button>
                                </div>
                                {expandedIdx === i && (
                                    <div style={{ marginTop: 12 }}>
                                        <div className="text-sm" style={{ marginBottom: 6 }}><strong>Filename:</strong> {img.filename_suggestion || 'N/A'}</div>
                                        <pre className="text-sm" style={{ padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                                            {img.prompt}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="card">
                        <EmptyState icon="🖼️" title="No Image Suggestions" description="Enter an article title and generate AI image prompts with SEO-optimized alt text." />
                    </div>
                )}
            </main>
        </div>
    );
}
