'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

interface ForecastMonth { month: string; projected_revenue: number; projected_traffic: number; projected_clicks: number; projected_conversions: number; growth_vs_current: number; }
interface CurrentMetrics { avg_monthly_revenue: number; estimated_monthly_traffic: number; affiliate_ctr: number; conversion_rate: number; ranking_keywords: number; }
interface Milestone { amount: number; label: string; reached: boolean; }

// From /revenue-modeler
interface MonthData { month: number; visitors: number; affiliate_revenue: number; adsense_revenue: number; email_revenue: number; sponsored_revenue: number; total_revenue: number; }
interface Summary { total_12m_revenue: number; total_full_revenue: number; month_12_revenue: number; month_12_visitors: number; break_even_month: number | null; dominant_revenue_source: string; }

export default function ForecasterPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('main');

    // === Forecaster state ===
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [growthRate, setGrowthRate] = useState(10);
    const [avgOrder, setAvgOrder] = useState(50);
    const [monthsAhead, setMonthsAhead] = useState(6);
    const [loading, setLoading] = useState(false);
    const [current, setCurrent] = useState<CurrentMetrics | null>(null);
    const [forecast, setForecast] = useState<ForecastMonth[]>([]);
    const [annual, setAnnual] = useState(0);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [revenueTarget, setRevenueTarget] = useState('');
    const [savingTarget, setSavingTarget] = useState(false);

    // === Scenario Modeler state (from /revenue-modeler) ===
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
    const [modelerResult, setModelerResult] = useState<{ months: MonthData[]; summary: Summary } | null>(null);
    const [modeling, setModeling] = useState(false);

    useEffect(() => { fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])); }, []);

    // === Forecaster functions ===
    const run = async () => {
        setLoading(true);
        const res = await fetch('/api/forecaster', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'forecast', site_id: siteId || undefined, growth_rate_pct: growthRate, avg_order_value: avgOrder, months_ahead: monthsAhead }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setLoading(false); return; }
        setCurrent(data.current);
        setForecast(data.forecast);
        setAnnual(data.annual_projection);
        setMilestones(data.milestones);
        setLoading(false);
    };

    const saveTarget = async () => {
        setSavingTarget(true);
        await fetch('/api/forecaster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_targets', monthly_revenue_target: parseFloat(revenueTarget) }) });
        toast.success('Target saved');
        setSavingTarget(false);
    };

    const maxRevenue = forecast.length ? Math.max(...forecast.map(f => f.projected_revenue)) : 1;

    // === Scenario Modeler functions (from /revenue-modeler) ===
    const model = async () => {
        setModeling(true);
        const res = await fetch('/api/revenue-modeler', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'model', monthly_visitors: parseInt(visitors), traffic_growth_pct_monthly: parseFloat(growthPct), affiliate_ctr_pct: parseFloat(affiliateCtr), affiliate_conversion_pct: parseFloat(affiliateConv), avg_commission: parseFloat(avgCommission), adsense_rpm: parseFloat(adsenseRpm), email_list_size: parseInt(emailList), email_conversion_pct: parseFloat(emailConv), avg_product_price: parseFloat(productPrice), sponsored_posts_per_month: parseFloat(sponsored), avg_sponsored_rate: parseFloat(sponsoredRate), months_to_project: parseInt(months) }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else { setModelerResult(data); }
        setModeling(false);
    };

    const modelerMaxRevenue = modelerResult ? Math.max(...modelerResult.months.map(m => m.total_revenue), 1) : 1;
    const sourceColors: Record<string, string> = { affiliate_revenue: '#2563eb', adsense_revenue: '#16a34a', email_revenue: '#7c3aed', sponsored_revenue: '#d97706' };
    const sourceLabels: Record<string, string> = { affiliate_revenue: 'Affiliate', adsense_revenue: 'AdSense', email_revenue: 'Email/Products', sponsored_revenue: 'Sponsored' };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Revenue Forecaster</h1>
                        <p className="page-description">Project affiliate revenue based on traffic growth, CTR, conversion rate</p>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>📈 Forecaster</button>
                    <button className={`btn ${activeTab === 'modeler' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('modeler')}>🔮 Scenario Modeler</button>
                </div>

                {/* ===== MAIN TAB: Forecaster ===== */}
                {activeTab === 'main' && (
                    <>
                        {/* Controls */}
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Site</label>
                                    <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)} style={{ minWidth: 200 }}>
                                        <option value="">All sites</option>
                                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Monthly Growth %</label>
                                    <input type="number" className="form-input" value={growthRate} onChange={e => setGrowthRate(parseFloat(e.target.value) || 0)} style={{ width: 100 }} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Avg Order Value ($)</label>
                                    <input type="number" className="form-input" value={avgOrder} onChange={e => setAvgOrder(parseFloat(e.target.value) || 0)} style={{ width: 110 }} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Months Ahead</label>
                                    <select className="form-select" value={monthsAhead} onChange={e => setMonthsAhead(parseInt(e.target.value))}>
                                        {[3, 6, 12, 24].map(m => <option key={m} value={m}>{m} months</option>)}
                                    </select>
                                </div>
                                <button className="btn btn-primary" onClick={run} disabled={loading}>
                                    {loading ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Forecasting...</> : '📈 Run Forecast'}
                                </button>
                            </div>
                        </div>

                        {current && (
                            <>
                                {/* Current state */}
                                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                                    {[
                                        { label: 'Avg Monthly Revenue', value: `$${current.avg_monthly_revenue.toFixed(2)}`, icon: '💰' },
                                        { label: 'Est. Monthly Traffic', value: current.estimated_monthly_traffic.toLocaleString(), icon: '👥' },
                                        { label: 'Affiliate CTR', value: `${current.affiliate_ctr.toFixed(2)}%`, icon: '👆' },
                                        { label: 'Conversion Rate', value: `${current.conversion_rate.toFixed(2)}%`, icon: '🎯' },
                                    ].map((s, i) => (
                                        <div key={i} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{s.value}</div>
                                            <div className="text-sm text-muted">{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Annual projection */}
                                <div className="card" style={{ marginBottom: 16, padding: '20px 24px', background: 'linear-gradient(135deg, #1a1a2e, #16213e)', color: '#fff' }}>
                                    <div style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: 4 }}>Annual Revenue Projection</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#4ade80' }}>${annual.toFixed(2)}</div>
                                    <div style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: 4 }}>at {growthRate}% monthly growth · ${avgOrder} avg order</div>
                                </div>

                                {/* Milestones */}
                                <div className="card" style={{ marginBottom: 16 }}>
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Revenue Milestones</h3>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        {milestones.map((m, i) => (
                                            <div key={i} style={{ padding: '8px 14px', borderRadius: 20, background: m.reached ? '#f0fdf4' : 'var(--bg-secondary)', border: `1px solid ${m.reached ? '#86efac' : 'var(--border-color)'}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span>{m.reached ? '✅' : '⭕'}</span>
                                                <span style={{ fontWeight: m.reached ? 700 : 400, color: m.reached ? '#16a34a' : 'var(--text-muted)' }}>{m.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Forecast table + bar chart */}
                                <div className="card" style={{ marginBottom: 16 }}>
                                    <h3 className="card-title" style={{ marginBottom: 16 }}>Monthly Forecast</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {forecast.map((f, i) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 80px', gap: 12, alignItems: 'center' }}>
                                                <span className="text-sm" style={{ fontWeight: 600 }}>{f.month}</span>
                                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 4, height: 20, position: 'relative', overflow: 'hidden' }}>
                                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(f.projected_revenue / maxRevenue) * 100}%`, background: 'linear-gradient(90deg, #4ade80, #22c55e)', borderRadius: 4, transition: 'width 0.5s' }} />
                                                </div>
                                                <span style={{ fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>${f.projected_revenue.toFixed(2)}</span>
                                                <span style={{ fontSize: '0.8rem', color: f.growth_vs_current >= 0 ? '#16a34a' : '#dc2626', textAlign: 'right' }}>
                                                    {f.growth_vs_current >= 0 ? '+' : ''}{f.growth_vs_current.toFixed(1)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Revenue target */}
                                <div className="card">
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Set Revenue Target</h3>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <input type="number" className="form-input" value={revenueTarget} onChange={e => setRevenueTarget(e.target.value)} placeholder="Monthly revenue goal ($)" style={{ maxWidth: 220 }} />
                                        <button className="btn btn-primary btn-sm" onClick={saveTarget} disabled={savingTarget}>Save Target</button>
                                        {revenueTarget && forecast.length > 0 && (
                                            <span className="text-sm text-muted">
                                                {forecast.find(f => f.projected_revenue >= parseFloat(revenueTarget))
                                                    ? `Reached by ${forecast.find(f => f.projected_revenue >= parseFloat(revenueTarget))!.month} 🎯`
                                                    : 'Not reached in forecast period — increase growth rate or add more content'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {!current && !loading && (
                            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>📈</div>
                                <div style={{ fontWeight: 600 }}>Configure settings and click Run Forecast</div>
                            </div>
                        )}
                    </>
                )}

                {/* ===== SCENARIO MODELER TAB (from /revenue-modeler) ===== */}
                {activeTab === 'modeler' && (
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
                            {modelerResult && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {/* Summary cards */}
                                    <div className="grid-2" style={{ gap: 10 }}>
                                        {[
                                            { label: 'Total 12-Month Revenue', value: `$${modelerResult.summary.total_12m_revenue.toLocaleString()}`, color: '#16a34a' },
                                            { label: `Month 12 Revenue`, value: `$${modelerResult.summary.month_12_revenue.toLocaleString()}/mo`, color: '#2563eb' },
                                            { label: 'Month 12 Visitors', value: modelerResult.summary.month_12_visitors.toLocaleString(), color: undefined },
                                            { label: 'Break-even Month', value: modelerResult.summary.break_even_month ? `Month ${modelerResult.summary.break_even_month}` : 'Not reached', color: modelerResult.summary.break_even_month ? '#16a34a' : '#dc2626' },
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
                                            {modelerResult.months.map((m, i) => (
                                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                    <div title={`Month ${m.month}: $${m.total_revenue.toLocaleString()}`} style={{ width: '100%', background: 'var(--accent-primary)', height: `${(m.total_revenue / modelerMaxRevenue) * 100}px`, minHeight: 2, borderRadius: '2px 2px 0 0', cursor: 'pointer' }} />
                                                    {(i + 1) % 3 === 0 && <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{i + 1}</div>}
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                                            {Object.entries(sourceColors).map(([src, color]) => (
                                                <div key={src} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sourceLabels[src]}</span>
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
                                                    {modelerResult.months.map((m, i) => (
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

                            {!modelerResult && !modeling && (
                                <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔮</div>
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Set parameters and project revenue</div>
                                    <div className="text-sm text-muted">Models affiliate, ads, email products, and sponsored revenue over time</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
