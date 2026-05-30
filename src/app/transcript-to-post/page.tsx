'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ConvertResult { title: string; slug: string; meta_description: string; content: string; word_count: number; key_takeaways: string[]; focus_keyword: string; tags: string[]; }

export default function TranscriptToPostPage() {
    const toast = useToast();
    const [transcript, setTranscript] = useState('');
    const [sourceType, setSourceType] = useState('youtube');
    const [sourceUrl, setSourceUrl] = useState('');
    const [titleHint, setTitleHint] = useState('');
    const [niche, setNiche] = useState('');
    const [wordCount, setWordCount] = useState('1500');
    const [includeTimestamps, setIncludeTimestamps] = useState(true);
    const [siteId, setSiteId] = useState('');
    const [autoSave, setAutoSave] = useState(false);
    const [result, setResult] = useState<ConvertResult | null>(null);
    const [converting, setConverting] = useState(false);
    const [tab, setTab] = useState<'input' | 'output'>('input');

    const convert = async () => {
        if (transcript.trim().length < 100) { toast.warning('Transcript too short (min 100 chars)'); return; }
        setConverting(true);
        const res = await fetch('/api/transcript-to-post', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'convert', transcript, source_type: sourceType, source_url: sourceUrl || undefined, title_hint: titleHint || undefined, niche: niche || undefined, target_word_count: parseInt(wordCount), include_timestamps: includeTimestamps, site_id: siteId || undefined, auto_save: autoSave }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setConverting(false); return; }
        setResult(data.result);
        toast.success(`Converted! ${data.result.word_count}w post via ${data.provider}${data.post ? ' + saved as draft' : ''}`);
        setTab('output');
        setConverting(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Transcript → Blog Post</h1>
                        <p className="page-description">Convert YouTube/podcast transcripts into SEO-optimized blog posts with proper structure</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['input', 'output'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                        ))}
                    </div>
                </div>

                {tab === 'input' && (
                    <div className="card">
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Source Type</label>
                                <select className="form-input" value={sourceType} onChange={e => setSourceType(e.target.value)}>
                                    <option value="youtube">YouTube Video</option>
                                    <option value="podcast">Podcast Episode</option>
                                    <option value="interview">Interview</option>
                                    <option value="webinar">Webinar</option>
                                    <option value="video">Other Video</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Source URL <span className="text-muted text-sm">(optional, added as reference)</span></label>
                                <input className="form-input" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Topic Hint <span className="text-muted text-sm">(helps AI title better)</span></label>
                                <input className="form-input" value={titleHint} onChange={e => setTitleHint(e.target.value)} placeholder="e.g. How to make money blogging" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance, fitness..." />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Target Word Count</label>
                                <select className="form-input" value={wordCount} onChange={e => setWordCount(e.target.value)}>
                                    {['800', '1000', '1500', '2000', '2500'].map(n => <option key={n} value={n}>{n} words</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Site ID <span className="text-muted text-sm">(for auto-save)</span></label>
                                <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites" />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Transcript * <span className="text-muted text-sm">({transcript.split(/\s+/).filter(Boolean).length} words — paste raw transcript or SRT file)</span></label>
                            <textarea className="form-input" rows={14} value={transcript} onChange={e => setTranscript(e.target.value)} placeholder={'00:00 Welcome to the show...\n00:30 Today we are talking about...\n\nOr paste raw text without timestamps...'} style={{ fontFamily: 'inherit', fontSize: '0.88rem' }} />
                        </div>

                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <button className="btn btn-primary" onClick={convert} disabled={converting}>{converting ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Converting...</> : '✍️ Convert to Post'}</button>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={includeTimestamps} onChange={e => setIncludeTimestamps(e.target.checked)} />
                                <span className="text-sm">Include timestamp links</span>
                            </label>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} disabled={!siteId} />
                                <span className="text-sm">Auto-save as draft</span>
                            </label>
                        </div>
                    </div>
                )}

                {tab === 'output' && result && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <div>
                                    <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{result.title}</h2>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <Badge variant="info">{result.word_count.toLocaleString()} words</Badge>
                                        <Badge variant="neutral">/{result.slug}</Badge>
                                        {result.focus_keyword && <Badge variant="warning">KW: {result.focus_keyword}</Badge>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(result.content); toast.success('Copied'); }}>📋 Copy HTML</button>
                                    <button className="btn btn-sm" onClick={() => setTab('input')}>← Edit Input</button>
                                </div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <div className="form-label">Meta Description</div>
                                <div style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 4, fontSize: '0.85rem' }}>{result.meta_description}</div>
                            </div>
                            {result.key_takeaways?.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <div className="form-label">Key Takeaways</div>
                                    {result.key_takeaways.map((t, i) => <div key={i} className="text-sm" style={{ marginBottom: 2 }}>✅ {t}</div>)}
                                </div>
                            )}
                            {result.tags?.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {result.tags.map((t, i) => <span key={i} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem' }}>{t}</span>)}
                                </div>
                            )}
                        </div>
                        <div className="card">
                            <div className="form-label" style={{ marginBottom: 8 }}>Post Content (HTML)</div>
                            <textarea className="form-input" rows={20} value={result.content} onChange={e => setResult(prev => prev ? { ...prev, content: e.target.value } : null)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }} />
                        </div>
                    </div>
                )}

                {tab === 'output' && !result && <EmptyState icon="✍️" title="Convert a transcript first" description="Go to the Input tab to paste your transcript" />}
            </main>
        </div>
    );
}
