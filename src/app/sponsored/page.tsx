'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Deal {
    id: string; brand_name: string; contact_name: string | null; contact_email: string | null;
    deal_type: string; agreed_fee: number; currency: string;
    deliverable_description: string; deadline: string | null;
    disclosure_type: string; status: string;
    payment_date: string | null; notes: string; created_at: string;
}

interface Summary { total: number; total_revenue: number; pending_revenue: number; overdue: number; }

const STATUSES = ['negotiating', 'agreed', 'in_progress', 'delivered', 'published', 'paid', 'cancelled'];
const STATUS_COLORS: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    negotiating: 'neutral', agreed: 'info', in_progress: 'warning',
    delivered: 'warning', published: 'warning', paid: 'success', cancelled: 'danger',
};

export default function SponsoredPage() {
    const toast = useToast();
    const [deals, setDeals] = useState<Deal[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filterStatus, setFilterStatus] = useState('all');
    const [form, setForm] = useState({ brand_name: '', contact_name: '', contact_email: '', deal_type: 'sponsored_post', agreed_fee: '', currency: 'USD', deliverable_description: '', deadline: '', disclosure_type: 'sponsored', notes: '' });

    useEffect(() => { fetchDeals(); }, [filterStatus]);

    const fetchDeals = async () => {
        setLoading(true);
        const res = await fetch(`/api/sponsored${filterStatus !== 'all' ? `?status=${filterStatus}` : ''}`);
        const data = await res.json();
        setDeals(data.deals || []);
        setSummary(data.summary || null);
        setLoading(false);
    };

    const create = async () => {
        if (!form.brand_name) { toast.warning('Brand name required'); return; }
        const res = await fetch('/api/sponsored', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...form, agreed_fee: parseFloat(form.agreed_fee) || 0 }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success('Deal created');
        setShowForm(false);
        fetchDeals();
    };

    const updateStatus = async (id: string, status: string) => {
        const action = status === 'delivered' ? 'mark_delivered' : status === 'paid' ? 'mark_paid' : 'update';
        await fetch('/api/sponsored', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, status }) });
        fetchDeals();
    };

    const isOverdue = (d: Deal) => d.deadline && new Date(d.deadline) < new Date() && !['paid', 'cancelled'].includes(d.status);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Sponsored Post Manager</h1>
                        <p className="page-description">Track brand deals, deliverables, deadlines, payments, FTC compliance</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ New Deal</button>
                </div>

                {summary && (
                    <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                        {[
                            { label: 'Total Deals', value: summary.total, icon: '🤝' },
                            { label: 'Paid Revenue', value: `$${summary.total_revenue.toFixed(0)}`, icon: '💰' },
                            { label: 'Pending Revenue', value: `$${summary.pending_revenue.toFixed(0)}`, icon: '⏳' },
                            { label: 'Overdue', value: summary.overdue, icon: summary.overdue > 0 ? '🚨' : '✅' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {showForm && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">New Sponsored Deal</h3><button className="btn btn-sm" onClick={() => setShowForm(false)}>✕</button></div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            {[
                                { label: 'Brand Name *', key: 'brand_name', placeholder: 'Nike, HubSpot...' },
                                { label: 'Contact Name', key: 'contact_name', placeholder: 'Jane Smith' },
                                { label: 'Contact Email', key: 'contact_email', placeholder: 'jane@brand.com' },
                                { label: 'Fee ($)', key: 'agreed_fee', placeholder: '500' },
                                { label: 'Deadline', key: 'deadline', placeholder: '' },
                            ].map(f => (
                                <div key={f.key} className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">{f.label}</label>
                                    <input className="form-input" type={f.key === 'deadline' ? 'date' : 'text'} placeholder={f.placeholder} value={(form as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                                </div>
                            ))}
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Deal Type</label>
                                <select className="form-select" value={form.deal_type} onChange={e => setForm(f => ({ ...f, deal_type: e.target.value }))}>
                                    {['sponsored_post', 'review', 'mention', 'social_post', 'newsletter', 'bundle'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Disclosure Type</label>
                                <select className="form-select" value={form.disclosure_type} onChange={e => setForm(f => ({ ...f, disclosure_type: e.target.value }))}>
                                    {['paid_partnership', 'sponsored', 'ad', 'gifted'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-group" style={{ marginTop: 12 }}>
                            <label className="form-label">Deliverable</label>
                            <textarea className="form-input" rows={2} value={form.deliverable_description} onChange={e => setForm(f => ({ ...f, deliverable_description: e.target.value }))} placeholder="1x 1500-word review post + 2x social posts..." />
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={create}>Create Deal</button>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    {['all', ...STATUSES].map(s => <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : ''}`} onClick={() => setFilterStatus(s)}>{s}</button>)}
                </div>

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : deals.length === 0 ? <EmptyState icon="🤝" title="No Deals" description="Add your first sponsored deal to start tracking" />
                        : <DataTable data={deals as unknown as Record<string, unknown>[]} searchKeys={['brand_name', 'deal_type']} pageSize={20} columns={[
                            { key: 'brand_name', label: 'Brand', render: (r) => <span style={{ fontWeight: 700 }}>{String(r.brand_name)}</span> },
                            { key: 'deal_type', label: 'Type', render: (r) => <Badge variant="neutral">{String(r.deal_type).replace('_', ' ')}</Badge> },
                            { key: 'agreed_fee', label: 'Fee', render: (r) => <span className="font-mono" style={{ fontWeight: 700, color: '#16a34a' }}>${Number(r.agreed_fee).toFixed(0)}</span> },
                            { key: 'deadline', label: 'Deadline', render: (r) => r.deadline ? <span className={`text-sm ${isOverdue(r as unknown as Deal) ? 'text-danger' : ''}`}>{String(r.deadline).split('T')[0]}{isOverdue(r as unknown as Deal) ? ' ⚠️' : ''}</span> : <span className="text-muted">—</span> },
                            { key: 'disclosure_type', label: 'FTC', render: (r) => <Badge variant="info">{String(r.disclosure_type).replace('_', ' ')}</Badge> },
                            { key: 'status', label: 'Status', render: (r) => (
                                <select className="form-select" style={{ padding: '3px 8px', fontSize: '0.8rem', minWidth: 120 }} value={String(r.status)} onChange={e => updateStatus(String(r.id), e.target.value)}>
                                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            )},
                            { key: 'actions', label: '', render: (r) => <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/sponsored', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) }); fetchDeals(); }}>Del</button> },
                        ]} />
                    }
                </div>
            </main>
        </div>
    );
}
