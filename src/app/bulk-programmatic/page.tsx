'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Template { id: string; name: string; niche: string; template_type: string; title_pattern: string; variable_columns: string[]; created_at: string; }
interface Batch { id: string; name: string; total_pages: number; generated_pages: number; status: string; created_at: string; }

const TEMPLATE_EXAMPLES = {
    city_service: { title: 'Best {service} in {city}, {state}', vars: ['city', 'state', 'service'], desc: 'Local SEO pages for service + location' },
    product_review: { title: '{product} Review: Is It Worth It in {year}?', vars: ['product', 'year', 'category'], desc: 'Product review pages at scale' },
    vs_comparison: { title: '{product_a} vs {product_b}: Which Is Better?', vars: ['product_a', 'product_b', 'category'], desc: 'Comparison pages for product pairs' },
    best_for_category: { title: 'Best {product} for {use_case} in {year}', vars: ['product', 'use_case', 'year'], desc: 'Best-of pages by use case' },
    how_to_with_variable: { title: 'How to {action} {object} in {timeframe}', vars: ['action', 'object', 'timeframe'], desc: 'How-to guides at scale' },
};

export default function BulkProgrammaticPage() {
    const toast = useToast();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [tab, setTab] = useState<'generate' | 'templates' | 'batches'>('generate');
    const [niche, setNiche] = useState('');
    const [templateType, setTemplateType] = useState('city_service');
    const [titlePattern, setTitlePattern] = useState('Best {service} in {city}, {state}');
    const [csvData, setCsvData] = useState('');
    const [wordCount, setWordCount] = useState('600');
    const [siteId, setSiteId] = useState('');
    const [autoSave, setAutoSave] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatedPages, setGeneratedPages] = useState<Array<{ title: string; slug: string; word_count: number; meta_description: string }>>([]);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await fetch('/api/bulk-programmatic');
        const data = await res.json();
        setTemplates(data.templates || []);
        setBatches(data.batches || []);
    };

    const parseCsv = (csv: string): Array<Record<string, string>> => {
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

    const generate = async () => {
        if (!niche || !titlePattern || !csvData) { toast.warning('Fill niche, title pattern, and CSV data'); return; }
        const rows = parseCsv(csvData);
        if (!rows.length) { toast.warning('CSV data is empty or invalid'); return; }
        setGenerating(true);
        const res = await fetch('/api/bulk-programmatic', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_from_csv', niche, template_type: templateType, title_pattern: titlePattern, rows: rows.slice(0, 50), word_count_per_page: parseInt(wordCount), site_id: siteId || undefined, auto_save_posts: autoSave }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setGeneratedPages(data.generated || []);
            toast.success(`Generated ${data.count} pages${autoSave && siteId ? ' + saved as drafts' : ''}`);
            load();
        }
        setGenerating(false);
    };

    const exampleCsv = TEMPLATE_EXAMPLES[templateType as keyof typeof TEMPLATE_EXAMPLES];
    const exampleData = exampleCsv?.vars.join(',') + '\n' + exampleCsv?.vars.map(v => `example_${v}`).join(',');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Programmatic SEO Bulk Generator</h1>
                        <p className="page-description">Upload CSV → generate 50+ pages at once. City pages, product reviews, comparisons at scale.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['generate', 'templates', 'batches'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                        ))}
                    </div>
                </div>

                {tab === 'generate' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche *</label>
                                    <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="local services, finance, tech..." />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Template Type</label>
                                    <select className="form-input" value={templateType} onChange={e => {
                                        setTemplateType(e.target.value);
                                        const ex = TEMPLATE_EXAMPLES[e.target.value as keyof typeof TEMPLATE_EXAMPLES];
                                        if (ex) setTitlePattern(ex.title);
                                    }}>
                                        {Object.entries(TEMPLATE_EXAMPLES).map(([k, v]) => <option key={k} value={k}>{v.desc}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Title Pattern * <span className="text-muted text-sm">(use {'{variable}'} placeholders)</span></label>
                                    <input className="form-input" value={titlePattern} onChange={e => setTitlePattern(e.target.value)} placeholder="Best {service} in {city}" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Words per Page</label>
                                    <select className="form-input" value={wordCount} onChange={e => setWordCount(e.target.value)}>
                                        {['300', '500', '600', '800', '1000', '1500'].map(n => <option key={n} value={n}>{n} words</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Site ID <span className="text-muted text-sm">(for auto-save)</span></label>
                                    <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites" />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">CSV Data * <span className="text-muted text-sm">(first row = column headers matching {'{placeholder}'} names)</span></label>
                                <div style={{ padding: '6px 10px', background: '#eff6ff', borderRadius: 4, marginBottom: 6 }}>
                                    <div className="text-sm text-muted">Example for this template:</div>
                                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{exampleData}</code>
                                </div>
                                <textarea className="form-input" rows={8} value={csvData} onChange={e => setCsvData(e.target.value)} placeholder={exampleData} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }} />
                                <div className="text-sm text-muted" style={{ marginTop: 4 }}>{parseCsv(csvData).length} rows detected (max 50)</div>
                            </div>

                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <button className="btn btn-primary" onClick={generate} disabled={generating} style={{ minWidth: 160 }}>
                                    {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating pages...</> : `🚀 Generate ${parseCsv(csvData).length || 0} Pages`}
                                </button>
                                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} disabled={!siteId} />
                                    <span className="text-sm">Auto-save as drafts</span>
                                </label>
                            </div>
                        </div>

                        {generatedPages.length > 0 && (
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Generated {generatedPages.length} Pages</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {generatedPages.map((p, i) => (
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

                {tab === 'batches' && (
                    batches.length === 0 ? <EmptyState icon="📄" title="No batches yet" description="Generate your first batch of programmatic pages" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {batches.map((b, i) => (
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
            </main>
        </div>
    );
}
