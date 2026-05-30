'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import DataTable from '@/components/DataTable';

interface ROIRow { post_id: string; title: string; overall_score: number; ai_cost: number; labor_cost: number; hosting_alloc: number; total_cost: number; affiliate_clicks: number; affiliate_conversions: number; est_revenue: number; profit: number; roi_pct: number; }
interface ROISummary { total_posts: number; total_cost: number; total_revenue: number; total_profit: number; blended_roi_pct: number; top_performer: ROIRow | null; avg_profit_per_post: number; profitable_posts: number; }

export default function ROIPage() {
    const [data, setData] = useState<ROIRow[]>([]);
    const [summary, setSummary] = useState<ROISummary | null>(null);
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [hourlyRate, setHourlyRate] = useState(50);
    const [loading, setLoading] = useState(false);

    useEffect(() => { fetch('/api/roi').then(r => r.json()).then(d => setSites(d.sites || [])); }, []);

    const calculate = async () => {
        setLoading(true);
        const res = await fetch('/api/roi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'calculate', site_id: siteId || undefined, hourly_rate: hourlyRate }) });
        const d = await res.json();
        setData(d.per_post || []);
        setSummary(d.summary || null);
        setLoading(false);
    };

    const roiColor = (pct: number) => pct >= 100 ? '#16a34a' : pct >= 0 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Content ROI Calculator</h1>
                        <p className="page-description">Actual profit per post: AI cost + labor + hosting vs affiliate revenue</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                            <label className="form-label">Site</label>
                            <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                                <option value="">All sites</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Your Hourly Rate ($)</label>
                            <input type="number" className="form-input" value={hourlyRate} onChange={e => setHourlyRate(parseFloat(e.target.value) || 50)} style={{ width: 120 }} />
                        </div>
                        <button className="btn btn-primary" onClick={calculate} disabled={loading}>
                            {loading ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Calculating...</> : 'Calculate ROI'}
                        </button>
                    </div>
                </div>

                {summary && (
                    <>
                        <div className="grid-4" style={{ gap: 16, marginBottom: 16 }}>
                            {[
                                { label: 'Total Cost', value: `$${summary.total_cost.toFixed(2)}`, icon: '💸' },
                                { label: 'Est. Revenue', value: `$${summary.total_revenue.toFixed(2)}`, icon: '💰' },
                                { label: 'Net Profit', value: `$${summary.total_profit.toFixed(2)}`, icon: summary.total_profit >= 0 ? '📈' : '📉' },
                                { label: 'Blended ROI', value: `${summary.blended_roi_pct.toFixed(0)}%`, icon: '🎯' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                    <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
                            <span className="text-sm text-muted">{summary.profitable_posts}/{summary.total_posts} posts profitable · Avg profit per post: <strong>${summary.avg_profit_per_post.toFixed(2)}</strong></span>
                            {summary.top_performer && <span className="text-sm text-muted" style={{ marginLeft: 16 }}>🏆 Top: <strong>{summary.top_performer.title.substring(0, 40)}</strong> (${summary.top_performer.profit.toFixed(2)} profit)</span>}
                        </div>
                    </>
                )}

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : data.length === 0 ? <EmptyState icon="📊" title="No Data" description="Select a site and click Calculate ROI to see results" />
                        : <DataTable data={data as unknown as Record<string, unknown>[]} searchKeys={['title']} pageSize={25} columns={[
                            { key: 'title', label: 'Post', render: (r) => <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{String(r.title).substring(0, 50)}</span> },
                            { key: 'total_cost', label: 'Total Cost', render: (r) => <span className="font-mono">${Number(r.total_cost).toFixed(2)}</span> },
                            { key: 'affiliate_clicks', label: 'Clicks', render: (r) => <span className="font-mono">{Number(r.affiliate_clicks)}</span> },
                            { key: 'est_revenue', label: 'Est. Revenue', render: (r) => <span className="font-mono">${Number(r.est_revenue).toFixed(2)}</span> },
                            { key: 'profit', label: 'Profit', render: (r) => <span className="font-mono" style={{ fontWeight: 700, color: roiColor(Number(r.roi_pct)) }}>${Number(r.profit).toFixed(2)}</span> },
                            { key: 'roi_pct', label: 'ROI', render: (r) => <span style={{ fontWeight: 700, color: roiColor(Number(r.roi_pct)) }}>{Number(r.roi_pct).toFixed(0)}%</span> },
                            { key: 'overall_score', label: 'SEO Score', render: (r) => <span className="font-mono">{Number(r.overall_score)}</span> },
                        ]} />
                    }
                </div>
            </main>
        </div>
    );
}
