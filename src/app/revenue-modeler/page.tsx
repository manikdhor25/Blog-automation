'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

interface MonthData { month: number; visitors: number; affiliate_revenue: number; adsense_revenue: number; email_revenue: number; sponsored_revenue: number; total_revenue: number; }
interface Summary { total_12m_revenue: number; total_full_revenue: number; month_12_revenue: number; month_12_visitors: number; break_even_month: number | null; dominant_revenue_source: string; }

export default function RevenueModelerPage() {
    const toast = useToast();
    const [visitors, setVisitors] = useState('1000');
    const [growthPct, setGrowthPct] = useState('5');
    const [affiliateCtr, setAffiliateCtr] = useState('2');
    const [affiliateConv, setAffiliateConv] = useState('3');
    const [avgCommission, setAvgCommission] = useState('50');
    const [adsenseRpm, setAdsenseRpm] = useState('3');
    const [emailList, setEmailList] = useState('0');
    const [emailConv, setEmailConv] = useState('1');
    const [productPrice, setProductPrice] = useState('97');
    const [sponsored, setSponsored] = useState('0');
    const [sponsoredRate, setSponsoredRate] = useState('500');
    const [months, setMonths] = useState('12');
    const [result, setResult] = useState<{ months: MonthData[]; summary: Summary } | null>(null);
    const [modeling, setModeling] = useState(false);

    const model = async () => {
        setModeling(true);
        const res = await fetch('/api/revenue-modeler', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'model', monthly_visitors: parseInt(visitors), traffic_growth_pct_monthly: parseFloat(growthPct), affiliate_ctr_pct: parseFloat(affiliateCtr), affiliate_conversion_pct: parseFloat(affiliateConv), avg_commission: parseFloat(avgCommission), adsense_rpm: parseFloat(adsenseRpm), email_list_size: parseInt(emailList), email_conversion_pct: parseFloat(emailConv), avg_product_price: parseFloat(productPrice), sponsored_posts_per_month: parseFloat(sponsored), avg_sponsored_rate: parseFloat(sponsoredRate), months_to_project: parseInt(months) }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else { setResult(data); }
        setModeling(false);
    };

    const maxRevenue = result ? Math.max(...result.months.map(m => m.total_revenue), 1) : 1;
    const sourceColors = { affiliate_revenue: '#2563eb', adsense_revenue: '#16a34a', email_revenue: '#7c3aed', sponsored_revenue: '#d97706' };
    const sourceLabels = { affiliate_revenue: 'Affiliate', adsense_revenue: 'AdSense', email_revenue: 'Email/Products', sponsored_revenue: 'Sponsored' };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Affiliate Revenue Modeler</h1>
                        <p className="page-description">Project monthly revenue over 12-24 months based on traffic growth, CTR, commissions</p>
                    </div>
                </div>

                <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Model Parameters</h3>
                        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Traffic</div>
                            <div className="grid-2" style={{ gap: 8 }}>
                                <div><label className="form-label">Starting Visitors/mo</label><input className="form-input" type="number" value={visitors} onChange={e => setVisitors(e.target.value)} /></div>
                                <div><label className="form-label">Monthly Growth %</label><input className="form-input" type="number" step="0.5" value={growthPct} onChange={e => setGrowthPct(e.target.value)} /></div>
                            </div>
                        </div>
                        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.85rem', color: '#2563eb', textTransform: 'uppercase' }}>Affiliate</div>
                            <div className="grid-2" style={{ gap: 8 }}>
                                <div><label className="form-label">Link CTR %</label><input className="form-input" type="number" step="0.1" value={affiliateCtr} onChange={e => setAffiliateCtr(e.target.value)} /></div>
                                <div><label className="form-label">Conversion %</label><input className="form-input" type="number" step="0.1" value={affiliateConv} onChange={e => setAffiliateConv(e.target.value)} /></div>
                                <div><label className="form-label">Avg Commission ($)</label><input className="form-input" type="number" value={avgCommission} onChange={e => setAvgCommission(e.target.value)} /></div>
                            </div>
                        </div>
                        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.85rem', color: '#16a34a', textTransform: 'uppercase' }}>Display Ads</div>
                            <div><label className="form-label">RPM ($)</label><input className="form-input" type="number" step="0.5" value={adsenseRpm} onChange={e => setAdsenseRpm(e.target.value)} /></div>
                        </div>
                        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.85rem', color: '#7c3aed', textTransform: 'uppercase' }}>Email / Info Products</div>
                            <div className="grid-2" style={{ gap: 8 }}>
                                <div><label className="form-label">Starting List Size</label><input className="form-input" type="number" value={emailList} onChange={e => setEmailList(e.target.value)} /></div>
                                <div><label className="form-label">Quarterly Conversion %</label><input className="form-input" type="number" step="0.1" value={emailConv} onChange={e => setEmailConv(e.target.value)} /></div>
                                <div><label className="form-label">Avg Product Price ($)</label><input className="form-input" type="number" value={productPrice} onChange={e => setProductPrice(e.target.value)} /></div>
                            </div>
                        </div>
                        <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.85rem', color: '#d97706', textTransform: 'uppercase' }}>Sponsored Posts</div>
                            <div className="grid-2" style={{ gap: 8 }}>
                                <div><label className="form-label">Posts/Month</label><input className="form-input" type="number" step="0.5" value={sponsored} onChange={e => setSponsored(e.target.value)} /></div>
                                <div><label className="form-label">Rate per Post ($)</label><input className="form-input" type="number" value={sponsoredRate} onChange={e => setSponsoredRate(e.target.value)} /></div>
                            </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: 12 }}>
                            <label className="form-label">Months to Project</label>
                            <select className="form-input" value={months} onChange={e => setMonths(e.target.value)}>
                                {['6', '12', '18', '24', '36'].map(m => <option key={m} value={m}>{m} months</option>)}
                            </select>
                        </div>
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={model} disabled={modeling}>{modeling ? 'Modeling...' : '🔮 Project Revenue'}</button>
                    </div>

                    <div>
                        {result && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {/* Summary cards */}
                                <div className="grid-2" style={{ gap: 10 }}>
                                    {[
                                        { label: 'Total 12-Month Revenue', value: `$${result.summary.total_12m_revenue.toLocaleString()}`, color: '#16a34a' },
                                        { label: `Month 12 Revenue`, value: `$${result.summary.month_12_revenue.toLocaleString()}/mo`, color: '#2563eb' },
                                        { label: 'Month 12 Visitors', value: result.summary.month_12_visitors.toLocaleString(), color: undefined },
                                        { label: 'Break-even Month', value: result.summary.break_even_month ? `Month ${result.summary.break_even_month}` : 'Not reached', color: result.summary.break_even_month ? '#16a34a' : '#dc2626' },
                                    ].map((s, i) => (
                                        <div key={i} className="card" style={{ padding: '12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                                            <div className="text-sm text-muted">{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Bar chart */}
                                <div className="card">
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Monthly Revenue Projection</h3>
                                    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 120 }}>
                                        {result.months.map((m, i) => (
                                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                <div title={`Month ${m.month}: $${m.total_revenue.toLocaleString()}`} style={{ width: '100%', background: 'var(--accent-primary)', height: `${(m.total_revenue / maxRevenue) * 100}px`, minHeight: 2, borderRadius: '2px 2px 0 0', cursor: 'pointer' }} />
                                                {(i + 1) % 3 === 0 && <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{i + 1}</div>}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                                        {Object.entries(sourceColors).map(([src, color]) => (
                                            <div key={src} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sourceLabels[src as keyof typeof sourceLabels]}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Monthly table */}
                                <div className="card">
                                    <h3 className="card-title" style={{ marginBottom: 8 }}>Month-by-Month Breakdown</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                    {['Mo', 'Visitors', 'Affiliate', 'Ads', 'Email', 'Sponsored', 'Total'].map(h => (
                                                        <th key={h} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.months.map((m, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{m.month}</td>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{m.visitors.toLocaleString()}</td>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#2563eb' }}>${m.affiliate_revenue.toLocaleString()}</td>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#16a34a' }}>${m.adsense_revenue.toLocaleString()}</td>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#7c3aed' }}>${m.email_revenue.toLocaleString()}</td>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#d97706' }}>${m.sponsored_revenue.toLocaleString()}</td>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>${m.total_revenue.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!result && !modeling && (
                            <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔮</div>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>Set parameters and project revenue</div>
                                <div className="text-sm text-muted">Models affiliate, ads, email products, and sponsored revenue over time</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
