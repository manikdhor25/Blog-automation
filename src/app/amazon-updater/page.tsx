'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface AmazonProduct { id: string; asin: string; label: string; affiliate_url: string; current_price?: number; title?: string; rating?: number; review_count?: number; in_stock?: boolean; last_fetched: string; price_history: Array<{ price: number; date: string }>; }

export default function AmazonUpdaterPage() {
    const toast = useToast();
    const [products, setProducts] = useState<AmazonProduct[]>([]);
    const [tab, setTab] = useState<'products' | 'add'>('products');
    const [asin, setAsin] = useState('');
    const [label, setLabel] = useState('');
    const [tag, setTag] = useState('');
    const [siteId, setSiteId] = useState('');
    const [adding, setAdding] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await fetch('/api/amazon-updater');
        const data = await res.json();
        setProducts(data.products || []);
    };

    const add = async () => {
        if (!asin || !label) { toast.warning('ASIN and label required'); return; }
        if (asin.length !== 10) { toast.warning('ASIN must be 10 characters'); return; }
        setAdding(true);
        const res = await fetch('/api/amazon-updater', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_product', asin, label, affiliate_tag: tag || undefined, site_id: siteId || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success(`Added: ${data.fetched?.title || label}`);
            setAsin(''); setLabel('');
            load(); setTab('products');
        }
        setAdding(false);
    };

    const refreshAll = async () => {
        setRefreshing(true);
        const res = await fetch('/api/amazon-updater', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch', all: true }),
        });
        const data = await res.json();
        if (res.ok) { toast.success(`Refreshed ${data.count} products`); load(); }
        else toast.error(data.error || 'Failed');
        setRefreshing(false);
    };

    const del = async (id: string) => {
        await fetch('/api/amazon-updater', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', product_id: id }) });
        toast.success('Removed');
        load();
    };

    const priceChange = (product: AmazonProduct) => {
        if (product.price_history.length < 2) return null;
        const first = product.price_history[0].price;
        const last = product.price_history[product.price_history.length - 1].price;
        return ((last - first) / first * 100).toFixed(1);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Amazon Product Updater</h1>
                        <p className="page-description">Track product prices, ratings, stock — auto-update affiliate links when products change</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={refreshAll} disabled={refreshing || products.length === 0}>{refreshing ? 'Refreshing...' : '🔄 Refresh All'}</button>
                        {(['products', 'add'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                                {t === 'add' ? '+ Add Product' : `Products (${products.length})`}
                            </button>
                        ))}
                    </div>
                </div>

                {tab === 'add' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Add Amazon Product</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">ASIN * <span className="text-muted text-sm">(10 chars from Amazon URL)</span></label>
                                <input className="form-input" value={asin} onChange={e => setAsin(e.target.value.trim().toUpperCase())} placeholder="B08N5WRWNW" maxLength={10} style={{ fontFamily: 'var(--font-mono)' }} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Label *</label>
                                <input className="form-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="FlexiSpot E7 Standing Desk" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Affiliate Tag <span className="text-muted text-sm">(optional)</span></label>
                                <input className="form-input" value={tag} onChange={e => setTag(e.target.value)} placeholder="yourtag-20" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Site ID <span className="text-muted text-sm">(optional)</span></label>
                                <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites" />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={add} disabled={adding}>{adding ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Fetching...</> : '📦 Add & Fetch Data'}</button>
                    </div>
                )}

                {tab === 'products' && (
                    products.length === 0 ? (
                        <EmptyState icon="📦" title="No products tracked" description="Add Amazon ASINs to monitor price changes, stock status, and auto-update your affiliate links" />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {products.map((p, i) => {
                                const change = priceChange(p);
                                return (
                                    <div key={i} className="card" style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 700 }}>{p.label}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.asin}</span>
                                                    {p.in_stock !== undefined && <Badge variant={p.in_stock ? 'success' : 'danger'}>{p.in_stock ? 'In Stock' : 'Out of Stock'}</Badge>}
                                                </div>
                                                {p.title && <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{p.title.substring(0, 80)}</div>}
                                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                                    {p.current_price && <span style={{ fontWeight: 700, color: '#16a34a', fontSize: '1.1rem' }}>${p.current_price}</span>}
                                                    {change && <span style={{ fontWeight: 700, color: parseFloat(change) > 0 ? '#dc2626' : '#16a34a', fontSize: '0.85rem' }}>{parseFloat(change) > 0 ? '▲' : '▼'}{Math.abs(parseFloat(change))}% vs first</span>}
                                                    {p.rating && <span className="text-sm text-muted">⭐ {p.rating} ({p.review_count?.toLocaleString()})</span>}
                                                    <span className="text-sm text-muted">Updated {new Date(p.last_fetched).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-sm" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>📊</button>
                                                <a href={p.affiliate_url} target="_blank" rel="noreferrer" className="btn btn-sm">🔗</a>
                                                <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(p.affiliate_url); toast.success('Copied'); }}>📋</button>
                                                <button className="btn btn-sm" onClick={() => del(p.id)} style={{ color: '#dc2626' }}>🗑</button>
                                            </div>
                                        </div>

                                        {expandedId === p.id && p.price_history.length > 1 && (
                                            <div style={{ marginTop: 12, padding: '10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                                <div className="form-label" style={{ marginBottom: 6 }}>Price History</div>
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
                                                    {p.price_history.slice(-12).map((h, hi) => {
                                                        const maxP = Math.max(...p.price_history.map(x => x.price));
                                                        const ht = (h.price / maxP) * 50;
                                                        return (
                                                            <div key={hi} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                                <div title={`$${h.price}`} style={{ width: '100%', background: 'var(--accent-primary)', borderRadius: 2, height: ht, minHeight: 4 }} />
                                                                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>{h.date.substring(5, 10)}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
