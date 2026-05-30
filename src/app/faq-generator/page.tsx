'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface FaqResult { faqs: Array<{ question: string; answer: string }>; schema_json: string; html_snippet: string; }

export default function FaqGeneratorPage() {
    const toast = useToast();
    const [keyword, setKeyword] = useState('');
    const [niche, setNiche] = useState('');
    const [content, setContent] = useState('');
    const [faqCount, setFaqCount] = useState('7');
    const [result, setResult] = useState<FaqResult | null>(null);
    const [generating, setGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState<'faqs' | 'schema' | 'html'>('faqs');

    const generate = async () => {
        if (!keyword) { toast.warning('Enter target keyword'); return; }
        setGenerating(true);
        const res = await fetch('/api/faq-generator', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate', keyword, niche: niche || undefined, content: content || undefined, faq_count: parseInt(faqCount), include_schema: true }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setGenerating(false); return; }
        setResult(data.result);
        toast.success(`Generated ${data.result.faqs?.length} FAQs`);
        setGenerating(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">FAQ Schema Generator</h1>
                        <p className="page-description">Generate PAA-optimized FAQs + JSON-LD schema markup for SERP feature wins</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Target Keyword *</label>
                            <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desks" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="home office" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Number of FAQs</label>
                            <select className="form-input" value={faqCount} onChange={e => setFaqCount(e.target.value)}>
                                {['3', '5', '7', '10', '12', '15'].map(n => <option key={n} value={n}>{n} FAQs</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Post Content <span className="text-muted text-sm">(optional, improves relevance)</span></label>
                        <textarea className="form-input" rows={4} value={content} onChange={e => setContent(e.target.value)} placeholder="Paste post content for context..." style={{ fontFamily: 'inherit' }} />
                    </div>
                    <button className="btn btn-primary" onClick={generate} disabled={generating}>{generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : '❓ Generate FAQs'}</button>
                </div>

                {result && (
                    <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                            {(['faqs', 'schema', 'html'] as const).map(t => (
                                <button key={t} className={`btn btn-sm ${activeTab === t ? 'btn-primary' : ''}`} onClick={() => setActiveTab(t)} style={{ textTransform: 'uppercase' }}>{t}</button>
                            ))}
                            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(activeTab === 'schema' ? result.schema_json : activeTab === 'html' ? result.html_snippet : result.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')); toast.success('Copied'); }}>📋 Copy</button>
                        </div>

                        {activeTab === 'faqs' && (
                            <div className="card">
                                {result.faqs.map((faq, i) => (
                                    <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>❓ {faq.question}</div>
                                        <div className="text-sm">{faq.answer}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'schema' && (
                            <div className="card">
                                <textarea className="form-input" rows={16} value={result.schema_json} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                            </div>
                        )}

                        {activeTab === 'html' && (
                            <div className="card">
                                <textarea className="form-input" rows={16} value={result.html_snippet} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                            </div>
                        )}
                    </>
                )}

                {!result && !generating && <EmptyState icon="❓" title="Enter keyword to generate FAQs" description="Creates People Also Ask-style questions with schema markup for SERP features" />}
            </main>
        </div>
    );
}
