'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { ScoreBar, ScoreRing, Badge } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; url: string; niche: string; }

interface ContentScore {
    seo: number; aeo: number; eeat: number; readability: number; snippet: number;
    schema: number; links: number; freshness: number; depth: number; intent: number;
    geo: number; serpCorrelation: number; topicCoverage: number; missingTopics: string[];
    overall: number;
    humanness?: number; userValue?: number; competitive?: number;
    publishReadiness?: {
        decision: string; rankability: string; overallQC: number; improvements: string[];
    };
}

interface LinkSuggestion {
    anchorText: string; targetUrl: string; targetTitle: string;
    relevanceScore: number; type: 'internal' | 'external';
}

interface GeneratedContent {
    title: string; metaTitle: string; metaDescription: string;
    content: string; faqSection: { question: string; answer: string }[];
    schemaMarkup: Record<string, unknown>;
}

interface OutlineSection {
    heading: string; level: 'h2' | 'h3'; notes: string;
    estimatedWords: number; snippetType?: string;
}

interface ContentOutline {
    title: string; metaTitle: string; slug: string; targetWordCount: number;
    sections: OutlineSection[]; faqSuggestions: string[];
    entitySuggestions: string[]; competitorTopics: string[];
}

type FlowStep = 'input' | 'outline' | 'generating' | 'result';

const LANGUAGES = [
    { code: 'en', label: 'English' }, { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' }, { code: 'de', label: 'German' },
    { code: 'pt', label: 'Portuguese' }, { code: 'it', label: 'Italian' },
    { code: 'nl', label: 'Dutch' }, { code: 'hi', label: 'Hindi' },
    { code: 'bn', label: 'Bengali' }, { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' }, { code: 'zh', label: 'Chinese' },
    { code: 'ar', label: 'Arabic' }, { code: 'tr', label: 'Turkish' },
    { code: 'ru', label: 'Russian' },
];

export default function CreateContentPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [keyword, setKeyword] = useState('');
    const [step, setStep] = useState<FlowStep>('input');
    const [stage, setStage] = useState('');
    const [language, setLanguage] = useState('en');
    const [streamingPreview, setStreamingPreview] = useState('');

    // Outline state
    const [outline, setOutline] = useState<ContentOutline | null>(null);
    const [outlineLoading, setOutlineLoading] = useState(false);

    // Result state
    const [result, setResult] = useState<{
        content: GeneratedContent; score: ContentScore;
        competitorInsight: { avgWordCount: number; commonTopics: string[]; contentGaps: string[] };
        serpData: { results: { position: number; title: string; url: string; domain: string }[] };
        internalLinks: LinkSuggestion[]; externalLinks: LinkSuggestion[];
        slug: string;
    } | null>(null);

    // Editor state
    const [editedContent, setEditedContent] = useState('');
    const [editedTitle, setEditedTitle] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [queueSaving, setQueueSaving] = useState(false);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
        // Check URL params for keyword
        const params = new URLSearchParams(window.location.search);
        if (params.get('keyword')) setKeyword(params.get('keyword')!);
    }, []);

    // Step 1: Generate Outline
    const handleOutline = async () => {
        if (!keyword.trim()) return;
        setOutlineLoading(true);
        setOutline(null);
        try {
            const site = sites.find(s => s.id === selectedSite);
            const res = await fetch('/api/content/outline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword, niche: site?.niche || '' }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Outline failed');
            const data = await res.json();
            setOutline(data.outline);
            setStep('outline');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to generate outline');
        } finally {
            setOutlineLoading(false);
        }
    };

    // Step 2: Skip outline → direct generate
    const handleDirectGenerate = async () => {
        await handleGenerate();
    };

    // Step 3: Generate full article (with SSE streaming)
    const handleGenerate = async () => {
        setStep('generating');
        setResult(null);
        setStreamingPreview('');

        try {
            // Try SSE streaming first
            setStage('🔍 Searching Google for competitors...');
            const res = await fetch('/api/content/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword, site_id: selectedSite || undefined, language }),
            });

            if (!res.ok || !res.body) {
                // Fallback to non-streaming
                return await handleGenerateFallback();
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let preview = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        // Store event type for next data line
                        continue;
                    }
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            // Parse SSE events
                            if (data.stage) {
                                const stageIcons: Record<string, string> = {
                                    research: '🔍', competitors: '📊', analysis: '🧠',
                                    writing: '✍️', optimizing: '⚡',
                                };
                                setStage(`${stageIcons[data.stage] || '🔄'} ${data.message}`);
                            } else if (data.text) {
                                preview += data.text;
                                setStreamingPreview(preview);
                            } else if (data.done !== undefined || data.score) {
                                // Complete event — set final result (must be checked BEFORE data.content
                                // because the complete event also has a content object)
                                setResult(data);
                                setEditedContent(data.content?.content || preview);
                                setEditedTitle(data.content?.title || keyword.replace(/\b\w/g, (l: string) => l.toUpperCase()));
                                setStep('result');
                                setStage('');
                                return;
                            } else if (data.content && typeof data.content === 'string') {
                                // Raw content arrived (content_raw event sends content as a string)
                                preview = data.content;
                                setStreamingPreview(preview);
                            } else if (data.message && !data.stage) {
                                // Error
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            if (e instanceof SyntaxError) continue;
                            throw e;
                        }
                    }
                }
            }

            // If we got here without a complete event, use the preview
            if (preview && !result) {
                setEditedContent(preview);
                setEditedTitle(keyword.replace(/\b\w/g, (l: string) => l.toUpperCase()));
                setStep('result');
            }
        } catch (error) {
            console.warn('Streaming failed, trying fallback:', error);
            try {
                await handleGenerateFallback();
            } catch (fallbackError) {
                toast.error(fallbackError instanceof Error ? fallbackError.message : 'Failed to generate');
                setStep(outline ? 'outline' : 'input');
            }
        } finally {
            setStage('');
        }
    };

    // Fallback: non-streaming generation
    const handleGenerateFallback = async () => {
        setStage('🔍 Generating article (non-streaming)...');
        const res = await fetch('/api/content/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, site_id: selectedSite || undefined, language }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Generation failed');
        setStage('✅ Content generated!');
        const data = await res.json();
        setResult(data);
        setEditedContent(data.content.content);
        setEditedTitle(data.content.title);
        setStep('result');
    };

    const handlePublish = async (status: 'draft' | 'publish', force = false) => {
        if (!result || !selectedSite) { toast.warning('Please select a site first'); return; }
        setPublishing(true);
        try {
            const payload = {
                site_id: selectedSite,
                title: editedTitle,
                content: editedContent,
                status,
                meta_title: result.content.metaTitle,
                meta_description: result.content.metaDescription,
                schema_markup: result.content.schemaMarkup,
                keyword,
                force,
            };
            const res = await fetch('/api/content/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            // Handle duplicate detection (409 Conflict)
            if (res.status === 409 && data.duplicate) {
                const confirmed = window.confirm(
                    `⚠️ Duplicate post detected!\n\n` +
                    `An existing post "${data.duplicate.title}" (/${data.duplicate.slug}) ` +
                    `with status "${data.duplicate.status}" was found.\n\n` +
                    `Do you still want to publish this as a new post?`
                );
                if (confirmed) {
                    setPublishing(false);
                    return handlePublish(status, true); // Retry with force=true
                }
                toast.warning('Publishing cancelled — duplicate post already exists');
                return;
            }

            if (!res.ok) throw new Error(data.error);
            toast.success(`Post ${status === 'draft' ? 'saved as draft' : 'published'}! WordPress Post ID: ${data.wpPostId}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Publish failed');
        } finally {
            setPublishing(false);
        }
    };

    const handleSaveToQueue = async () => {
        if (!result) return;
        setQueueSaving(true);
        try {
            const site = sites.find(s => s.id === selectedSite);
            const res = await fetch('/api/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editedTitle,
                    keyword,
                    content: editedContent,
                    meta_title: result.content.metaTitle,
                    meta_description: result.content.metaDescription,
                    schema_markup: result.content.schemaMarkup,
                    status: 'review',
                    score: result.score.overall,
                    site_id: selectedSite || null,
                    site_name: site?.name || null,
                }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Added to publish queue!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save to queue');
        } finally {
            setQueueSaving(false);
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content Writer</h1>
                        <p className="page-description">AI-generate SEO-optimized articles from competitor research</p>
                    </div>
                    {step !== 'input' && (
                        <button className="btn btn-secondary" onClick={() => { setStep('input'); setResult(null); setOutline(null); }}>
                            ← New Article
                        </button>
                    )}
                </div>

                {/* Step Progress */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                    {['input', 'outline', 'generating', 'result'].map((s, i) => (
                        <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: ['input', 'outline', 'generating', 'result'].indexOf(step) >= i ? 'var(--accent-primary)' : 'var(--border-subtle)', transition: 'background 0.3s' }} />
                    ))}
                </div>

                {/* STEP 1: Input */}
                {step === 'input' && (
                    <div className="card animate-in" style={{ marginBottom: 24 }}>
                        <div className="card-header">
                            <h2 className="card-title">🎯 Target Keyword</h2>
                        </div>
                        <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Keyword / Topic</label>
                                <input className="form-input" placeholder="e.g., best wireless headphones 2025" value={keyword}
                                    onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleOutline()}
                                    style={{ fontSize: '1rem', padding: '14px' }} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Target Site (optional)</label>
                                <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)} style={{ padding: '14px' }}>
                                    <option value="">Select a WordPress site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Language</label>
                                <select className="form-select" value={language} onChange={e => setLanguage(e.target.value)} style={{ padding: '14px' }}>
                                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button className="btn btn-primary btn-lg" onClick={handleOutline} disabled={outlineLoading || !keyword.trim()}>
                                {outlineLoading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating Outline...</> : '📋 Preview Outline First'}
                            </button>
                            <button className="btn btn-secondary btn-lg" onClick={handleDirectGenerate} disabled={outlineLoading || !keyword.trim()}>
                                ⚡ Skip to Full Article
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 2: Outline Preview */}
                {step === 'outline' && outline && (
                    <div className="animate-in">
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="card-header">
                                <div>
                                    <h2 className="card-title">📋 Content Outline Preview</h2>
                                    <p className="card-subtitle">Review the structure before generating the full article</p>
                                </div>
                                <div className="flex gap-2">
                                    <Badge variant="info">~{outline.targetWordCount} words</Badge>
                                    <Badge variant="success">{outline.sections.length} sections</Badge>
                                </div>
                            </div>

                            {/* Title & Meta */}
                            <div style={{ background: 'var(--gradient-glow)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20 }}>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{outline.title}</div>
                                <div className="text-sm text-muted">Meta: {outline.metaTitle}</div>
                                <div className="text-sm text-muted">Slug: /{outline.slug}</div>
                            </div>

                            {/* Editable Sections */}
                            <div style={{ marginBottom: 20 }}>
                                <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                                    <span className="text-sm" style={{ fontWeight: 600 }}>📝 Sections</span>
                                    <span className="text-sm text-muted">(click to edit, drag to reorder)</span>
                                </div>
                                {outline.sections.map((section, i) => (
                                    <div key={i} style={{
                                        padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8,
                                        borderLeft: `3px solid ${section.level === 'h2' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                                        marginLeft: section.level === 'h3' ? 24 : 0, marginBottom: 6,
                                        background: 'var(--bg-glass)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                                    }}>
                                        {/* Move buttons */}
                                        <div className="flex flex-col gap-1" style={{ minWidth: 20, paddingTop: 2 }}>
                                            <button className="btn btn-sm" style={{ padding: '0 4px', fontSize: '0.7rem', lineHeight: 1 }}
                                                disabled={i === 0}
                                                onClick={() => {
                                                    const s = [...outline.sections];
                                                    [s[i - 1], s[i]] = [s[i], s[i - 1]];
                                                    setOutline({ ...outline, sections: s });
                                                }}>↑</button>
                                            <button className="btn btn-sm" style={{ padding: '0 4px', fontSize: '0.7rem', lineHeight: 1 }}
                                                disabled={i === outline.sections.length - 1}
                                                onClick={() => {
                                                    const s = [...outline.sections];
                                                    [s[i], s[i + 1]] = [s[i + 1], s[i]];
                                                    setOutline({ ...outline, sections: s });
                                                }}>↓</button>
                                        </div>
                                        {/* Content */}
                                        <div style={{ flex: 1 }}>
                                            <input
                                                className="form-input"
                                                value={section.heading}
                                                onChange={e => {
                                                    const s = [...outline.sections];
                                                    s[i] = { ...s[i], heading: e.target.value };
                                                    setOutline({ ...outline, sections: s });
                                                }}
                                                style={{
                                                    fontWeight: section.level === 'h2' ? 600 : 400,
                                                    fontSize: section.level === 'h2' ? '0.95rem' : '0.85rem',
                                                    background: 'transparent', border: '1px solid transparent',
                                                    padding: '4px 6px', width: '100%',
                                                }}
                                                onFocus={e => (e.target.style.borderColor = 'var(--border-accent)')}
                                                onBlur={e => (e.target.style.borderColor = 'transparent')}
                                            />
                                            <input
                                                className="form-input text-sm text-muted"
                                                value={section.notes || ''}
                                                placeholder="Add notes about what to cover..."
                                                onChange={e => {
                                                    const s = [...outline.sections];
                                                    s[i] = { ...s[i], notes: e.target.value };
                                                    setOutline({ ...outline, sections: s });
                                                }}
                                                style={{ background: 'transparent', border: '1px solid transparent', padding: '2px 6px', width: '100%', fontSize: '0.8rem' }}
                                                onFocus={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                                                onBlur={e => (e.target.style.borderColor = 'transparent')}
                                            />
                                        </div>
                                        {/* Badges & Delete */}
                                        <div className="flex gap-2 items-center" style={{ flexShrink: 0 }}>
                                            <select
                                                value={section.level}
                                                onChange={e => {
                                                    const s = [...outline.sections];
                                                    s[i] = { ...s[i], level: e.target.value as 'h2' | 'h3' };
                                                    setOutline({ ...outline, sections: s });
                                                }}
                                                className="form-select"
                                                style={{ padding: '2px 4px', fontSize: '0.75rem', width: 55 }}
                                            >
                                                <option value="h2">H2</option>
                                                <option value="h3">H3</option>
                                            </select>
                                            {section.snippetType && section.snippetType !== 'none' && <Badge variant="warning">🎯 {section.snippetType}</Badge>}
                                            <Badge variant="neutral">~{section.estimatedWords}w</Badge>
                                            <button className="btn btn-sm" style={{ padding: '2px 6px', color: 'var(--accent-danger)' }}
                                                onClick={() => {
                                                    const s = outline.sections.filter((_, idx) => idx !== i);
                                                    setOutline({ ...outline, sections: s });
                                                }}>✕</button>
                                        </div>
                                    </div>
                                ))}
                                {/* Add section button */}
                                <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}
                                    onClick={() => {
                                        setOutline({
                                            ...outline,
                                            sections: [...outline.sections, { heading: 'New Section', level: 'h2', notes: '', estimatedWords: 200 }]
                                        });
                                    }}>
                                    + Add Section
                                </button>
                            </div>

                            {/* FAQ & Entities */}
                            <div className="grid-2" style={{ gap: 16, marginBottom: 20 }}>
                                {outline.faqSuggestions?.length > 0 && (
                                    <div>
                                        <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>💬 FAQ Suggestions</div>
                                        {outline.faqSuggestions.map((q, i) => (
                                            <div key={i} className="text-sm text-muted" style={{ marginBottom: 4 }}>• {q}</div>
                                        ))}
                                    </div>
                                )}
                                {outline.entitySuggestions?.length > 0 && (
                                    <div>
                                        <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>🏷️ Key Entities</div>
                                        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                                            {outline.entitySuggestions.map((e, i) => <Badge key={i} variant="neutral">{e}</Badge>)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button className="btn btn-primary btn-lg" onClick={handleGenerate}>
                                    ✨ Generate Full Article
                                </button>
                                <button className="btn btn-secondary" onClick={handleOutline}>
                                    🔄 Regenerate Outline
                                </button>
                                <button className="btn btn-secondary" onClick={() => setStep('input')}>
                                    ← Edit Keyword
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: Generating (with live preview) */}
                {step === 'generating' && (
                    <div className="animate-in">
                        <div className="card" style={{ textAlign: 'center', padding: '24px 24px 16px', marginBottom: streamingPreview ? 16 : 0 }}>
                            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 6 }}>{stage || 'Generating your article...'}</h2>
                            <p className="text-sm text-muted">{streamingPreview ? 'Writing in real-time...' : 'Researching competitors and building content strategy...'}</p>
                        </div>
                        {streamingPreview && (
                            <div className="card" style={{ maxHeight: 400, overflow: 'auto' }}>
                                <div className="card-header">
                                    <h3 className="card-title">✍️ Live Preview</h3>
                                    <span className="text-sm text-muted">{streamingPreview.length.toLocaleString()} chars</span>
                                </div>
                                <div
                                    dangerouslySetInnerHTML={{ __html: streamingPreview }}
                                    style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.85 }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 4: Result with Editor */}
                {step === 'result' && result && (
                    <div className="animate-in">
                        {/* Score Overview */}
                        <div className="grid-2" style={{ gap: 24, marginBottom: 24 }}>
                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">📊 Content Score</h2>
                                    <ScoreRing score={result.score.overall} />
                                </div>
                                <div className="score-bar-container">
                                    <ScoreBar label="SEO" score={result.score.seo} />
                                    <ScoreBar label="AEO" score={result.score.aeo} />
                                    <ScoreBar label="E-E-A-T" score={result.score.eeat} />
                                    <ScoreBar label="Readability" score={result.score.readability} />
                                    <ScoreBar label="Snippet" score={result.score.snippet} />
                                    <ScoreBar label="Schema" score={result.score.schema} />
                                    <ScoreBar label="Links" score={result.score.links} />
                                    <ScoreBar label="Depth" score={result.score.depth} />
                                    <ScoreBar label="Intent Match" score={result.score.intent} />
                                    <ScoreBar label="GEO" score={result.score.geo} />
                                    <ScoreBar label="Freshness" score={result.score.freshness} />
                                    {result.score.humanness !== undefined && <ScoreBar label="Humanness" score={result.score.humanness} />}
                                    {result.score.userValue !== undefined && <ScoreBar label="User Value" score={result.score.userValue} />}
                                    {result.score.competitive !== undefined && <ScoreBar label="Competitive" score={result.score.competitive} />}
                                </div>
                                {result.score.publishReadiness && (
                                    <div style={{ marginTop: 16, padding: '12px 16px', background: result.score.publishReadiness.decision === 'Publish Immediately' ? 'rgba(34,197,94,0.08)' : result.score.publishReadiness.decision === 'Reject' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${result.score.publishReadiness.decision === 'Publish Immediately' ? 'rgba(34,197,94,0.25)' : result.score.publishReadiness.decision === 'Reject' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: 'var(--radius-md)' }}>
                                        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                                            <Badge variant={result.score.publishReadiness.decision === 'Publish Immediately' ? 'success' : result.score.publishReadiness.decision === 'Reject' ? 'danger' : 'warning'}>
                                                {result.score.publishReadiness.decision}
                                            </Badge>
                                            <span className="text-sm text-muted">QC: {result.score.publishReadiness.overallQC}/10 · {result.score.publishReadiness.rankability.replace(/_/g, ' ')}</span>
                                        </div>
                                        {result.score.publishReadiness.improvements.length > 0 && (
                                            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                {result.score.publishReadiness.improvements.slice(0, 3).map((imp, i) => (
                                                    <div key={i} style={{ marginBottom: 2 }}>• {imp}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="card">
                                <div className="card-header">
                                    <h2 className="card-title">🔗 Smart Links</h2>
                                    <div className="flex gap-2">
                                        <Badge variant="info">Internal: {result.internalLinks?.length || 0}</Badge>
                                        <Badge variant="success">External: {result.externalLinks?.length || 0}</Badge>
                                    </div>
                                </div>
                                {result.internalLinks?.length > 0 && (
                                    <div style={{ marginBottom: 12 }}>
                                        <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>🏠 Internal</div>
                                        {result.internalLinks.slice(0, 5).map((link, i) => (
                                            <div key={i} style={{ padding: '6px 10px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: '0.85rem' }}>
                                                <span style={{ color: 'var(--accent-primary-light)' }}>&quot;{link.anchorText}&quot;</span>
                                                <span className="text-muted"> → {link.targetTitle}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {result.externalLinks?.length > 0 && (
                                    <div>
                                        <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>🌐 External</div>
                                        {result.externalLinks.slice(0, 5).map((link, i) => (
                                            <div key={i} style={{ padding: '6px 10px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: '0.85rem' }}>
                                                <span style={{ color: 'var(--accent-success)' }}>&quot;{link.anchorText}&quot;</span>
                                                <span className="text-muted"> → {link.targetTitle}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {(!result.internalLinks?.length && !result.externalLinks?.length) && (
                                    <p className="text-sm text-muted">No link suggestions generated. Select a site to enable internal linking.</p>
                                )}
                            </div>
                        </div>

                        {/* Content Editor */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="card-header">
                                <div>
                                    <h2 className="card-title">📝 Article Content</h2>
                                    <p className="card-subtitle">{isEditing ? 'Editing mode — your changes are auto-saved' : 'Click Edit to modify before publishing'}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(!isEditing)}>
                                        {isEditing ? '👁️ Preview' : '✏️ Edit'}
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={handleSaveToQueue} disabled={queueSaving}>
                                        {queueSaving ? '⏳...' : '📋 Add to Queue'}
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => handlePublish('draft')} disabled={publishing}>
                                        📥 Save Draft
                                    </button>
                                    <button className="btn btn-success btn-sm" onClick={() => handlePublish('publish')} disabled={publishing}>
                                        {publishing ? '⏳ Publishing...' : '🚀 Publish'}
                                    </button>
                                </div>
                            </div>

                            {/* Title Editor */}
                            <div style={{ marginBottom: 16 }}>
                                <label className="form-label">Article Title</label>
                                <input className="form-input" value={editedTitle} onChange={e => setEditedTitle(e.target.value)}
                                    style={{ fontSize: '1.1rem', fontWeight: 700 }} />
                            </div>

                            {/* Content Editor / Preview */}
                            {isEditing ? (
                                <textarea
                                    className="form-textarea"
                                    value={editedContent}
                                    onChange={e => setEditedContent(e.target.value)}
                                    style={{ minHeight: 500, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.6 }}
                                />
                            ) : (
                                <div style={{
                                    background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)',
                                    padding: '24px 32px', border: '1px solid var(--border-subtle)',
                                    maxHeight: 600, overflow: 'auto', lineHeight: 1.8,
                                }}>
                                    <div
                                        dangerouslySetInnerHTML={{ __html: editedContent }}
                                        style={{ fontSize: '0.95rem' }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Image SEO Tips */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="card-header">
                                <h2 className="card-title">🖼️ Image SEO Tips</h2>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                    <div className="flex items-center gap-2"><Badge variant="info">HERO</Badge><span className="text-sm" style={{ fontWeight: 500 }}>Add a featured image with alt=&quot;{keyword}&quot; — use a compressed WebP format (&lt;100KB)</span></div>
                                </div>
                                <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                    <div className="flex items-center gap-2"><Badge variant="success">ALT</Badge><span className="text-sm" style={{ fontWeight: 500 }}>Every image should have descriptive alt text with the target keyword naturally included</span></div>
                                </div>
                                <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                    <div className="flex items-center gap-2"><Badge variant="warning">FILE</Badge><span className="text-sm" style={{ fontWeight: 500 }}>Name image files descriptively: <code>{keyword.replace(/\s+/g, '-').toLowerCase()}-guide.webp</code></span></div>
                                </div>
                                <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius-sm)' }}>
                                    <div className="flex items-center gap-2"><Badge variant="info">INFOGRAPHIC</Badge><span className="text-sm" style={{ fontWeight: 500 }}>Add 2-3 custom infographics or comparison tables as images for snippet eligibility</span></div>
                                </div>
                            </div>
                        </div>

                        {/* Meta & Schema */}
                        <div className="grid-2" style={{ gap: 24 }}>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>🏷️ Meta Tags</h3>
                                <div style={{ marginBottom: 8 }}>
                                    <div className="text-sm text-muted">Meta Title</div>
                                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{result.content.metaTitle}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted">Meta Description</div>
                                    <div style={{ fontSize: '0.9rem' }}>{result.content.metaDescription}</div>
                                </div>
                            </div>
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>🏷️ Schema Markup</h3>
                                <pre style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: 12, overflow: 'auto', maxHeight: 200, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {JSON.stringify(result.content.schemaMarkup, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
