'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

interface ValuationResult { valuation_low: number; valuation_mid: number; valuation_high: number; applied_multiple: number; multiple_range: string; annual_revenue: number; revenue_per_session: number; factors: Record<string, string>; }

export default function ValuationPage() {
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [form, setForm] = useState({ monthly_revenue: '', monthly_sessions: '', domain_authority: '20', domain_age_years: '2', niche_type: 'affiliate', revenue_trend: 'stable', content_count: '', email_subscribers: '' });
    const [result, setResult] = useState<ValuationResult | null>(null);
    const [history, setHistory] = useState<Array<{ snapshot_date: string; valuation_mid: number; monthly_revenue: number }>>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => { fetch('/api/valuation').then(r => r.json()).then(d => setSites(d.sites || [])); }, []);

    const calculate = async () => {
        setLoading(true);
        const res = await fetch('/api/valuation', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'calculate', site_id: siteId || undefined,
                ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, isNaN(Number(v)) || v === '' ? v : Number(v)])),
            }),
        });
        const data = await res.json();
        setResult(data.valuation);
        setLoading(false);
    };

    const save = async () => {
        await fetch('/api/valuation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_snapshot', site_id: siteId || undefined, ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, isNaN(Number(v)) || v === '' ? v : Number(v)])) }) });
        const res = await fetch(`/api/valuation${siteId ? `?site_id=${siteId}` : ''}`);
        const data = await res.json();
        setHistory(data.history || []);
    };

    useEffect(() => {
        if (siteId) fetch(`/api/valuation?site_id=${siteId}`).then(r => r.json()).then(d => setHistory(d.history || []));
    }, [siteId]);

    const formatMoney = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Site Valuation</h1>
                        <p className="page-description">Estimate your site sale value — industry-standard revenue multiples</p>
                    </div>
                </div>

                <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Valuation Inputs</h3>
                        <div className="form-group">
                            <label className="form-label">Site <span className="text-muted text-sm">(auto-fills some fields)</span></label>
                            <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                                <option value="">Manual entry</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="grid-2" style={{ gap: 12 }}>
                            {[
                                { key: 'monthly_revenue', label: 'Monthly Revenue ($)', placeholder: '2500' },
                                { key: 'monthly_sessions', label: 'Monthly Sessions', placeholder: '50000' },
                                { key: 'domain_authority', label: 'Domain Authority', placeholder: '30' },
                                { key: 'domain_age_years', label: 'Domain Age (years)', placeholder: '3' },
                                { key: 'content_count', label: 'Published Posts', placeholder: '150' },
                                { key: 'email_subscribers', label: 'Email Subscribers', placeholder: '2000' },
                            ].map(f => (
                                <div key={f.key} className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">{f.label}</label>
                                    <input type="number" className="form-input" placeholder={f.placeholder} value={(form as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                                </div>
                            ))}
                        </div>
                        <div className="grid-2" style={{ gap: 12, marginTop: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche Type</label>
                                <select className="form-select" value={form.niche_type} onChange={e => setForm(f => ({ ...f, niche_type: e.target.value }))}>
                                    {['affiliate', 'display_ads', 'saas', 'ecommerce', 'info', 'mixed'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Revenue Trend</label>
                                <select className="form-select" value={form.revenue_trend} onChange={e => setForm(f => ({ ...f, revenue_trend: e.target.value }))}>
                                    {['growing', 'stable', 'declining'].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button className="btn btn-primary" onClick={calculate} disabled={loading}>
                                {loading ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Calculating...</> : 'Calculate Value'}
                            </button>
                            {result && <button className="btn btn-sm" onClick={save}>Save Snapshot</button>}
                        </div>
                    </div>

                    <div>
                        {result && (
                            <div className="card animate-in">
                                <h3 className="card-title" style={{ marginBottom: 20 }}>Estimated Valuation</h3>

                                <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                                    {[
                                        { label: 'Conservative', value: result.valuation_low, color: '#d97706' },
                                        { label: 'Market Value', value: result.valuation_mid, color: '#16a34a' },
                                        { label: 'Optimistic', value: result.valuation_high, color: '#2563eb' },
                                    ].map((v, i) => (
                                        <div key={i} style={{ flex: 1, textAlign: 'center', padding: '16px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                            <div className="text-sm text-muted">{v.label}</div>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: v.color }}>{formatMoney(v.value)}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                                    {[
                                        { label: 'Multiple Applied', value: `${result.applied_multiple}x` },
                                        { label: 'Multiple Range', value: result.multiple_range },
                                        { label: 'Annual Revenue', value: formatMoney(result.annual_revenue) },
                                        { label: 'Revenue/1K Sessions', value: `$${result.revenue_per_session}` },
                                    ].map((m, i) => (
                                        <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                            <div className="text-sm text-muted">{m.label}</div>
                                            <div style={{ fontWeight: 700 }}>{m.value}</div>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <div className="form-label" style={{ marginBottom: 8 }}>Multiple Adjustment Factors</div>
                                    {Object.entries(result.factors).map(([key, value]) => (
                                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                                            <span className="text-muted">{key.replace('_', ' ')}</span>
                                            <span style={{ fontWeight: 600, color: value.startsWith('+') ? '#16a34a' : value.startsWith('-') ? '#dc2626' : undefined }}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {history.length > 0 && (
                            <div className="card" style={{ marginTop: 16 }}>
                                <div className="card-title" style={{ marginBottom: 12 }}>Valuation History</div>
                                {history.map((h, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                                        <span className="text-sm text-muted">{h.snapshot_date}</span>
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <span className="text-sm">Rev: ${h.monthly_revenue}/mo</span>
                                            <span style={{ fontWeight: 700, color: '#16a34a' }}>{formatMoney(h.valuation_mid)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!result && (
                            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>💎</div>
                                <div style={{ fontWeight: 600 }}>Valuation appears here</div>
                                <div className="text-sm" style={{ marginTop: 8 }}>Enter monthly revenue and click Calculate</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
