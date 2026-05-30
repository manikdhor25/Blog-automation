'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Monitor {
    id: string; label: string; image_url: string | null;
    product_url: string; affiliate_url: string;
    initial_price: number | null; current_price: number | null;
    lowest_price: number | null; target_price: number | null;
    alert_threshold_pct: number; currency: string;
    price_drop_pct: number | null; status: string;
    last_checked: string; created_at: string;
}

interface PriceAlert {
    id: string; monitor_id: string; alert_type: string;
    old_price: number; new_price: number; drop_pct: number;
    created_at: string;
    price_monitor?: { label: string; affiliate_url: string };
}

export default function PriceMonitorPage() {
    const toast = useToast();
    const [monitors, setMonitors] = useState<Monitor[]>([]);
    const [alerts, setAlerts] = useState<PriceAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [activeTab, setActiveTab] = useState<'monitors' | 'alerts'>('monitors');
    const [form, setForm] = useState({ product_url: '', affiliate_url: '', label: '', target_price: '', alert_threshold_pct: '5' });

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [mRes, aRes] = await Promise.all([fetch('/api/price-monitor'), fetch('/api/price-monitor?view=alerts')]);
        const [mData, aData] = await Promise.all([mRes.json(), aRes.json()]);
        setMonitors(mData.monitors || []);
        setAlerts(aData.alerts || []);
        setLoading(false);
    };

    const add = async () => {
        if (!form.product_url) { toast.warning('Product URL required'); return; }
        const res = await fetch('/api/price-monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', ...form, target_price: form.target_price ? parseFloat(form.target_price) : undefined, alert_threshold_pct: parseFloat(form.alert_threshold_pct) || 5 }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success(`Monitoring: $${data.monitor.current_price ?? 'unknown'}`);
        setShowAdd(false);
        setForm({ product_url: '', affiliate_url: '', label: '', target_price: '', alert_threshold_pct: '5' });
        fetchAll();
    };

    const checkAll = async () => {
        setChecking(true);
        const res = await fetch('/api/price-monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check_all' }) });
        const data = await res.json();
        toast.success(`Checked ${data.checked} products — ${data.alerts} alerts`);
        setChecking(false);
        fetchAll();
    };

    const priceChange = (m: Monitor) => {
        if (!m.initial_price || !m.current_price) return null;
        const pct = ((m.initial_price - m.current_price) / m.initial_price) * 100;
        return pct;
    };

    const statusVariant = (s: string): 'success' | 'warning' | 'danger' | 'info' =>
        ({ active: 'info', price_dropped: 'success', target_reached: 'success', out_of_stock: 'danger' }[s] as 'success' | 'warning' | 'danger' | 'info') || 'info';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Price Drop Monitor</h1>
                        <p className="page-description">Track affiliate product prices — get alerted on drops to republish "now on sale" content</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={checkAll} disabled={checking}>
                            {checking ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Checking...</> : '↻ Check All Prices'}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Monitor Product</button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                    {[
                        { label: 'Monitored', value: monitors.length, icon: '👁️' },
                        { label: 'Alerts', value: alerts.length, icon: '🔔' },
                        { label: 'Price Drops', value: monitors.filter(m => m.status === 'price_dropped').length, icon: '📉' },
                        { label: 'Targets Hit', value: monitors.filter(m => m.status === 'target_reached').length, icon: '🎯' },
                    ].map((s, i) => (
                        <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                            <div className="text-sm text-muted">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Active alerts banner */}
                {alerts.length > 0 && (
                    <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>🔔 {alerts.length} Active Price Alert{alerts.length > 1 ? 's' : ''}</div>
                        {alerts.slice(0, 3).map(a => (
                            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div className="text-sm">
                                    <strong>{a.price_monitor?.label}</strong> dropped {a.drop_pct?.toFixed(1)}% — ${a.old_price} → <strong style={{ color: '#16a34a' }}>${a.new_price}</strong>
                                </div>
                                <button className="btn btn-sm" onClick={async () => { await fetch('/api/price-monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve_alert', id: a.id }) }); fetchAll(); }}>Dismiss</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add form */}
                {showAdd && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header">
                            <h3 className="card-title">Monitor Product Price</h3>
                            <button className="btn btn-sm" onClick={() => setShowAdd(false)}>✕</button>
                        </div>
                        <div className="grid-2" style={{ gap: 12 }}>
                            {[
                                { label: 'Product URL *', key: 'product_url', placeholder: 'https://amazon.com/dp/...' },
                                { label: 'Affiliate URL (tracked)', key: 'affiliate_url', placeholder: 'https://amazon.com/dp/...?tag=tag-20' },
                                { label: 'Label', key: 'label', placeholder: 'Auto-filled from page title' },
                                { label: 'Target Price ($)', key: 'target_price', placeholder: 'Alert when price ≤ this' },
                                { label: 'Alert Threshold (%)', key: 'alert_threshold_pct', placeholder: '5 = alert on 5%+ drop' },
                            ].map(f => (
                                <div key={f.key} className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">{f.label}</label>
                                    <input className="form-input" placeholder={f.placeholder} value={(form as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                                </div>
                            ))}
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={add}>Add Monitor</button>
                    </div>
                )}

                <div className="tabs" style={{ marginBottom: 12 }}>
                    <button className={`tab ${activeTab === 'monitors' ? 'active' : ''}`} onClick={() => setActiveTab('monitors')}>Monitors ({monitors.length})</button>
                    <button className={`tab ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => setActiveTab('alerts')}>Alert History ({alerts.length})</button>
                </div>

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : activeTab === 'monitors' ? (
                            monitors.length === 0 ? <EmptyState icon="📉" title="No Products Monitored" description="Add a product URL to start tracking its price" /> : (
                                <DataTable data={monitors as unknown as Record<string, unknown>[]} searchKeys={['label']} pageSize={20} columns={[
                                    { key: 'label', label: 'Product', render: (r) => (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {Boolean(r.image_url) && <img src={String(r.image_url)} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />}
                                            <a href={String(r.affiliate_url)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{String(r.label).substring(0, 50)}</a>
                                        </div>
                                    )},
                                    { key: 'initial_price', label: 'Initial', render: (r) => <span className="font-mono">${Number(r.initial_price || 0).toFixed(2)}</span> },
                                    { key: 'current_price', label: 'Current', render: (r) => {
                                        const chg = priceChange(r as unknown as Monitor);
                                        return <span className="font-mono" style={{ color: chg && chg > 0 ? '#16a34a' : chg && chg < 0 ? '#dc2626' : undefined, fontWeight: 700 }}>${Number(r.current_price || 0).toFixed(2)}{chg ? ` (${chg > 0 ? '-' : '+'}${Math.abs(chg).toFixed(1)}%)` : ''}</span>;
                                    }},
                                    { key: 'lowest_price', label: 'Lowest Ever', render: (r) => <span className="font-mono">${Number(r.lowest_price || 0).toFixed(2)}</span> },
                                    { key: 'target_price', label: 'Target', render: (r) => r.target_price ? <span className="font-mono">${Number(r.target_price).toFixed(2)}</span> : <span className="text-muted">—</span> },
                                    { key: 'status', label: 'Status', render: (r) => <Badge variant={statusVariant(String(r.status))}>{String(r.status).replace('_', ' ')}</Badge> },
                                    { key: 'last_checked', label: 'Checked', render: (r) => <span className="text-sm text-muted">{new Date(String(r.last_checked)).toLocaleDateString()}</span> },
                                    { key: 'actions', label: '', render: (r) => (
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-sm" onClick={async () => { await fetch('/api/price-monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check_one', id: r.id }) }); fetchAll(); }}>Check</button>
                                            <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/price-monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) }); fetchAll(); }}>Del</button>
                                        </div>
                                    )},
                                ]} />
                            )
                        ) : (
                            alerts.length === 0 ? <EmptyState icon="🔔" title="No Alerts" description="Alerts appear when monitored prices drop" /> : (
                                <DataTable data={alerts as unknown as Record<string, unknown>[]} searchKeys={['alert_type']} pageSize={20} columns={[
                                    { key: 'label', label: 'Product', render: (r) => { const m = r.price_monitor as Record<string, string> | undefined; return <span style={{ fontWeight: 600 }}>{m?.label || '—'}</span>; }},
                                    { key: 'alert_type', label: 'Type', render: (r) => <Badge variant={String(r.alert_type) === 'price_drop' ? 'success' : 'warning'}>{String(r.alert_type).replace('_', ' ')}</Badge> },
                                    { key: 'old_price', label: 'Was', render: (r) => <span className="font-mono">${Number(r.old_price).toFixed(2)}</span> },
                                    { key: 'new_price', label: 'Now', render: (r) => <span className="font-mono" style={{ color: '#16a34a', fontWeight: 700 }}>${Number(r.new_price).toFixed(2)}</span> },
                                    { key: 'drop_pct', label: 'Drop', render: (r) => <span style={{ color: '#16a34a', fontWeight: 700 }}>{Number(r.drop_pct).toFixed(1)}%</span> },
                                    { key: 'created_at', label: 'When', render: (r) => <span className="text-sm text-muted">{new Date(String(r.created_at)).toLocaleDateString()}</span> },
                                ]} />
                            )
                        )
                    }
                </div>
            </main>
        </div>
    );
}
