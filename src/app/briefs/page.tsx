'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
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

// NLP Brief types (from /nlp-brief)
interface NlpBrief {
    keyword: string;
    search_intent: string;
    target_word_count: number;
    reading_level: string;
    entities: Array<{ name: string; type: string; importance: 'required' | 'recommended' | 'optional' }>;
    semantic_topics: Array<{ topic: string; coverage_depth: 'deep' | 'medium' | 'mention'; questions_to_answer: string[] }>;
    suggested_headings: Array<{ level: 'H1' | 'H2' | 'H3'; text: string; keyword_to_include?: string }>;
    competitor_gaps: string[];
    featured_snippet_opportunity: { possible: boolean; type: string; format_tip: string };
    schema_types: string[];
    internal_link_anchors: string[];
    provider: string;
}

const ENTITY_VARIANT: Record<string, 'success' | 'warning' | 'info'> = { required: 'success', recommended: 'warning', optional: 'info' };
const DEPTH_COLOR: Record<string, string> = { deep: '#16a34a', medium: '#d97706', mention: '#6b7280' };

export default function BriefsPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('main');

    // Content Brief state
    const [sites, setSites] = useState<Site[]>([]);
    const [keyword, setKeyword] = useState('');
    const [siteId, setSiteId] = useState('');
    const [audience, setAudience] = useState('');
    const [tone, setTone] = useState('Professional');
    const [wordCount, setWordCount] = useState('2000');
    const [loading, setLoading] = useState(false);
    const [brief, setBrief] = useState<Brief | null>(null);

    // NLP Brief state
    const [nlpKeyword, setNlpKeyword] = useState('');
    const [nlpCompetitors, setNlpCompetitors] = useState('');
    const [nlpNiche, setNlpNiche] = useState('');
    const [nlpBrief, setNlpBrief] = useState<NlpBrief | null>(null);
    const [nlpGenerating, setNlpGenerating] = useState(false);

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

    // NLP Brief functions
    const handleNlpGenerate = async () => {
        if (!nlpKeyword) { toast.warning('Enter target keyword'); return; }
        setNlpGenerating(true);
        const res = await fetch('/api/nlp-brief', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keyword: nlpKeyword, niche: nlpNiche || undefined,
                competitor_urls: nlpCompetitors ? nlpCompetitors.split('\n').map(s => s.trim()).filter(Boolean) : [],
            }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setNlpGenerating(false); return; }
        setNlpBrief(data.brief);
        toast.success(`Brief generated via ${data.brief.provider}`);
        setNlpGenerating(false);
    };

    const copyNlpBrief = () => {
        if (!nlpBrief) return;
        const text = [
            `# NLP Brief: ${nlpBrief.keyword}`,
            `Intent: ${nlpBrief.search_intent}`,
            `Target: ${nlpBrief.target_word_count} words (${nlpBrief.reading_level})`,
            '',
            '## Required Entities',
            ...nlpBrief.entities.filter(e => e.importance === 'required').map(e => `- ${e.name} (${e.type})`),
            '',
            '## Suggested Structure',
            ...nlpBrief.suggested_headings.map(h => `${'#'.repeat(parseInt(h.level.replace('H', '')))} ${h.text}`),
        ].join('\n');
        navigator.clipboard.writeText(text);
        toast.success('Brief copied');
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

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>📋 Content Brief</button>
                    <button className={`btn ${activeTab === 'nlp-brief' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('nlp-brief')}>🧠 NLP Brief</button>
                </div>

                {activeTab === 'main' && (
                    <>
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
                    </>
                )}

                {activeTab === 'nlp-brief' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Target Keyword *</label>
                                    <input className="form-input" value={nlpKeyword} onChange={e => setNlpKeyword(e.target.value)} placeholder="best protein powder for weight loss" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche <span className="text-muted text-sm">(helps AI)</span></label>
                                    <input className="form-input" value={nlpNiche} onChange={e => setNlpNiche(e.target.value)} placeholder="fitness & nutrition" />
                                </div>
                                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                    <label className="form-label">Competitor URLs <span className="text-muted text-sm">(one per line, optional)</span></label>
                                    <textarea className="form-input" rows={3} value={nlpCompetitors} onChange={e => setNlpCompetitors(e.target.value)} placeholder={"https://competitor.com/article\nhttps://another.com/post"} />
                                </div>
                            </div>
                            <button className="btn btn-primary" onClick={handleNlpGenerate} disabled={nlpGenerating}>
                                {nlpGenerating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating brief...</> : '📋 Generate NLP Brief'}
                            </button>
                        </div>

                        {nlpBrief && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <Badge variant="info">{nlpBrief.search_intent}</Badge>
                                        <Badge variant="neutral">{nlpBrief.target_word_count.toLocaleString()} words</Badge>
                                        <Badge variant="neutral">{nlpBrief.reading_level}</Badge>
                                    </div>
                                    <button className="btn btn-sm" onClick={copyNlpBrief}>📋 Copy Brief</button>
                                </div>

                                {nlpBrief.featured_snippet_opportunity.possible && (
                                    <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #7c3aed' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 4 }}>⭐ Featured Snippet Opportunity</div>
                                        <div className="text-sm">Type: <strong>{nlpBrief.featured_snippet_opportunity.type}</strong></div>
                                        <div className="text-sm text-muted">{nlpBrief.featured_snippet_opportunity.format_tip}</div>
                                    </div>
                                )}

                                <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                                    {/* Entities */}
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 12 }}>Entities to Cover</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {nlpBrief.entities.map((e, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                                                    <div>
                                                        <span style={{ fontWeight: 600 }}>{e.name}</span>
                                                        <span className="text-sm text-muted" style={{ marginLeft: 6 }}>{e.type}</span>
                                                    </div>
                                                    <Badge variant={ENTITY_VARIANT[e.importance]}>{e.importance}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Heading structure */}
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 12 }}>Suggested Structure</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {nlpBrief.suggested_headings.map((h, i) => (
                                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', paddingLeft: h.level === 'H2' ? 0 : h.level === 'H3' ? 16 : 0 }}>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: 24 }}>{h.level}</span>
                                                    <span className="text-sm" style={{ fontWeight: h.level === 'H1' ? 700 : h.level === 'H2' ? 600 : 400 }}>{h.text}</span>
                                                    {h.keyword_to_include && <span style={{ fontSize: '0.65rem', color: '#d97706' }}>+kw</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Semantic topics */}
                                <div className="card" style={{ marginBottom: 16 }}>
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Semantic Topic Coverage</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {nlpBrief.semantic_topics.map((t, i) => (
                                            <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${DEPTH_COLOR[t.coverage_depth]}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <span style={{ fontWeight: 700 }}>{t.topic}</span>
                                                    <span style={{ fontSize: '0.75rem', color: DEPTH_COLOR[t.coverage_depth], fontWeight: 700 }}>{t.coverage_depth}</span>
                                                </div>
                                                {t.questions_to_answer.map((q, qi) => <div key={qi} className="text-sm text-muted">• {q}</div>)}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid-2" style={{ gap: 16 }}>
                                    {nlpBrief.competitor_gaps.length > 0 && (
                                        <div className="card">
                                            <h3 className="card-title" style={{ marginBottom: 10 }}>Content Gaps vs Competitors</h3>
                                            {nlpBrief.competitor_gaps.map((g, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>💡 {g}</div>)}
                                        </div>
                                    )}
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 10 }}>Schema & Links</h3>
                                        <div style={{ marginBottom: 10 }}>
                                            <div className="form-label">Schema Types</div>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {nlpBrief.schema_types.map((s, i) => <Badge key={i} variant="info">{s}</Badge>)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="form-label">Internal Link Anchors</div>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {nlpBrief.internal_link_anchors.map((a, i) => (
                                                    <span key={i} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10, fontSize: '0.8rem' }}>{a}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
