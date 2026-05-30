'use client';

import React, { useState, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/utils/sanitize';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Product {
    name: string;
    affiliate_url: string;
    price: number | null;
    rating: number | null;
    image_url: string | null;
}

interface ComparisonResult {
    table_html: string;
    summary: string;
    winner: string;
    winner_reason: string;
    products: Array<{ name: string; pros: string[]; cons: string[]; verdict: string; score: number; badge?: string }>;
    faq: Array<{ question: string; answer: string }>;
}

interface SavedTable {
    id: string;
    title: string;
    keyword: string;
    created_at: string;
}

export default function ComparisonPage() {
    const toast = useToast();
    const [keyword, setKeyword] = useState('');
    const [products, setProducts] = useState<Product[]>([
        { name: '', affiliate_url: '', price: null, rating: null, image_url: null },
        { name: '', affiliate_url: '', price: null, rating: null, image_url: null },
    ]);
    const [criteria, setCriteria] = useState('price, performance, ease of use, value for money, build quality');
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<ComparisonResult | null>(null);
    const [savedTables, setSavedTables] = useState<SavedTable[]>([]);
    const [activeTab, setActiveTab] = useState<'create' | 'saved'>('create');
    const [copyHtml, setCopyHtml] = useState(false);

    useEffect(() => { fetchSaved(); }, []);

    const fetchSaved = async () => {
        const res = await fetch('/api/comparison');
        const data = await res.json();
        setSavedTables(data.tables || []);
    };

    const addProduct = () => {
        if (products.length >= 10) { toast.warning('Max 10 products'); return; }
        setProducts(p => [...p, { name: '', affiliate_url: '', price: null, rating: null, image_url: null }]);
    };

    const removeProduct = (i: number) => {
        if (products.length <= 2) { toast.warning('Minimum 2 products'); return; }
        setProducts(p => p.filter((_, idx) => idx !== i));
    };

    const updateProduct = (i: number, field: keyof Product, value: string | number | null) => {
        setProducts(p => p.map((prod, idx) => idx === i ? { ...prod, [field]: value } : prod));
    };

    const generate = async () => {
        const validProducts = products.filter(p => p.name.trim());
        if (validProducts.length < 2) { toast.warning('Add at least 2 product names'); return; }
        if (!keyword) { toast.warning('Enter target keyword'); return; }

        setGenerating(true);
        setResult(null);
        try {
            const res = await fetch('/api/comparison', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate',
                    keyword,
                    products: validProducts,
                    criteria: criteria.split(',').map(s => s.trim()).filter(Boolean),
                }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Generation failed'); return; }
            setResult(data.comparison);
            toast.success(`Comparison generated via ${data.provider}`);
        } catch { toast.error('Generation failed'); }
        finally { setGenerating(false); }
    };

    const saveTable = async () => {
        if (!result) return;
        await fetch('/api/comparison', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save', keyword, title: `${keyword} comparison`, products }),
        });
        toast.success('Comparison saved');
        fetchSaved();
    };

    const copyTableHtml = () => {
        if (!result?.table_html) return;
        navigator.clipboard.writeText(result.table_html);
        setCopyHtml(true);
        toast.success('Table HTML copied');
        setTimeout(() => setCopyHtml(false), 2000);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Comparison Table Generator</h1>
                        <p className="page-description">AI-powered product comparisons — highest-converting affiliate content format</p>
                    </div>
                </div>

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'create' ? 'active' : ''}`} onClick={() => setActiveTab('create')}>+ Create</button>
                    <button className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved ({savedTables.length})</button>
                </div>

                {activeTab === 'saved' ? (
                    <div className="card">
                        {savedTables.length === 0 ? (
                            <EmptyState icon="📊" title="No Saved Comparisons" description="Generate your first comparison table to see it here" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {savedTables.map(t => (
                                    <div key={t.id} className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{t.title}</div>
                                            <div className="text-sm text-muted">{t.keyword} · {new Date(t.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <button className="btn btn-sm btn-danger"
                                            onClick={async () => { await fetch('/api/comparison', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: t.id }) }); fetchSaved(); }}>
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Config */}
                        <div className="card" style={{ marginBottom: 16 }}>
                            <h3 className="card-title" style={{ marginBottom: 16 }}>Comparison Setup</h3>

                            <div className="form-group">
                                <label className="form-label">Target Keyword <span className="text-muted text-sm">(e.g. "best whey protein powder 2025")</span></label>
                                <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)}
                                    placeholder="best standing desks 2025" />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Comparison Criteria <span className="text-muted text-sm">(comma-separated)</span></label>
                                <input className="form-input" value={criteria} onChange={e => setCriteria(e.target.value)} />
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <label className="form-label" style={{ margin: 0 }}>Products ({products.length}/10)</label>
                                    <button className="btn btn-sm" onClick={addProduct}>+ Add Product</button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {products.map((p, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                                            <input className="form-input" placeholder={`Product ${i + 1} name`} value={p.name}
                                                onChange={e => updateProduct(i, 'name', e.target.value)} />
                                            <input className="form-input" placeholder="Affiliate URL (optional)" value={p.affiliate_url}
                                                onChange={e => updateProduct(i, 'affiliate_url', e.target.value)} />
                                            <input className="form-input" type="number" placeholder="Price ($)" value={p.price ?? ''}
                                                onChange={e => updateProduct(i, 'price', e.target.value ? parseFloat(e.target.value) : null)} />
                                            <input className="form-input" type="number" step="0.1" min="0" max="5" placeholder="Rating /5"
                                                value={p.rating ?? ''}
                                                onChange={e => updateProduct(i, 'rating', e.target.value ? parseFloat(e.target.value) : null)} />
                                            <button className="btn btn-sm btn-danger" onClick={() => removeProduct(i)} style={{ whiteSpace: 'nowrap' }}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={generate} disabled={generating}>
                                {generating ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Generating...</> : 'Generate Comparison Table'}
                            </button>
                        </div>

                        {/* Result */}
                        {result && (
                            <div className="card animate-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <h3 className="card-title" style={{ margin: 0 }}>Generated Comparison</h3>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-sm" onClick={copyTableHtml}>
                                            {copyHtml ? 'Copied!' : 'Copy HTML'}
                                        </button>
                                        <button className="btn btn-sm btn-primary" onClick={saveTable}>Save</button>
                                    </div>
                                </div>

                                {/* Winner badge */}
                                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                                    <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>🏆 Winner: {result.winner}</div>
                                    <div className="text-sm" style={{ color: '#15803d' }}>{result.winner_reason}</div>
                                </div>

                                {/* Summary */}
                                <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>{result.summary}</p>

                                {/* Product cards */}
                                <div className="grid-3" style={{ gap: 12, marginBottom: 24 }}>
                                    {result.products?.map((p, i) => (
                                        <div key={i} className="card" style={{ padding: 14 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                <div style={{ fontWeight: 700 }}>{p.name}</div>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    {p.badge && <Badge variant="info">{p.badge}</Badge>}
                                                    <Badge variant="neutral">{p.score}/10</Badge>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted" style={{ marginBottom: 8 }}>{p.verdict}</p>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                <div>
                                                    <div className="text-sm" style={{ color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>Pros</div>
                                                    {p.pros?.map((pro, j) => <div key={j} className="text-sm">✓ {pro}</div>)}
                                                </div>
                                                <div>
                                                    <div className="text-sm" style={{ color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>Cons</div>
                                                    {p.cons?.map((con, j) => <div key={j} className="text-sm">✗ {con}</div>)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* HTML Table preview */}
                                <div>
                                    <h4 style={{ marginBottom: 12, fontWeight: 600 }}>HTML Table Preview</h4>
                                    <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 6, padding: 16 }}
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(result.table_html) }} />
                                </div>

                                {/* FAQ */}
                                {result.faq?.length > 0 && (
                                    <div style={{ marginTop: 24 }}>
                                        <h4 style={{ marginBottom: 12, fontWeight: 600 }}>FAQ (Schema-ready)</h4>
                                        {result.faq.map((f, i) => (
                                            <div key={i} style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                                <div style={{ fontWeight: 600, marginBottom: 4 }}>Q: {f.question}</div>
                                                <div className="text-sm text-muted">A: {f.answer}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
