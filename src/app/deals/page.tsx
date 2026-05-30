'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Deal {
    id: string; product_name: string; affiliate_url: string;
    deal_type: string; discount_value: string; coupon_code: string;
    expires_at: string | null; is_active: boolean; is_expired: boolean;
    is_verified: boolean; notes: string; created_at: string;
}
interface Summary { total: number; active: number; expired: number; expiring_soon: number; }

const TYPE_ICONS: Record<string, string> = { coupon: '🎟️', sale: '💸', flash_deal: '⚡', bundle: '📦', free_trial: '🆓', cashback: '💰', discount: '🏷️' };

export default function DealsPage() {
    const toast = useToast();
    const [deals, setDeals] = useState<Deal[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [filter, setFilter] = useState('active');
    const [showAdd, setShowAdd] = useState(false);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ product_name: '', affiliate_url: '', deal_type: 'sale', discount_value: '', coupon_code: '', expires_at: '', notes: '' });

    useEffect(() => { fetchDeals(); }, [filter]);

    const fetchDeals = async () => {
        setLoading(true);
        const res = await fetch(`/api/deals?filter=${filter}`);
        const data = await res.json();
        setDeals(data.deals || []);
        setSummary(data.summary || null);
        setLoading(false);
    };

    const checkExpiry = async () => {
        const res = await fetch('/api/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check_expiry' }) });
        const data = await res.json();
        toast.success(`${data.expiring_soon?.length || 0} expiring soon, ${data.recently_expired?.length || 0} just expired`);
        fetchDeals();
    };

    const create = async () => {
        if (!form.product_name || !form.affiliate_url) { toast.warning('Name and URL required'); return; }
        const res = await fetch('/api/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...form }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Deal added');
        setShowAdd(false);
        setForm({ product_name: '', affiliate_url: '', deal_type: 'sale', discount_value: '', coupon_code: '', expires_at: '', notes: '' });
        fetchDeals();
    };

    const toggleActive = async (d: Deal) => {
        await fetch('/api/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', id: d.id, is_active: !d.is_active }) });
        fetchDeals();
    };

    const daysLeft = (exp: string) => {
        const diff = new Date(exp).getTime() - Date.now();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Deal & Coupon Manager</h1>
                        <p className="page-description">Track time-limited affiliate deals — auto-expiry alerts, post update reminders</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={checkExpiry}>↻ Check Expiry</button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Deal</button>
                    </div>
                </div>

                {summary && (
                    <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                        {[
                            { label: 'Active Deals', value: summary.active, icon: '✅' },
                            { label: 'Expiring Soon', value: summary.expiring_soon, icon: '⏰' },
                            { label: 'Expired', value: summary.expired, icon: '❌' },
                            { label: 'Total Tracked', value: summary.total, icon: '📋' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {showAdd && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Add Deal / Coupon</h3><button className="btn btn-sm" onClick={() => setShowAdd(false)}>✕</button></div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Product Name *</label>
                                <input className="form-input" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder='Samsung 65" QLED TV' />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Deal Type</label>
                                <select className="form-select" value={form.deal_type} onChange={e => setForm(f => ({ ...f, deal_type: e.target.value }))}>
                                    {['coupon', 'sale', 'flash_deal', 'bundle', 'free_trial', 'cashback', 'discount'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Discount Value</label>
                                <input className="form-input" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} placeholder="30% off / $50 off" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Coupon Code</label>
                                <input className="form-input" value={form.coupon_code} onChange={e => setForm(f => ({ ...f, coupon_code: e.target.value }))} placeholder="SAVE30" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Expires</label>
                                <input type="datetime-local" className="form-input" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Affiliate URL *</label>
                                <input className="form-input" value={form.affiliate_url} onChange={e => setForm(f => ({ ...f, affiliate_url: e.target.value }))} placeholder="https://..." />
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={create}>Save Deal</button>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {['active', 'expiring', 'expired', 'all'].map(f => (
                        <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>{f}</button>
                    ))}
                </div>

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : deals.length === 0 ? <EmptyState icon="🎟️" title="No Deals" description="Add affiliate deals to track expiry and get update reminders" />
                        : <DataTable data={deals as unknown as Record<string, unknown>[]} searchKeys={['product_name', 'coupon_code']} pageSize={25} columns={[
                            { key: 'product_name', label: 'Product', render: (r) => <div><span style={{ fontWeight: 700 }}>{String(r.product_name)}</span><div className="text-sm text-muted">{TYPE_ICONS[String(r.deal_type)]} {String(r.deal_type).replace('_', ' ')} {r.coupon_code ? `· Code: ${r.coupon_code}` : ''}</div></div> },
                            { key: 'discount_value', label: 'Discount', render: (r) => <span style={{ fontWeight: 700, color: '#16a34a' }}>{String(r.discount_value || '—')}</span> },
                            { key: 'expires_at', label: 'Expires', render: (r) => {
                                if (!r.expires_at) return <span className="text-muted">No expiry</span>;
                                const days = daysLeft(String(r.expires_at));
                                const color = days <= 1 ? '#dc2626' : days <= 3 ? '#d97706' : 'var(--text-primary)';
                                return <span style={{ color, fontWeight: days <= 3 ? 700 : 400 }}>{days <= 0 ? 'Expired' : `${days}d left`}</span>;
                            }},
                            { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_expired ? 'danger' : r.is_active ? 'success' : 'warning'}>{r.is_expired ? 'Expired' : r.is_active ? 'Active' : 'Paused'}</Badge> },
                            { key: 'actions', label: '', render: (r) => <div style={{ display: 'flex', gap: 4 }}>
                                <a href={String(r.affiliate_url)} target="_blank" rel="noopener" className="btn btn-sm">View</a>
                                <button className="btn btn-sm" onClick={() => toggleActive(r as unknown as Deal)}>{r.is_active ? 'Pause' : 'Activate'}</button>
                                <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) }); fetchDeals(); }}>Del</button>
                            </div>},
                        ]} />
                    }
                </div>
            </main>
        </div>
    );
}
