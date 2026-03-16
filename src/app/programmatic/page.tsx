'use client';

import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site { id: string; name: string; url: string; }

interface GeneratedPage {
    title: string;
    slug: string;
    keyword: string;
    metaDescription: string;
    variables: Record<string, string>;
    duplicate?: boolean;
}

export default function ProgrammaticSEOPage() {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [template, setTemplate] = useState('Best {{Topic}} in {{Location}}');
    const [metaTemplate, setMetaTemplate] = useState('Discover the best {{Topic}} in {{Location}}. Expert reviews, comparisons & top picks for {{Year}}.');
    const [topics, setTopics] = useState('');
    const [locations, setLocations] = useState('');
    const [pages, setPages] = useState<GeneratedPage[]>([]);
    const [loading, setLoading] = useState(false);
    const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0, active: false });
    const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [mode, setMode] = useState<'manual' | 'csv'>('manual');

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    // Parse CSV file
    const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) { toast.warning('CSV needs at least a header and one row'); return; }

            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            setCsvHeaders(headers);

            const rows: Record<string, string>[] = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                const row: Record<string, string> = {};
                headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
                rows.push(row);
            }

            setCsvData(rows);
            setMode('csv');
            toast.success(`Loaded ${rows.length} rows with ${headers.length} columns`);

            // Auto-suggest template with CSV headers
            if (!template.includes('{{')) {
                const suggestedTemplate = headers.map(h => `{{${h}}}`).join(' ');
                setTemplate(`Best ${suggestedTemplate}`);
            }
        };
        reader.readAsText(file);
    };

    // Generate pages from template + data
    const handleGenerate = () => {
        if (!template.trim()) { toast.warning('Enter a title template'); return; }

        const generated: GeneratedPage[] = [];
        const year = new Date().getFullYear().toString();

        if (mode === 'csv' && csvData.length > 0) {
            // CSV mode: one page per row
            for (const row of csvData) {
                let title = template;
                let meta = metaTemplate;
                const vars: Record<string, string> = { Year: year };

                for (const [key, value] of Object.entries(row)) {
                    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
                    title = title.replace(regex, value);
                    meta = meta.replace(regex, value);
                    vars[key] = value;
                }

                // Replace {{Year}}
                title = title.replace(/\{\{Year\}\}/gi, year);
                meta = meta.replace(/\{\{Year\}\}/gi, year);

                const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const keyword = Object.values(row).join(' ').toLowerCase().substring(0, 60);

                generated.push({ title, slug, keyword, metaDescription: meta, variables: vars });
            }
        } else {
            // Manual mode: Topic × Location matrix
            const topicList = topics.split('\n').map(t => t.trim()).filter(Boolean);
            const locationList = locations.split('\n').map(l => l.trim()).filter(Boolean);

            if (topicList.length === 0) { toast.warning('Enter at least one topic'); return; }

            for (const topic of topicList) {
                if (locationList.length > 0) {
                    for (const location of locationList) {
                        let title = template.replace(/\{\{Topic\}\}/gi, topic).replace(/\{\{Location\}\}/gi, location).replace(/\{\{Year\}\}/gi, year);
                        let meta = metaTemplate.replace(/\{\{Topic\}\}/gi, topic).replace(/\{\{Location\}\}/gi, location).replace(/\{\{Year\}\}/gi, year);
                        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                        generated.push({
                            title, slug, keyword: `${topic.toLowerCase()} ${location.toLowerCase()}`,
                            metaDescription: meta, variables: { Topic: topic, Location: location, Year: year },
                        });
                    }
                } else {
                    let title = template.replace(/\{\{Topic\}\}/gi, topic).replace(/\{\{Location\}\}/gi, '').replace(/\{\{Year\}\}/gi, year);
                    let meta = metaTemplate.replace(/\{\{Topic\}\}/gi, topic).replace(/\{\{Location\}\}/gi, '').replace(/\{\{Year\}\}/gi, year);
                    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    generated.push({
                        title, slug, keyword: topic.toLowerCase(),
                        metaDescription: meta, variables: { Topic: topic, Year: year },
                    });
                }
            }
        }

        // Deduplication check
        const titleSet = new Set<string>();
        for (const page of generated) {
            const normalized = page.title.toLowerCase().replace(/\s+/g, ' ');
            if (titleSet.has(normalized)) {
                page.duplicate = true;
            }
            titleSet.add(normalized);
        }

        const dupeCount = generated.filter(p => p.duplicate).length;
        setPages(generated);

        if (dupeCount > 0) {
            toast.warning(`Generated ${generated.length} pages (${dupeCount} duplicates detected)`);
        } else {
            toast.success(`Generated ${generated.length} unique page templates!`);
        }
    };

    // Bulk queue with progress
    const handleBulkQueue = async () => {
        const validPages = pages.filter(p => !p.duplicate);
        if (!selectedSite || validPages.length === 0) { toast.warning('Generate pages and select a site first'); return; }

        const batch = validPages.slice(0, 100);
        setLoading(true);
        setQueueProgress({ current: 0, total: batch.length, active: true });
        let queued = 0;

        try {
            for (let i = 0; i < batch.length; i++) {
                const page = batch[i];
                const res = await fetch('/api/queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        site_id: selectedSite,
                        title: page.title,
                        keyword: page.keyword,
                        slug: page.slug,
                        meta_description: page.metaDescription,
                        status: 'draft',
                        priority: 'medium',
                    }),
                });
                if (res.ok) queued++;
                setQueueProgress({ current: i + 1, total: batch.length, active: true });
            }
            toast.success(`Queued ${queued} pages for content generation!`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Queue failed');
        } finally {
            setLoading(false);
            setQueueProgress({ current: 0, total: 0, active: false });
        }
    };

    const uniquePages = pages.filter(p => !p.duplicate).length;
    const dupePages = pages.filter(p => p.duplicate).length;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Programmatic SEO</h1>
                        <p className="page-description">Generate hundreds of targeted pages from templates and data sources</p>
                    </div>
                </div>

                {/* Mode Tabs */}
                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
                        📝 Manual Input
                    </button>
                    <button className={`tab ${mode === 'csv' ? 'active' : ''}`} onClick={() => setMode('csv')}>
                        📊 CSV Import {csvData.length > 0 && `(${csvData.length} rows)`}
                    </button>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    {/* Template config */}
                    <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Title Template</label>
                            <input className="form-input" value={template} onChange={e => setTemplate(e.target.value)}
                                placeholder="Best {{Topic}} in {{Location}}" />
                            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                Variables: <code>{'{{Topic}}'}</code> <code>{'{{Location}}'}</code> <code>{'{{Year}}'}</code>
                                {csvHeaders.length > 0 && <> + CSV: {csvHeaders.map(h => <code key={h} style={{ marginLeft: 4 }}>{`{{${h}}}`}</code>)}</>}
                            </div>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Meta Description Template</label>
                            <input className="form-input" value={metaTemplate} onChange={e => setMetaTemplate(e.target.value)}
                                placeholder="Discover the best {{Topic}} in {{Location}}..." />
                        </div>
                    </div>

                    <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Site</label>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Data Source</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload}
                                    style={{ display: 'none' }} />
                                <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                                    📁 Upload CSV
                                </button>
                                {csvData.length > 0 && (
                                    <Badge variant="success">{csvData.length} rows loaded</Badge>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Manual input mode */}
                    {mode === 'manual' && (
                        <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Topics (one per line)</label>
                                <textarea className="form-input" rows={6} value={topics} onChange={e => setTopics(e.target.value)}
                                    placeholder={"SEO Agency\nDigital Marketing\nWeb Design\nContent Writing"} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Locations (one per line, optional)</label>
                                <textarea className="form-input" rows={6} value={locations} onChange={e => setLocations(e.target.value)}
                                    placeholder={"New York\nLondon\nTokyo\nSydney"} />
                            </div>
                        </div>
                    )}

                    {/* CSV preview */}
                    {mode === 'csv' && csvData.length > 0 && (
                        <div style={{ marginBottom: 16, maxHeight: 200, overflow: 'auto' }}>
                            <label className="form-label">CSV Preview (first 5 rows)</label>
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            {csvHeaders.map(h => <th key={h}>{h}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {csvData.slice(0, 5).map((row, i) => (
                                            <tr key={i}>
                                                {csvHeaders.map(h => <td key={h} className="text-sm">{row[h]}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {csvData.length > 5 && (
                                <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                    + {csvData.length - 5} more rows
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-primary" onClick={handleGenerate}>
                            ⚡ Generate {mode === 'csv' ? csvData.length :
                                topics.split('\n').filter(Boolean).length * Math.max(locations.split('\n').filter(Boolean).length, 1)} Pages
                        </button>
                        {pages.length > 0 && (
                            <button className="btn btn-success" onClick={handleBulkQueue} disabled={loading}>
                                {loading ? (
                                    <>
                                        <span className="spinner" style={{ width: 16, height: 16 }} />
                                        {queueProgress.current}/{queueProgress.total}
                                    </>
                                ) : `📤 Queue ${Math.min(uniquePages, 100)} to Publish`}
                            </button>
                        )}
                    </div>

                    {/* Progress bar */}
                    {queueProgress.active && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{
                                height: 6, borderRadius: 3,
                                background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%', borderRadius: 3,
                                    background: 'var(--accent-primary)',
                                    width: `${(queueProgress.current / queueProgress.total) * 100}%`,
                                    transition: 'width 0.3s',
                                }} />
                            </div>
                            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                Queueing page {queueProgress.current} of {queueProgress.total}...
                            </div>
                        </div>
                    )}
                </div>

                {/* Results */}
                {pages.length > 0 && (
                    <>
                        <div className="grid-4" style={{ marginBottom: 16 }}>
                            <StatCard label="Pages Generated" value={pages.length} icon="📄" />
                            <StatCard label="Unique Pages" value={uniquePages} icon="✅" />
                            <StatCard label="Duplicates" value={dupePages} icon="⚠️" />
                            <StatCard label="Keywords" value={new Set(pages.map(p => p.keyword)).size} icon="🔑" />
                        </div>

                        <div className="card">
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Title</th>
                                            <th>Slug</th>
                                            <th>Keyword</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pages.slice(0, 100).map((p, i) => (
                                            <tr key={i} style={p.duplicate ? { opacity: 0.4 } : {}}>
                                                <td className="text-muted">{i + 1}</td>
                                                <td style={{ fontWeight: 500 }}>{p.title}</td>
                                                <td className="text-sm font-mono text-muted">/{p.slug}</td>
                                                <td><Badge variant="neutral">{p.keyword.substring(0, 30)}</Badge></td>
                                                <td>
                                                    {p.duplicate ? (
                                                        <Badge variant="danger">Duplicate</Badge>
                                                    ) : (
                                                        <Badge variant="success">Unique</Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {pages.length > 100 && (
                                <div className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 8 }}>
                                    Showing first 100 of {pages.length} pages
                                </div>
                            )}
                        </div>
                    </>
                )}

                {pages.length === 0 && (
                    <div className="card">
                        <EmptyState icon="⚡" title="No Pages Generated"
                            description="Enter topics manually or upload a CSV to generate programmatic SEO pages from your template." />
                    </div>
                )}
            </main>
        </div>
    );
}
