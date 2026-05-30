'use client';

import React, { useState, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/utils/sanitize';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface SavedReview {
    id: string;
    product_title: string;
    product_image: string | null;
    product_price: number | null;
    product_rating: number | null;
    review_title: string;
    verdict_score: number;
    niche: string;
    word_count: number;
    status: string;
    created_at: string;
}

interface ReviewData {
    title: string;
    meta_title: string;
    meta_description: string;
    intro: string;
    quick_verdict: string;
    verdict_score: number;
    pros: string[];
    cons: string[];
    who_its_for: string;
    who_its_not_for: string;
    conclusion: string;
    cta_text: string;
    full_html: string;
    faq: Array<{ question: string; answer: string }>;
    sections: Array<{ heading: string; content: string }>;
}

export default function ReviewGeneratorPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'generate' | 'saved'>('generate');
    const [asin, setAsin] = useState('');
    const [productUrl, setProductUrl] = useState('');
    const [affiliateUrl, setAffiliateUrl] = useState('');
    const [niche, setNiche] = useState('');
    const [keyword, setKeyword] = useState('');
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<{ review: ReviewData; product: Record<string, unknown>; id: string } | null>(null);
    const [saved, setSaved] = useState<SavedReview[]>([]);
    const [copiedHtml, setCopiedHtml] = useState(false);
    const [previewTab, setPreviewTab] = useState<'preview' | 'html' | 'meta'>('preview');

    useEffect(() => { if (activeTab === 'saved') fetchSaved(); }, [activeTab]);

    const fetchSaved = async () => {
        const res = await fetch('/api/review-generator');
        const data = await res.json();
        setSaved(data.reviews || []);
    };

    const generate = async () => {
        if (!asin && !productUrl) { toast.warning('Enter ASIN or product URL'); return; }
        if (!niche) { toast.warning('Enter niche'); return; }
        setGenerating(true); setResult(null);
        try {
            const res = await fetch('/api/review-generator', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate', asin: asin || undefined, product_url: productUrl || undefined, affiliate_url: affiliateUrl || undefined, niche, target_keyword: keyword || undefined }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Generation failed'); return; }
            setResult(data);
            toast.success(`Review generated — ${data.review.word_count_estimate} words`);
        } catch { toast.error('Failed'); }
        finally { setGenerating(false); }
    };

    const copyHtml = () => {
        if (!result?.review.full_html) return;
        navigator.clipboard.writeText(result.review.full_html);
        setCopiedHtml(true);
        toast.success('HTML copied');
        setTimeout(() => setCopiedHtml(false), 2000);
    };

    const scoreColor = (s: number) => s >= 8 ? '#16a34a' : s >= 6 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Review Generator</h1>
                        <p className="page-description">ASIN or product URL → full affiliate review post with schema, FAQ, HTML</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>Generate</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved ({saved.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {saved.length === 0 ? <EmptyState icon="⭐" title="No Reviews Yet" description="Generate your first product review" /> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {saved.map(r => (
                                    <div key={r.id} className="card" style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
                                        {r.product_image && <img src={r.product_image} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 4 }} />}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.product_title}</div>
                                            <div className="text-sm text-muted">{r.niche} · {r.word_count} words · {new Date(r.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, color: scoreColor(r.verdict_score) }}>{r.verdict_score}/10</span>
                                            <Badge variant={r.status === 'published' ? 'success' : 'info'}>{r.status}</Badge>
                                            <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/review-generator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) }); fetchSaved(); }}>Del</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                        {/* Input */}
                        <div className="card">
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Product Details</h3>
                            <div className="form-group">
                                <label className="form-label">Amazon ASIN <span className="text-muted text-sm">(e.g. B08N5WRWNW)</span></label>
                                <input className="form-input" value={asin} onChange={e => setAsin(e.target.value.trim())} placeholder="B08N5WRWNW" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">OR Product URL <span className="text-muted text-sm">(any product page)</span></label>
                                <input className="form-input" value={productUrl} onChange={e => setProductUrl(e.target.value)} placeholder="https://amazon.com/dp/..." />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Affiliate URL <span className="text-muted text-sm">(your tracked link)</span></label>
                                <input className="form-input" value={affiliateUrl} onChange={e => setAffiliateUrl(e.target.value)} placeholder="https://amazon.com/dp/...?tag=yourtag-20" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Niche *</label>
                                <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="home office, fitness, kitchen..." />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Target Keyword <span className="text-muted text-sm">(optional — auto-generated if blank)</span></label>
                                <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desk review 2025" />
                            </div>
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={generate} disabled={generating}>
                                {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating review...</> : '⭐ Generate Full Review'}
                            </button>
                            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                <div className="text-sm text-muted">Configure Amazon PA-API keys in Settings for live product data. URL fallback uses JSON-LD scraping.</div>
                            </div>
                        </div>

                        {/* Result */}
                        <div>
                            {generating && (
                                <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                    <div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} />
                                    <div style={{ fontWeight: 600 }}>Generating review...</div>
                                    <div className="text-sm text-muted" style={{ marginTop: 8 }}>Writing ~1,800 word review with schema, FAQ, pros/cons</div>
                                </div>
                            )}

                            {result && !generating && (
                                <div className="card animate-in">
                                    {/* Product header */}
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                                        {Boolean(result.product.image_url) && (
                                            <img src={String(result.product.image_url)} alt="" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 4, background: '#f8f9fa' }} />
                                        )}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>{result.review.title}</div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 700, fontSize: '1.2rem', color: scoreColor(result.review.verdict_score) }}>{result.review.verdict_score}/10</span>
                                                {Boolean(result.product.price) && <Badge variant="neutral">${Number(result.product.price).toFixed(2)}</Badge>}
                                                {Boolean(result.product.rating) && <Badge variant="neutral">★ {Number(result.product.rating)}</Badge>}
                                                <Badge variant="info">{(result.review as { word_count_estimate?: number }).word_count_estimate} words</Badge>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm" onClick={copyHtml}>{copiedHtml ? 'Copied!' : 'Copy HTML'}</button>
                                            <a href={`/create?prefill=${result.id}`} className="btn btn-sm btn-primary">Publish →</a>
                                        </div>
                                    </div>

                                    {/* Quick verdict */}
                                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 4, color: '#166534' }}>Quick Verdict</div>
                                        <p className="text-sm">{result.review.quick_verdict}</p>
                                    </div>

                                    {/* Pros/Cons */}
                                    <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: 6, color: '#16a34a' }}>Pros</div>
                                            {result.review.pros.map((p, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>✅ {p}</div>)}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: 6, color: '#dc2626' }}>Cons</div>
                                            {result.review.cons.map((c, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>❌ {c}</div>)}
                                        </div>
                                    </div>

                                    {/* Preview tabs */}
                                    <div className="tabs" style={{ marginBottom: 12 }}>
                                        <button className={`tab ${previewTab === 'preview' ? 'active' : ''}`} onClick={() => setPreviewTab('preview')}>Preview</button>
                                        <button className={`tab ${previewTab === 'html' ? 'active' : ''}`} onClick={() => setPreviewTab('html')}>HTML</button>
                                        <button className={`tab ${previewTab === 'meta' ? 'active' : ''}`} onClick={() => setPreviewTab('meta')}>Meta / SEO</button>
                                    </div>

                                    {previewTab === 'preview' && (
                                        <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6, padding: 16 }}
                                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(result.review.full_html) }} />
                                    )}

                                    {previewTab === 'html' && (
                                        <textarea className="form-input" rows={12} readOnly value={result.review.full_html} style={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                                    )}

                                    {previewTab === 'meta' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <div>
                                                <div className="form-label">Meta Title ({result.review.meta_title.length} chars)</div>
                                                <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 6, fontWeight: 600 }}>{result.review.meta_title}</div>
                                            </div>
                                            <div>
                                                <div className="form-label">Meta Description ({result.review.meta_description.length} chars)</div>
                                                <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 6 }}>{result.review.meta_description}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!result && !generating && (
                                <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>⭐</div>
                                    <div style={{ fontWeight: 600 }}>Review will appear here</div>
                                    <div className="text-sm" style={{ marginTop: 8 }}>Enter ASIN or URL and click Generate</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
