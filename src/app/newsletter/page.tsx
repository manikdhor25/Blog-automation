'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Send { id: string; subject: string; sent_at: string; subscriber_count: number; open_count: number; click_count: number; open_rate: number; click_rate: number; platform: string; revenue_total: number; }
interface Summary { total_sends: number; latest_subscribers: number; avg_open_rate: number; avg_click_rate: number; total_revenue: number; revenue_per_subscriber: number; revenue_by_type: Record<string, number>; }

export default function NewsletterPage() {
    const toast = useToast();
    const [sends, setSends] = useState<Send[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [showSend, setShowSend] = useState(false);
    const [showRevenue, setShowRevenue] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [sendForm, setSendForm] = useState({ subject: '', subscriber_count: '', open_count: '', click_count: '', unsubscribes: '', platform: 'manual' });
    const [revenueForm, setRevenueForm] = useState({ revenue_type: 'affiliate', amount: '', notes: '' });

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [sRes, sumRes] = await Promise.all([fetch('/api/newsletter'), fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_summary' }) })]);
        const [sData, sumData] = await Promise.all([sRes.json(), sumRes.json()]);
        setSends(sData.sends || []);
        setSummary(sumData.summary || null);
        setLoading(false);
    };

    const logSend = async () => {
        if (!sendForm.subject) { toast.warning('Subject required'); return; }
        const res = await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'log_send', ...sendForm, subscriber_count: parseInt(sendForm.subscriber_count) || 0, open_count: parseInt(sendForm.open_count) || 0, click_count: parseInt(sendForm.click_count) || 0, unsubscribes: parseInt(sendForm.unsubscribes) || 0 }) });
        if (res.ok) { toast.success('Send logged'); setShowSend(false); fetchAll(); }
    };

    const logRevenue = async (sendId: string) => {
        if (!revenueForm.amount) { toast.warning('Amount required'); return; }
        await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'log_revenue', send_id: sendId, ...revenueForm, amount: parseFloat(revenueForm.amount) }) });
        toast.success('Revenue logged');
        setShowRevenue(null);
        setRevenueForm({ revenue_type: 'affiliate', amount: '', notes: '' });
        fetchAll();
    };

    const platforms = ['convertkit', 'mailchimp', 'beehiiv', 'aweber', 'substack', 'manual'];
    const revenueTypes = ['affiliate', 'paid_subscription', 'sponsored_email', 'product_sale'];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Newsletter Revenue</h1>
                        <p className="page-description">Track email list monetization: affiliate clicks, paid subscriptions, sponsored emails</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowSend(true)}>+ Log Send</button>
                </div>

                {summary && (
                    <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                        {[
                            { label: 'Subscribers', value: summary.latest_subscribers.toLocaleString(), icon: '📧' },
                            { label: 'Avg Open Rate', value: `${summary.avg_open_rate.toFixed(1)}%`, icon: '👁️' },
                            { label: 'Total Revenue', value: `$${summary.total_revenue.toFixed(2)}`, icon: '💰' },
                            { label: 'Revenue/Sub', value: `$${summary.revenue_per_subscriber.toFixed(4)}`, icon: '📊' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {summary?.revenue_by_type && Object.keys(summary.revenue_by_type).length > 0 && (
                    <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            {Object.entries(summary.revenue_by_type).map(([type, amount]) => (
                                <div key={type} style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, color: '#16a34a' }}>${amount.toFixed(2)}</div>
                                    <div className="text-sm text-muted">{type.replace('_', ' ')}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {showSend && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Log Email Send</h3><button className="btn btn-sm" onClick={() => setShowSend(false)}>✕</button></div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                <label className="form-label">Subject *</label>
                                <input className="form-input" value={sendForm.subject} onChange={e => setSendForm(f => ({ ...f, subject: e.target.value }))} placeholder="Newsletter subject line" />
                            </div>
                            {[{ key: 'subscriber_count', label: 'Subscribers Sent' }, { key: 'open_count', label: 'Opens' }, { key: 'click_count', label: 'Clicks' }, { key: 'unsubscribes', label: 'Unsubscribes' }].map(f => (
                                <div key={f.key} className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">{f.label}</label>
                                    <input type="number" className="form-input" value={(sendForm as Record<string, string>)[f.key]} onChange={e => setSendForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                                </div>
                            ))}
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Platform</label>
                                <select className="form-select" value={sendForm.platform} onChange={e => setSendForm(f => ({ ...f, platform: e.target.value }))}>
                                    {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={logSend}>Log Send</button>
                    </div>
                )}

                {showRevenue && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Log Revenue for Send</h3><button className="btn btn-sm" onClick={() => setShowRevenue(null)}>✕</button></div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Revenue Type</label>
                                <select className="form-select" value={revenueForm.revenue_type} onChange={e => setRevenueForm(f => ({ ...f, revenue_type: e.target.value }))}>
                                    {revenueTypes.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Amount ($)</label>
                                <input type="number" step="0.01" className="form-input" value={revenueForm.amount} onChange={e => setRevenueForm(f => ({ ...f, amount: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Notes</label>
                                <input className="form-input" value={revenueForm.notes} onChange={e => setRevenueForm(f => ({ ...f, notes: e.target.value }))} placeholder="Sponsor name, product..." />
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => logRevenue(showRevenue)}>Log Revenue</button>
                    </div>
                )}

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : sends.length === 0 ? <EmptyState icon="📧" title="No Sends Logged" description="Log your first email send to start tracking newsletter revenue" />
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {sends.map(s => (
                                <div key={s.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.subject}</div>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                            <span className="text-sm text-muted">{new Date(s.sent_at).toLocaleDateString()}</span>
                                            <span className="text-sm">{s.subscriber_count.toLocaleString()} sent</span>
                                            {s.open_rate && <span className="text-sm">📖 {s.open_rate.toFixed(1)}% open</span>}
                                            {s.click_rate && <span className="text-sm">👆 {s.click_rate.toFixed(1)}% click</span>}
                                            <Badge variant="neutral">{s.platform}</Badge>
                                            {s.revenue_total > 0 && <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.85rem' }}>${s.revenue_total.toFixed(2)}</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="btn btn-sm btn-success" onClick={() => setShowRevenue(s.id)}>+ Revenue</button>
                                        <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: s.id }) }); fetchAll(); }}>Del</button>
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
