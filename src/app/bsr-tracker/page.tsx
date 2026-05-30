'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Tracker { id: string; asin: string | null; label: string; category: string; current_bsr: number | null; lowest_bsr: number | null; highest_bsr: number | null; current_price: number | null; alert_threshold: number; last_checked: string; affiliate_url: string | null; }

export default function BSRTrackerPage() {
    const toast = useToast();
    const [trackers, setTrackers] = useState<Tracker[]>([]);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ asin: '', product_url: '', affiliate_url: '', label: '', alert_threshold: '1000' });

    useEffect(() => { fetchTrackers(); }, []);

    const fetchTrackers = async () => {
        setLoading(true);
        const res = await fetch('/api/bsr-tracker');
        const data = await res.json();
        setTrackers(data.trackers || []);
        setLoading(false);
    };

    const add = async () => {
        if (!form.asin && !form.product_url) { toast.warning('ASIN or product URL required'); return; }
        const res = await fetch('/api/bsr-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', ...form, alert_threshold: parseInt(form.alert_threshold) || 1000 }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success(`Tracking added${data.initial_bsr ? ` — BSR #${data.initial_bsr.toLocaleString()}` : ''}`);
        setShowAdd(false);
        setForm({ asin: '', product_url: '', affiliate_url: '', label: '', alert_threshold: '1000' });
        fetchTrackers();
    };

    const checkAll = async () => {
        setChecking(true);
        const res = await fetch('/api/bsr-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check_all' }) });
        const data = await res.json();
        toast.success(`Checked ${data.checked} products — ${data.improved} improved ranking`);
        fetchTrackers();
        setChecking(false);
    };

    const bsrColor = (bsr: number) => bsr <= 1000 ? '#16a34a' : bsr <= 10000 ? '#d97706' : bsr <= 100000 ? 'var(--text-primary)' : '#6b7280';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Amazon BSR Tracker</h1>
                        <p className="page-description">Track Best Seller Rank changes — dropping BSR means more sales momentum for your affiliate posts</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={checkAll} disabled={checking}>{checking ? 'Checking...' : '↻ Check All'}</button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Track Product</button>
                    </div>
                </div>

                <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, marginBottom: 16, fontSize: '0.85rem', color: '#92400e' }}>
                    💡 <strong>Lower BSR = higher sales velocity.</strong> When BSR drops from #50,000 → #5,000, update your review post with "currently selling fast" — converts 2-3x better.
                </div>

                {showAdd && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Track Product BSR</h3><button className="btn btn-sm" onClick={() => setShowAdd(false)}>✕</button></div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            {[{ key: 'asin', label: 'Amazon ASIN', placeholder: 'B08N5WRWNW' }, { key: 'product_url', label: 'OR Product URL', placeholder: 'https://amazon.com/dp/...' }, { key: 'affiliate_url', label: 'Affiliate URL', placeholder: 'https://amazon.com/dp/...?tag=yourtag' }, { key: 'label', label: 'Label', placeholder: 'Samsung TV 65"' }, { key: 'alert_threshold', label: 'Alert Threshold (BSR drop)', placeholder: '1000' }].map(f => (
                                <div key={f.key} className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">{f.label}</label>
                                    <input className="form-input" placeholder={f.placeholder} value={(form as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                                </div>
                            ))}
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={add}>Add Tracker</button>
                    </div>
                )}

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : trackers.length === 0 ? <EmptyState icon="📊" title="No Products Tracked" description="Add Amazon ASINs to track BSR changes and know when to update your affiliate posts" />
                        : <DataTable data={trackers as unknown as Record<string, unknown>[]} searchKeys={['label', 'asin', 'category']} pageSize={25} columns={[
                            { key: 'label', label: 'Product', render: (r) => <div><div style={{ fontWeight: 700 }}>{String(r.label)}</div>{Boolean(r.asin) && <div className="text-sm text-muted">ASIN: {String(r.asin)}</div>}<div className="text-sm text-muted">{String(r.category || '')}</div></div> },
                            { key: 'current_bsr', label: 'BSR Now', render: (r) => r.current_bsr ? <span style={{ fontWeight: 700, color: bsrColor(Number(r.current_bsr)) }}>#{Number(r.current_bsr).toLocaleString()}</span> : <span className="text-muted">—</span> },
                            { key: 'lowest_bsr', label: 'Best Ever', render: (r) => r.lowest_bsr ? <span style={{ color: '#16a34a' }}>#{Number(r.lowest_bsr).toLocaleString()}</span> : <span className="text-muted">—</span> },
                            { key: 'current_price', label: 'Price', render: (r) => r.current_price ? <span className="font-mono">${Number(r.current_price).toFixed(2)}</span> : <span className="text-muted">—</span> },
                            { key: 'last_checked', label: 'Checked', render: (r) => <span className="text-sm text-muted">{new Date(String(r.last_checked)).toLocaleDateString()}</span> },
                            { key: 'actions', label: '', render: (r) => <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-sm" onClick={async () => { const res = await fetch('/api/bsr-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', id: r.id }) }); const data = await res.json(); toast.success(`BSR: #${data.bsr?.toLocaleString() || 'N/A'} (was #${data.previous_bsr?.toLocaleString() || 'N/A'})`); fetchTrackers(); }}>Check</button>
                                {Boolean(r.affiliate_url) && <a href={String(r.affiliate_url)} target="_blank" rel="noopener" className="btn btn-sm">View</a>}
                                <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/bsr-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) }); fetchTrackers(); }}>Del</button>
                            </div>},
                        ]} />
                    }
                </div>
            </main>
        </div>
    );
}
