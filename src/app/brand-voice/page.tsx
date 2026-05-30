'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface BrandVoice { id: string; name: string; tone: string[]; writing_style: string; vocabulary_level: string; person: string; avoid_phrases: string[]; signature_phrases: string[]; niche?: string; target_audience?: string; created_at: string; }

export default function BrandVoicePage() {
    const toast = useToast();
    const [voices, setVoices] = useState<BrandVoice[]>([]);
    const [tab, setTab] = useState<'voices' | 'create' | 'extract' | 'apply'>('voices');
    const [name, setName] = useState('');
    const [tones, setTones] = useState<string[]>([]);
    const [writingStyle, setWritingStyle] = useState('');
    const [vocabLevel, setVocabLevel] = useState('moderate');
    const [person, setPerson] = useState('second_person');
    const [avoidPhrases, setAvoidPhrases] = useState('');
    const [sigPhrases, setSigPhrases] = useState('');
    const [niche, setNiche] = useState('');
    const [sampleContent, setSampleContent] = useState('');
    const [extractName, setExtractName] = useState('');
    const [applyVoiceId, setApplyVoiceId] = useState('');
    const [applyContent, setApplyContent] = useState('');
    const [rewritten, setRewritten] = useState('');
    const [saving, setSaving] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [applying, setApplying] = useState(false);

    const TONE_OPTIONS = ['conversational', 'authoritative', 'friendly', 'professional', 'casual', 'humorous', 'empathetic', 'direct', 'enthusiastic', 'educational'];

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await fetch('/api/brand-voice');
        const data = await res.json();
        setVoices(data.voices || []);
    };

    const save = async () => {
        if (!name) { toast.warning('Voice name required'); return; }
        setSaving(true);
        const res = await fetch('/api/brand-voice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save', name, tone: tones, writing_style: writingStyle, vocabulary_level: vocabLevel, person, avoid_phrases: avoidPhrases ? avoidPhrases.split(',').map(s => s.trim()).filter(Boolean) : [], signature_phrases: sigPhrases ? sigPhrases.split(',').map(s => s.trim()).filter(Boolean) : [], niche: niche || undefined }),
        });
        if (res.ok) { toast.success('Brand voice saved'); load(); setTab('voices'); }
        setSaving(false);
    };

    const extract = async () => {
        if (!sampleContent || !extractName) { toast.warning('Sample content and name required'); return; }
        setExtracting(true);
        const res = await fetch('/api/brand-voice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'extract', sample_content: sampleContent, name: extractName }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success(`Voice extracted via ${data.provider}`);
            load(); setTab('voices');
        }
        setExtracting(false);
    };

    const apply = async () => {
        if (!applyVoiceId || !applyContent) { toast.warning('Select voice and paste content'); return; }
        setApplying(true);
        const res = await fetch('/api/brand-voice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'apply', voice_id: applyVoiceId, content: applyContent }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setRewritten(data.rewritten);
            toast.success(`Rewritten via ${data.provider}`);
        }
        setApplying(false);
    };

    const toggleTone = (t: string) => setTones(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Brand Voice Manager</h1>
                        <p className="page-description">Define writing style, tone, signature phrases — inject into every AI generation for consistency</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['voices', 'create', 'extract', 'apply'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                        ))}
                    </div>
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Create Brand Voice</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Voice Name *</label>
                                <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="My Blog Voice" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Vocabulary Level</label>
                                <select className="form-input" value={vocabLevel} onChange={e => setVocabLevel(e.target.value)}>
                                    <option value="simple">Simple (8th grade)</option>
                                    <option value="moderate">Moderate (high school)</option>
                                    <option value="advanced">Advanced (college)</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Point of View</label>
                                <select className="form-input" value={person} onChange={e => setPerson(e.target.value)}>
                                    <option value="first_person">First Person (I/we)</option>
                                    <option value="second_person">Second Person (you)</option>
                                    <option value="third_person">Third Person (they)</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Tone (select all that apply)</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {TONE_OPTIONS.map(t => (
                                    <button key={t} className={`btn btn-sm ${tones.includes(t) ? 'btn-primary' : ''}`} onClick={() => toggleTone(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                                ))}
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Writing Style Description</label>
                            <textarea className="form-input" rows={2} value={writingStyle} onChange={e => setWritingStyle(e.target.value)} placeholder="e.g. Short punchy sentences. Use metaphors. Always explain the why. Never use jargon without explaining it first." />
                        </div>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Signature Phrases <span className="text-muted text-sm">(comma-separated)</span></label>
                                <input className="form-input" value={sigPhrases} onChange={e => setSigPhrases(e.target.value)} placeholder="the thing is, here's the deal, bottom line" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Phrases to Avoid <span className="text-muted text-sm">(comma-separated)</span></label>
                                <input className="form-input" value={avoidPhrases} onChange={e => setAvoidPhrases(e.target.value)} placeholder="leverage, synergy, utilize, in conclusion" />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : '💾 Save Voice'}</button>
                    </div>
                )}

                {tab === 'extract' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Extract Voice from Sample</h3>
                        <div className="form-group">
                            <label className="form-label">Voice Name *</label>
                            <input className="form-input" value={extractName} onChange={e => setExtractName(e.target.value)} placeholder="Extracted from [site name]" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Sample Content * <span className="text-muted text-sm">(paste 500+ words of your best posts)</span></label>
                            <textarea className="form-input" rows={10} value={sampleContent} onChange={e => setSampleContent(e.target.value)} placeholder="Paste sample blog content here. The more you paste, the more accurate the extraction..." style={{ fontFamily: 'inherit' }} />
                            <div className="text-sm text-muted" style={{ marginTop: 4 }}>{sampleContent.split(/\s+/).filter(Boolean).length} words</div>
                        </div>
                        <button className="btn btn-primary" onClick={extract} disabled={extracting}>{extracting ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Extracting...</> : '🧬 Extract Voice'}</button>
                    </div>
                )}

                {tab === 'apply' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Apply Voice to Content</h3>
                        <div className="form-group">
                            <label className="form-label">Select Voice *</label>
                            <select className="form-input" value={applyVoiceId} onChange={e => setApplyVoiceId(e.target.value)}>
                                <option value="">Choose voice...</option>
                                {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                        </div>
                        <div className="grid-2" style={{ gap: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Original Content *</label>
                                <textarea className="form-input" rows={10} value={applyContent} onChange={e => setApplyContent(e.target.value)} placeholder="Paste AI-generated or draft content here..." style={{ fontFamily: 'inherit' }} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Rewritten Content</label>
                                <textarea className="form-input" rows={10} value={rewritten} readOnly={!rewritten} onChange={e => setRewritten(e.target.value)} placeholder="Rewritten content appears here..." style={{ fontFamily: 'inherit', background: rewritten ? 'var(--bg-card)' : 'var(--bg-secondary)' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="btn btn-primary" onClick={apply} disabled={applying}>{applying ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Rewriting...</> : '✍️ Apply Voice'}</button>
                            {rewritten && <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(rewritten); toast.success('Copied'); }}>📋 Copy</button>}
                        </div>
                    </div>
                )}

                {tab === 'voices' && (
                    voices.length === 0 ? (
                        <EmptyState icon="🎭" title="No brand voices defined" description="Create a voice profile or extract one from your existing content for consistent AI writing" />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {voices.map((v, i) => (
                                <div key={i} className="card" style={{ padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{v.name}</div>
                                            {v.niche && <Badge variant="neutral">{v.niche}</Badge>}
                                        </div>
                                        <button className="btn btn-sm btn-primary" onClick={() => { setApplyVoiceId(v.id); setTab('apply'); }}>Apply</button>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                        {v.tone?.map((t, ti) => <span key={ti} style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem' }}>{t}</span>)}
                                    </div>
                                    {v.writing_style && <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{v.writing_style}</div>}
                                    <div style={{ display: 'flex', gap: 16 }}>
                                        <span className="text-sm text-muted">📖 {v.vocabulary_level}</span>
                                        <span className="text-sm text-muted">👤 {v.person.replace('_', ' ')}</span>
                                        {v.signature_phrases?.length > 0 && <span className="text-sm text-muted">✍️ {v.signature_phrases.length} signature phrases</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
