'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; }

interface BriefOutline {
    heading: string;
    subheadings?: string[];
    key_points?: string[];
    suggested_word_count?: number;
}

interface Brief {
    title_suggestions?: string[];
    meta_description?: string;
    search_intent?: string;
    target_audience?: string;
    outline?: BriefOutline[];
    keywords?: { primary?: string; secondary?: string[]; lsi?: string[]; questions?: string[] };
    competitor_angles?: string[];
    schema_type?: string;
    tone_guidelines?: string;
    cta_suggestions?: string[];
    unique_angle?: string;
    raw?: string;
}

export default function BriefsPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [keyword, setKeyword] = useState('');
    const [siteId, setSiteId] = useState('');
    const [audience, setAudience] = useState('');
    const [tone, setTone] = useState('Professional');
    const [wordCount, setWordCount] = useState('2000');
    const [loading, setLoading] = useState(false);
    const [brief, setBrief] = useState<Brief | null>(null);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    const handleGenerate = async () => {
        if (!keyword.trim()) { toast.warning('Enter a target keyword'); return; }
        setLoading(true);
        setBrief(null);
        try {
            const res = await fetch('/api/briefs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: keyword.trim(),
                    site_id: siteId || undefined,
                    target_audience: audience || undefined,
                    tone, word_count_target: wordCount,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setBrief(data.brief);
            toast.success('Content brief generated!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Generation failed');
        } finally {
            setLoading(false);
        }
    };

    const exportMarkdown = () => {
        if (!brief) return;
        const md = [
            `# Content Brief: ${keyword}`,
            '',
            `## Title Suggestions`,
            ...(brief.title_suggestions || []).map((t, i) => `${i + 1}. ${t}`),
            '',
            `## Meta Description`,
            brief.meta_description || '',
            '',
            `## Search Intent: ${brief.search_intent || 'N/A'}`,
            `## Target Audience: ${brief.target_audience || 'N/A'}`,
            `## Schema Type: ${brief.schema_type || 'N/A'}`,
            '',
            `## Content Outline`,
            ...(brief.outline || []).flatMap(s => [
                `### ${s.heading}${s.suggested_word_count ? ` (~${s.suggested_word_count} words)` : ''}`,
                ...(s.subheadings || []).map(h => `  - ${h}`),
                ...(s.key_points || []).map(p => `  * ${p}`),
                '',
            ]),
            `## Keywords`,
            `- Primary: ${brief.keywords?.primary || keyword}`,
            `- Secondary: ${(brief.keywords?.secondary || []).join(', ')}`,
            `- LSI: ${(brief.keywords?.lsi || []).join(', ')}`,
            `- Questions:`,
            ...(brief.keywords?.questions || []).map(q => `  - ${q}`),
            '',
            `## Unique Angle`,
            brief.unique_angle || '',
            '',
            `## Tone: ${brief.tone_guidelines || tone}`,
            '',
            `## CTA Suggestions`,
            ...(brief.cta_suggestions || []).map(c => `- ${c}`),
        ].join('\n');

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brief-${keyword.replace(/\s+/g, '-')}.md`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Brief exported as Markdown!');
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Briefs</h1>
                        <p className="page-description">Generate AI-powered content briefs for writers</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Keyword *</label>
                            <input className="form-input" placeholder="e.g. best running shoes 2025" value={keyword} onChange={e => setKeyword(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Site (optional)</label>
                            <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                                <option value="">All sites</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Audience</label>
                            <input className="form-input" placeholder="e.g. beginner runners" value={audience} onChange={e => setAudience(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Tone</label>
                            <select className="form-select" value={tone} onChange={e => setTone(e.target.value)}>
                                {['Professional', 'Casual', 'Conversational', 'Academic', 'Authoritative', 'Friendly'].map(t =>
                                    <option key={t} value={t}>{t}</option>
                                )}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Word Count</label>
                            <input className="form-input" type="number" value={wordCount} onChange={e => setWordCount(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%' }}>
                                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating...</> : '📋 Generate Brief'}
                            </button>
                        </div>
                    </div>
                </div>

                {brief ? (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                            <button className="btn btn-secondary btn-sm" onClick={exportMarkdown}>📥 Export Markdown</button>
                        </div>

                        {/* Title Suggestions */}
                        {brief.title_suggestions && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 12px' }}>✍️ Title Suggestions</h3>
                                {brief.title_suggestions.map((t, i) => (
                                    <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: i === 0 ? 'rgba(99,102,241,0.1)' : 'transparent', marginBottom: 4, fontWeight: i === 0 ? 600 : 400 }}>
                                        {i + 1}. {t}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Outline */}
                        {brief.outline && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 12px' }}>📝 Content Outline</h3>
                                {brief.outline.map((section, i) => (
                                    <div key={i} style={{ marginBottom: 16, paddingLeft: 12, borderLeft: '3px solid var(--accent-primary)' }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{section.heading}
                                            {section.suggested_word_count && <span className="text-sm text-muted"> (~{section.suggested_word_count} words)</span>}
                                        </div>
                                        {section.subheadings?.map((h, j) => (
                                            <div key={j} className="text-sm" style={{ paddingLeft: 16, color: 'var(--text-secondary)' }}>• {h}</div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Keywords */}
                        {brief.keywords && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 12px' }}>🔑 Keywords</h3>
                                <div className="grid-2" style={{ gap: 16 }}>
                                    <div>
                                        <div className="text-sm text-muted" style={{ marginBottom: 4 }}>Secondary</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {(brief.keywords.secondary || []).map((k, i) => (
                                                <span key={i} style={{ padding: '3px 10px', borderRadius: 12, background: 'rgba(99,102,241,0.1)', fontSize: '0.8rem' }}>{k}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted" style={{ marginBottom: 4 }}>People Also Ask</div>
                                        {(brief.keywords.questions || []).map((q, i) => (
                                            <div key={i} className="text-sm" style={{ marginBottom: 2 }}>❓ {q}</div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Meta */}
                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 style={{ margin: '0 0 8px' }}>📊 Brief Details</h3>
                            <div className="text-sm" style={{ lineHeight: 2 }}>
                                <div><strong>Meta Description:</strong> {brief.meta_description}</div>
                                <div><strong>Search Intent:</strong> {brief.search_intent}</div>
                                <div><strong>Schema Type:</strong> {brief.schema_type}</div>
                                <div><strong>Unique Angle:</strong> {brief.unique_angle}</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="card">
                        <EmptyState icon="📋" title="No Brief Generated" description="Enter a keyword and generate a comprehensive content brief for your writers." />
                    </div>
                )}
            </main>
        </div>
    );
}
