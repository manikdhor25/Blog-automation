'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface GlossaryEntry {
    term: string;
    slug: string;
    definition: string;
    expanded_explanation: string;
    related_terms: string[];
    example?: string;
    affiliate_angle?: string;
}

interface GlossaryResult {
    niche: string;
    total_terms: number;
    entries: GlossaryEntry[];
    links_injected: number;
    wp_published: boolean;
    provider: string;
}

interface SavedGlossary { id: string; niche: string; term_count: number; created_at: string; }

export default function GlossaryPage() {
    const toast = useToast();
    const [niche, setNiche] = useState('');
    const [termCount, setTermCount] = useState('20');
    const [siteId, setSiteId] = useState('');
    const [publishToWp, setPublishToWp] = useState(false);
    const [result, setResult] = useState<GlossaryResult | null>(null);
    const [saved, setSaved] = useState<SavedGlossary[]>([]);
    const [generating, setGenerating] = useState(false);
    const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => { loadSaved(); }, []);

    const loadSaved = async () => {
        const res = await fetch('/api/glossary');
        const data = await res.json();
        setSaved(data.glossaries || []);
    };

    const generate = async () => {
        if (!niche) { toast.warning('Enter niche'); return; }
        setGenerating(true);
        const res = await fetch('/api/glossary', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ niche, term_count: parseInt(termCount), site_id: siteId || undefined, publish_to_wp: publishToWp }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setResult(data.result);
        toast.success(`Generated ${data.result.total_terms} terms${data.result.wp_published ? ' + published to WP' : ''}`);
        loadSaved();
        setGenerating(false);
    };

    const filteredEntries = result?.entries.filter(e =>
        e.term.toLowerCase().includes(search.toLowerCase()) ||
        e.definition.toLowerCase().includes(search.toLowerCase())
    ) || [];

    const exportCsv = () => {
        if (!result) return;
        const csv = ['Term,Slug,Definition,Related Terms'].concat(
            result.entries.map(e => `"${e.term}","${e.slug}","${e.definition.replace(/"/g, '""')}","${e.related_terms.join(';')}"`)
        ).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${niche}-glossary.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Glossary / Wiki Builder</h1>
                        <p className="page-description">Auto-generate niche glossaries, inject internal links, publish to WordPress as SEO hub pages</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche *</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance, fitness, crypto..." />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Number of Terms</label>
                            <select className="form-input" value={termCount} onChange={e => setTermCount(e.target.value)}>
                                <option value="10">10 terms</option>
                                <option value="20">20 terms</option>
                                <option value="30">30 terms</option>
                                <option value="50">50 terms</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Site ID <span className="text-muted text-sm">(for WP publish)</span></label>
                            <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites page" />
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" checked={publishToWp} onChange={e => setPublishToWp(e.target.checked)} />
                                <span className="text-sm">Auto-publish to WordPress</span>
                            </label>
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={generate} disabled={generating}>
                        {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : '📖 Generate Glossary'}
                    </button>
                </div>

                {result && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <Badge variant="info">{result.total_terms} terms</Badge>
                                {result.links_injected > 0 && <Badge variant="success">{result.links_injected} links injected</Badge>}
                                {result.wp_published && <Badge variant="success">Published to WP</Badge>}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search terms..." style={{ width: 180 }} />
                                <button className="btn btn-sm" onClick={exportCsv}>📥 Export CSV</button>
                            </div>
                        </div>

                        <div className="card">
                            {filteredEntries.length === 0 ? (
                                <div className="text-sm text-muted" style={{ padding: 20, textAlign: 'center' }}>No terms match search</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {filteredEntries.map((entry, i) => (
                                        <div key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            <div
                                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer' }}
                                                onClick={() => setExpandedTerm(expandedTerm === entry.term ? null : entry.term)}
                                            >
                                                <div>
                                                    <span style={{ fontWeight: 700 }}>{entry.term}</span>
                                                    <span className="text-sm text-muted" style={{ marginLeft: 8 }}>/{entry.slug}</span>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{expandedTerm === entry.term ? '▲' : '▼'}</span>
                                            </div>
                                            {expandedTerm !== entry.term && (
                                                <div className="text-sm text-muted" style={{ padding: '0 12px 10px' }}>{entry.definition}</div>
                                            )}
                                            {expandedTerm === entry.term && (
                                                <div style={{ padding: '0 12px 12px' }}>
                                                    <div className="text-sm" style={{ marginBottom: 8 }}>{entry.expanded_explanation}</div>
                                                    {entry.example && (
                                                        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 8 }}>
                                                            <div className="form-label">Example</div>
                                                            <div className="text-sm">{entry.example}</div>
                                                        </div>
                                                    )}
                                                    {entry.affiliate_angle && (
                                                        <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 4, marginBottom: 8 }}>
                                                            <div className="form-label">💰 Affiliate Angle</div>
                                                            <div className="text-sm">{entry.affiliate_angle}</div>
                                                        </div>
                                                    )}
                                                    {entry.related_terms.length > 0 && (
                                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                            {entry.related_terms.map((t, ri) => (
                                                                <span key={ri} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem', cursor: 'pointer' }}
                                                                    onClick={e => { e.stopPropagation(); setSearch(t); }}>{t}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {saved.length > 0 && !result && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Previous Glossaries</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {saved.map((g, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                    <div>
                                        <span style={{ fontWeight: 600 }}>{g.niche}</span>
                                        <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{g.term_count} terms</span>
                                    </div>
                                    <span className="text-sm text-muted">{new Date(g.created_at).toLocaleDateString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!result && saved.length === 0 && !generating && (
                    <EmptyState icon="📖" title="No glossaries yet" description="Generate a niche glossary to create SEO hub pages and internal linking opportunities" />
                )}
            </main>
        </div>
    );
}
