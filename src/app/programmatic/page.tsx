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

// From /bulk-programmatic
interface Template { id: string; name: string; niche: string; template_type: string; title_pattern: string; variable_columns: string[]; created_at: string; }
interface Batch { id: string; name: string; total_pages: number; generated_pages: number; status: string; created_at: string; }

const TEMPLATE_EXAMPLES = {
    city_service: { title: 'Best {service} in {city}, {state}', vars: ['city', 'state', 'service'], desc: 'Local SEO pages for service + location' },
    product_review: { title: '{product} Review: Is It Worth It in {year}?', vars: ['product', 'year', 'category'], desc: 'Product review pages at scale' },
    vs_comparison: { title: '{product_a} vs {product_b}: Which Is Better?', vars: ['product_a', 'product_b', 'category'], desc: 'Comparison pages for product pairs' },
    best_for_category: { title: 'Best {product} for {use_case} in {year}', vars: ['product', 'use_case', 'year'], desc: 'Best-of pages by use case' },
    how_to_with_variable: { title: 'How to {action} {object} in {timeframe}', vars: ['action', 'object', 'timeframe'], desc: 'How-to guides at scale' },
};

export default function ProgrammaticSEOPage() {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<string>('main');
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

    // Bulk Generator state
    const [bulkTemplates, setBulkTemplates] = useState<Template[]>([]);
    const [bulkBatches, setBulkBatches] = useState<Batch[]>([]);
    const [bulkTab, setBulkTab] = useState<'generate' | 'templates' | 'batches'>('generate');
    const [bulkNiche, setBulkNiche] = useState('');
    const [bulkTemplateType, setBulkTemplateType] = useState('city_service');
    const [bulkTitlePattern, setBulkTitlePattern] = useState('Best {service} in {city}, {state}');
    const [bulkCsvData, setBulkCsvData] = useState('');
    const [bulkWordCount, setBulkWordCount] = useState('600');
    const [bulkSiteId, setBulkSiteId] = useState('');
    const [bulkAutoSave, setBulkAutoSave] = useState(true);
    const [bulkGenerating, setBulkGenerating] = useState(false);
    const [bulkGeneratedPages, setBulkGeneratedPages] = useState<Array<{ title: string; slug: string; word_count: number; meta_description: string }>>([]);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    useEffect(() => { if (activeTab === 'bulk') loadBulk(); }, [activeTab]);

    // Bulk load
    const loadBulk = async () => {
        const res = await fetch('/api/bulk-programmatic');
        const data = await res.json();
        setBulkTemplates(data.templates || []);
        setBulkBatches(data.batches || []);
    };

    const bulkParseCsv = (csv: string): Array<Record<string, string>> => {
        const lines = csv.trim().split('\n').filter(Boolean);
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        return lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const row: Record<string, string> = {};
            headers.forEach((h, i) => { row[h] = vals[i] || ''; });
            return row;
        });
    };

    const bulkGenerate = async () => {
        if (!bulkNiche || !bulkTitlePattern || !bulkCsvData) { toast.warning('Fill niche, title pattern, and CSV data'); return; }
        const rows = bulkParseCsv(bulkCsvData);
        if (!rows.length) { toast.warning('CSV data is empty or invalid'); return; }
        setBulkGenerating(true);
        const res = await fetch('/api/bulk-programmatic', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_from_csv', niche: bulkNiche, template_type: bulkTemplateType, title_pattern: bulkTitlePattern, rows: rows.slice(0, 50), word_count_per_page: parseInt(bulkWordCount), site_id: bulkSiteId || undefined, auto_save_posts: bulkAutoSave }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setBulkGeneratedPages(data.generated || []);
            toast.success(`Generated ${data.count} pages${bulkAutoSave && bulkSiteId ? ' + saved as drafts' : ''}`);
            loadBulk();
        }
        setBulkGenerating(false);
    };

    const bulkExampleCsv = TEMPLATE_EXAMPLES[bulkTemplateType as keyof typeof TEMPLATE_EXAMPLES];
    const bulkExampleData = bulkExampleCsv?.vars.join(',') + '\n' + bulkExampleCsv?.vars.map(v => `example_${v}`).join(',');

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

                title = title.replace(/\{\{Year\}\}/gi, year);
                meta = meta.replace(/\{\{Year\}\}/gi, year);

                const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const keyword = Object.values(row).join(' ').toLowerCase().substring(0, 60);

                generated.push({ title, slug, keyword, metaDescription: meta, variables: vars });
            }
        } else {
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

                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>⚡ Page Generator</button>
                    <button className={`btn ${activeTab === 'bulk' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('bulk')}>🚀 Bulk Generator</button>
                </div>

                {activeTab === 'main' && (
                    <>
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
                    </>
                )}

                {activeTab === 'bulk' && (
                    <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                            {(['generate', 'templates', 'batches'] as const).map(t => (
                                <button key={t} className={`btn btn-sm ${bulkTab === t ? 'btn-primary' : ''}`} onClick={() => setBulkTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                            ))}
                        </div>

                        {bulkTab === 'generate' && (
                            <>
                                <div className="card" style={{ marginBottom: 16 }}>
                                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Niche *</label>
                                            <input className="form-input" value={bulkNiche} onChange={e => setBulkNiche(e.target.value)} placeholder="local services, finance, tech..." />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Template Type</label>
                                            <select className="form-input" value={bulkTemplateType} onChange={e => {
                                                setBulkTemplateType(e.target.value);
                                                const ex = TEMPLATE_EXAMPLES[e.target.value as keyof typeof TEMPLATE_EXAMPLES];
                                                if (ex) setBulkTitlePattern(ex.title);
                                            }}>
                                                {Object.entries(TEMPLATE_EXAMPLES).map(([k, v]) => <option key={k} value={k}>{v.desc}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Title Pattern * <span className="text-muted text-sm">(use {'{variable}'} placeholders)</span></label>
                                            <input className="form-input" value={bulkTitlePattern} onChange={e => setBulkTitlePattern(e.target.value)} placeholder="Best {service} in {city}" />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Words per Page</label>
                                            <select className="form-input" value={bulkWordCount} onChange={e => setBulkWordCount(e.target.value)}>
                                                {['300', '500', '600', '800', '1000', '1500'].map(n => <option key={n} value={n}>{n} words</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Site ID <span className="text-muted text-sm">(for auto-save)</span></label>
                                            <input className="form-input" value={bulkSiteId} onChange={e => setBulkSiteId(e.target.value)} placeholder="UUID from Sites" />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">CSV Data * <span className="text-muted text-sm">(first row = column headers matching {'{placeholder}'} names)</span></label>
                                        <div style={{ padding: '6px 10px', background: '#eff6ff', borderRadius: 4, marginBottom: 6 }}>
                                            <div className="text-sm text-muted">Example for this template:</div>
                                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{bulkExampleData}</code>
                                        </div>
                                        <textarea className="form-input" rows={8} value={bulkCsvData} onChange={e => setBulkCsvData(e.target.value)} placeholder={bulkExampleData} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }} />
                                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>{bulkParseCsv(bulkCsvData).length} rows detected (max 50)</div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <button className="btn btn-primary" onClick={bulkGenerate} disabled={bulkGenerating} style={{ minWidth: 160 }}>
                                            {bulkGenerating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating pages...</> : `🚀 Generate ${bulkParseCsv(bulkCsvData).length || 0} Pages`}
                                        </button>
                                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={bulkAutoSave} onChange={e => setBulkAutoSave(e.target.checked)} disabled={!bulkSiteId} />
                                            <span className="text-sm">Auto-save as drafts</span>
                                        </label>
                                    </div>
                                </div>

                                {bulkGeneratedPages.length > 0 && (
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 12 }}>Generated {bulkGeneratedPages.length} Pages</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {bulkGeneratedPages.map((p, i) => (
                                                <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{p.title}</div>
                                                        <div className="text-sm text-muted">/{p.slug} · {p.word_count}w</div>
                                                    </div>
                                                    <Badge variant="success">Generated</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {bulkTab === 'batches' && (
                            bulkBatches.length === 0 ? <EmptyState icon="📄" title="No batches yet" description="Generate your first batch of programmatic pages" /> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {bulkBatches.map((b, i) => (
                                        <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{b.name}</div>
                                                <div className="text-sm text-muted">{b.generated_pages}/{b.total_pages} pages · {new Date(b.created_at).toLocaleDateString()}</div>
                                            </div>
                                            <Badge variant={b.status === 'completed' ? 'success' : 'warning'}>{b.status}</Badge>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
