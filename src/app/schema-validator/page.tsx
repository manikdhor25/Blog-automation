'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface ValidationResult { valid: boolean; errors: Array<{ field: string; severity: string; message: string }>; warnings: string[]; suggestions: string[]; rich_result_eligible: boolean; schema_type?: string; google_test_url?: string; }

const SCHEMA_TYPES = ['Article', 'HowTo', 'FAQPage', 'Review', 'Product', 'BreadcrumbList', 'Organization', 'WebSite', 'VideoObject', 'Recipe'];

export default function SchemaValidatorPage() {
    const toast = useToast();
    const [schemaJson, setSchemaJson] = useState('');
    const [postUrl, setPostUrl] = useState('');
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [validating, setValidating] = useState(false);
    const [tab, setTab] = useState<'validate' | 'generate'>('validate');
    const [genType, setGenType] = useState('Article');
    const [genData, setGenData] = useState('');
    const [generated, setGenerated] = useState('');
    const [generating, setGenerating] = useState(false);

    const validate = async () => {
        if (!schemaJson.trim()) { toast.warning('Paste schema JSON first'); return; }
        setValidating(true);
        const res = await fetch('/api/schema-validator', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'validate', schema_json: schemaJson, post_url: postUrl || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setValidating(false); return; }
        setResult(data);
        toast[data.valid ? 'success' : 'warning'](`Schema ${data.valid ? 'valid' : 'has errors'} — ${data.errors.length} errors, ${data.warnings.length} warnings`);
        setValidating(false);
    };

    const generate = async () => {
        let dataObj;
        try { dataObj = genData ? JSON.parse(genData) : {}; } catch { toast.error('Invalid JSON in data field'); return; }
        setGenerating(true);
        const res = await fetch('/api/schema-validator', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', schema_type: genType, data: dataObj }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setGenerated(data.schema_string);
            toast.success(`Generated ${genType} schema via ${data.provider}`);
        }
        setGenerating(false);
    };

    const EXAMPLE_DATA: Record<string, string> = {
        Article: '{"headline": "Best Standing Desks 2025", "author": "John Smith", "datePublished": "2025-01-01", "image": "https://example.com/img.jpg"}',
        HowTo: '{"name": "How to Set Up a Standing Desk", "estimatedCost": "$500", "totalTime": "PT30M", "steps": ["Unbox", "Assemble", "Adjust height"]}',
        Product: '{"name": "FlexiSpot E7", "description": "Height adjustable desk", "price": "499.99", "currency": "USD", "availability": "InStock"}',
        Review: '{"itemName": "FlexiSpot E7 Desk", "ratingValue": 4.5, "bestRating": 5, "author": "John Smith"}',
        FAQPage: '{"faqs": [{"question": "What is a standing desk?", "answer": "A desk that adjusts height..."}]}',
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Schema Markup Validator</h1>
                        <p className="page-description">Validate JSON-LD schema, check for errors, generate new schema for rich results</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['validate', 'generate'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
                        ))}
                    </div>
                </div>

                {tab === 'validate' && (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        <div className="card">
                            <div className="form-group">
                                <label className="form-label">Schema JSON-LD *</label>
                                <textarea className="form-input" rows={16} value={schemaJson} onChange={e => setSchemaJson(e.target.value)} placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "...\n}'} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Post URL <span className="text-muted text-sm">(for Google test link)</span></label>
                                <input className="form-input" value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://yourblog.com/post-slug" />
                            </div>
                            <button className="btn btn-primary" onClick={validate} disabled={validating}>{validating ? 'Validating...' : '✅ Validate Schema'}</button>
                        </div>

                        <div>
                            {result && (
                                <div className="card animate-in">
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: result.valid ? '#f0fdf4' : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                                            {result.valid ? '✅' : '❌'}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{result.valid ? 'Valid Schema' : 'Schema Has Errors'}</div>
                                            {result.schema_type && <div className="text-sm text-muted">Type: {result.schema_type}</div>}
                                        </div>
                                        {result.rich_result_eligible && <Badge variant="success">Rich Result Eligible ⭐</Badge>}
                                    </div>

                                    {result.errors.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>🚨 Errors ({result.errors.length})</div>
                                            {result.errors.map((e, i) => (
                                                <div key={i} style={{ padding: '6px 10px', background: '#fef2f2', borderRadius: 4, marginBottom: 4 }}>
                                                    <div className="text-sm" style={{ fontWeight: 600 }}>{e.message}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#dc2626' }}>Field: {e.field}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {result.warnings.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            <div style={{ fontWeight: 700, color: '#d97706', marginBottom: 6 }}>⚠️ Warnings</div>
                                            {result.warnings.map((w, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}>• {w}</div>)}
                                        </div>
                                    )}

                                    {result.suggestions.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            <div style={{ fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>💡 Suggestions</div>
                                            {result.suggestions.map((s, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}>• {s}</div>)}
                                        </div>
                                    )}

                                    {result.google_test_url && (
                                        <a href={result.google_test_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary" style={{ display: 'inline-block' }}>🔎 Test in Google Rich Results</a>
                                    )}
                                </div>
                            )}
                            {!result && !validating && <EmptyState icon="📋" title="Paste schema to validate" description="Checks for required fields, type-specific issues, and rich result eligibility" />}
                        </div>
                    </div>
                )}

                {tab === 'generate' && (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        <div className="card">
                            <div className="form-group">
                                <label className="form-label">Schema Type</label>
                                <select className="form-input" value={genType} onChange={e => { setGenType(e.target.value); setGenData(EXAMPLE_DATA[e.target.value] || ''); }}>
                                    {SCHEMA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Your Data (JSON) <span className="text-muted text-sm">(AI fills in the rest)</span></label>
                                <textarea className="form-input" rows={8} value={genData} onChange={e => setGenData(e.target.value)} placeholder={EXAMPLE_DATA[genType] || '{}'} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }} />
                            </div>
                            <button className="btn btn-primary" onClick={generate} disabled={generating}>{generating ? 'Generating...' : '⚡ Generate Schema'}</button>
                        </div>

                        <div className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <div className="form-label">{genType} Schema Output</div>
                                {generated && (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(generated); toast.success('Copied'); }}>📋 Copy</button>
                                        <button className="btn btn-sm" onClick={() => { setSchemaJson(generated); setTab('validate'); }}>✅ Validate</button>
                                    </div>
                                )}
                            </div>
                            {generated ? (
                                <textarea className="form-input" rows={18} value={generated} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }} />
                            ) : (
                                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
                                        <div className="text-sm">Generated schema appears here</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
