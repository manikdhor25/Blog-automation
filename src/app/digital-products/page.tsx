'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Product { id: string; name: string; type: string; price: number; currency: string; platform: string; checkout_url: string | null; total_sales: number; total_revenue: number; is_active: boolean; niche: string; }

export default function DigitalProductsPage() {
    const toast = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showSale, setShowSale] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [generatedDesc, setGeneratedDesc] = useState<Record<string, unknown> | null>(null);
    const [saleAmount, setSaleAmount] = useState('');
    const [form, setForm] = useState({ name: '', type: 'ebook', price: '', currency: 'USD', platform: 'gumroad', checkout_url: '', niche: '', description: '' });

    useEffect(() => { fetch('/api/digital-products').then(r => r.json()).then(d => { setProducts(d.products || []); setLoading(false); }); }, []);

    const totalRevenue = products.reduce((s, p) => s + (p.total_revenue || 0), 0);
    const totalSales = products.reduce((s, p) => s + (p.total_sales || 0), 0);

    const create = async () => {
        if (!form.name) { toast.warning('Name required'); return; }
        const res = await fetch('/api/digital-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...form, price: parseFloat(form.price) || 0 }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Product created');
        setShowForm(false);
        window.location.reload();
    };

    const generateDesc = async () => {
        if (!form.name) { toast.warning('Enter product name first'); return; }
        setGenerating(true);
        const res = await fetch('/api/digital-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_description', name: form.name, type: form.type, niche: form.niche, price: parseFloat(form.price) || 0 }) });
        const data = await res.json();
        if (res.ok) { setGeneratedDesc(data.description); setForm(f => ({ ...f, description: (data.description as Record<string, string>).description || '' })); toast.success(`Generated via ${data.provider}`); }
        setGenerating(false);
    };

    const logSale = async (productId: string) => {
        if (!saleAmount) { toast.warning('Amount required'); return; }
        await fetch('/api/digital-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'log_sale', id: productId, sale_amount: parseFloat(saleAmount) }) });
        toast.success('Sale logged');
        setShowSale(null);
        setSaleAmount('');
        window.location.reload();
    };

    const platforms = ['gumroad', 'lemon_squeezy', 'stripe', 'payhip', 'teachable', 'podia', 'direct'];
    const types = ['ebook', 'template', 'course', 'checklist', 'swipe_file', 'membership', 'bundle', 'other'];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Digital Products</h1>
                        <p className="page-description">Sell ebooks, templates, courses — Gumroad, Lemon Squeezy, Stripe</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Add Product</button>
                </div>

                <div className="grid-3" style={{ gap: 16, marginBottom: 24 }}>
                    {[{ label: 'Products', value: products.length, icon: '📦' }, { label: 'Total Sales', value: totalSales, icon: '🛒' }, { label: 'Total Revenue', value: `$${totalRevenue.toFixed(2)}`, icon: '💰' }].map((s, i) => (
                        <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                            <div className="text-sm text-muted">{s.label}</div>
                        </div>
                    ))}
                </div>

                {showForm && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Add Digital Product</h3><button className="btn btn-sm" onClick={() => setShowForm(false)}>✕</button></div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Product Name *</label>
                                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="The Ultimate Keto Guide" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Type</label>
                                <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Platform</label>
                                <select className="form-select" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
                                    {platforms.map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Price ($)</label>
                                <input type="number" step="0.01" className="form-input" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} placeholder="health & fitness" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Checkout URL</label>
                                <input className="form-input" value={form.checkout_url} onChange={e => setForm(f => ({ ...f, checkout_url: e.target.value }))} placeholder="https://gumroad.com/l/..." />
                            </div>
                        </div>
                        <div className="form-group" style={{ marginTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <label className="form-label">Description</label>
                                <button className="btn btn-sm" onClick={generateDesc} disabled={generating}>{generating ? 'Generating...' : 'AI Generate →'}</button>
                            </div>
                            <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        {generatedDesc && (
                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>{(generatedDesc as Record<string, string>).headline}</div>
                                <div className="text-sm text-muted">{(generatedDesc as Record<string, string>).subheadline}</div>
                            </div>
                        )}
                        <button className="btn btn-primary" onClick={create}>Create Product</button>
                    </div>
                )}

                {showSale && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Log Sale</h3><button className="btn btn-sm" onClick={() => setShowSale(null)}>✕</button></div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input type="number" step="0.01" className="form-input" placeholder="Sale amount ($)" value={saleAmount} onChange={e => setSaleAmount(e.target.value)} style={{ maxWidth: 200 }} />
                            <button className="btn btn-primary" onClick={() => logSale(showSale)}>Log Sale</button>
                        </div>
                    </div>
                )}

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : products.length === 0 ? <EmptyState icon="📦" title="No Products" description="Create your first digital product to start tracking sales" />
                        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                            {products.map(p => (
                                <div key={p.id} className="card" style={{ padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</span>
                                        <Badge variant={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'Active' : 'Paused'}</Badge>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                                        <Badge variant="neutral">{p.type}</Badge>
                                        <Badge variant="info">{p.platform.replace('_', ' ')}</Badge>
                                    </div>
                                    <div className="grid-2" style={{ gap: 8, marginBottom: 10 }}>
                                        <div><div className="text-sm text-muted">Price</div><div style={{ fontWeight: 700 }}>${p.price}</div></div>
                                        <div><div className="text-sm text-muted">Sales</div><div style={{ fontWeight: 700 }}>{p.total_sales}</div></div>
                                        <div><div className="text-sm text-muted">Revenue</div><div style={{ fontWeight: 700, color: '#16a34a' }}>${p.total_revenue.toFixed(2)}</div></div>
                                        <div><div className="text-sm text-muted">Avg Sale</div><div style={{ fontWeight: 700 }}>${p.total_sales > 0 ? (p.total_revenue / p.total_sales).toFixed(2) : '0.00'}</div></div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="btn btn-sm btn-primary" onClick={() => setShowSale(p.id)}>+ Sale</button>
                                        {p.checkout_url && <a href={p.checkout_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">View →</a>}
                                        <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/digital-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: p.id }) }); window.location.reload(); }}>Del</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    }
                </div>
            </main>
        </div>
    );
}
