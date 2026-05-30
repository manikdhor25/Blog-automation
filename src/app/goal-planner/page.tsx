'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

interface Plan { revenue_gap: number; monthly_sales_needed: number; monthly_traffic_needed: number; traffic_gap: number; total_posts_needed: number; posts_per_month: number; weekly_posts: number; feasibility: string; milestones: Array<{ month: number; target_revenue: number; posts_to_publish: number }>; priority_content_types?: string[]; quick_wins?: string[]; month_1_actions?: string[]; top_affiliate_programs_to_join?: string[]; traffic_sources_priority?: string[]; confidence_score?: number; }

export default function GoalPlannerPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [form, setForm] = useState({ monthly_goal: '5000', current_monthly_revenue: '0', niche: '', avg_commission_rate: '5', avg_order_value: '50', current_monthly_traffic: '0', affiliate_ctr_pct: '3', conversion_rate_pct: '2', timeframe_months: '12', site_id: '' });
    const [plan, setPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(false);
    const [savedPlans, setSavedPlans] = useState<Array<{ id: string; monthly_goal: number; niche: string; created_at: string }>>([]);

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []));
        fetch('/api/goal-planner').then(r => r.json()).then(d => setSavedPlans(d.plans || []));
    }, []);

    const generate = async () => {
        setLoading(true); setPlan(null);
        const res = await fetch('/api/goal-planner', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'plan', ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, isNaN(Number(v)) || v === '' ? v : Number(v)])) }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setLoading(false); return; }
        setPlan(data.plan);
        toast.success(`Plan generated via ${data.provider}`);
        setLoading(false);
        fetch('/api/goal-planner').then(r => r.json()).then(d => setSavedPlans(d.plans || []));
    };

    const feasColor = (f: string) => ({ achievable: '#16a34a', ambitious: '#d97706', very_ambitious: '#dc2626' }[f] || '#6b7280');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Revenue Goal Planner</h1>
                        <p className="page-description">Reverse-engineer your income goal → exact posts, traffic, and content plan needed</p>
                    </div>
                </div>

                <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Your Goal</h3>
                        <div className="grid-2" style={{ gap: 10 }}>
                            {[['Monthly Revenue Goal ($)', 'monthly_goal', '5000'], ['Current Monthly Revenue ($)', 'current_monthly_revenue', '0'], ['Current Monthly Traffic', 'current_monthly_traffic', '0'], ['Avg Order Value ($)', 'avg_order_value', '50'], ['Commission Rate (%)', 'avg_commission_rate', '5'], ['Affiliate CTR (%)', 'affiliate_ctr_pct', '3'], ['Conversion Rate (%)', 'conversion_rate_pct', '2']].map(([label, key, ph]) => (
                                <div key={key} className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">{label}</label>
                                    <input type="number" className="form-input" placeholder={ph} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                                </div>
                            ))}
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Niche</label>
                                <input className="form-input" value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} placeholder="personal finance" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Timeframe</label>
                                <select className="form-select" value={form.timeframe_months} onChange={e => setForm(f => ({ ...f, timeframe_months: e.target.value }))}>
                                    {[[3, '3 months'], [6, '6 months'], [12, '12 months'], [18, '18 months'], [24, '24 months']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Site <span className="text-muted text-sm">(auto-fills)</span></label>
                                <select className="form-select" value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                                    <option value="">Manual entry</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={generate} disabled={loading}>{loading ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Building plan...</> : '🎯 Generate Revenue Plan'}</button>

                        {savedPlans.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.85rem' }}>Previous Plans</div>
                                {savedPlans.slice(0, 3).map(p => (
                                    <div key={p.id} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4, fontSize: '0.8rem' }}>
                                        ${p.monthly_goal}/mo · {p.niche} · {new Date(p.created_at).toLocaleDateString()}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        {plan ? (
                            <div className="card animate-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                                    <h3 className="card-title" style={{ margin: 0 }}>Your Plan to ${(form.monthly_goal || 5000).toLocaleString()}/month</h3>
                                    <span style={{ fontWeight: 700, color: feasColor(plan.feasibility) }}>{plan.feasibility.replace('_', ' ')}</span>
                                </div>

                                <div className="grid-2" style={{ gap: 10, marginBottom: 20 }}>
                                    {[
                                        { l: 'Posts Needed', v: plan.total_posts_needed, icon: '📝' },
                                        { l: 'Posts/Month', v: plan.posts_per_month, icon: '📅' },
                                        { l: 'Posts/Week', v: plan.weekly_posts, icon: '⏰' },
                                        { l: 'Traffic Needed', v: plan.monthly_traffic_needed.toLocaleString(), icon: '👥' },
                                        { l: 'Sales Needed/Mo', v: plan.monthly_sales_needed, icon: '🛒' },
                                        { l: 'Traffic Gap', v: plan.traffic_gap.toLocaleString(), icon: '📈' },
                                    ].map((s, i) => (
                                        <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px' }}>
                                            <div className="text-sm text-muted">{s.icon} {s.l}</div>
                                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{s.v}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Milestones</div>
                                    {plan.milestones?.map((m, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                                            <span className="text-sm">Month {m.month}</span>
                                            <div style={{ display: 'flex', gap: 16 }}>
                                                <span className="text-sm text-muted">{m.posts_to_publish} posts total</span>
                                                <span style={{ fontWeight: 700, color: '#16a34a' }}>${Math.round(m.target_revenue)}/mo</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {plan.quick_wins && plan.quick_wins.length > 0 && (
                                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 8 }}>⚡ Quick Wins This Week</div>
                                        {plan.quick_wins.map((w, i) => <div key={i} className="text-sm" style={{ marginBottom: 4 }}>→ {w}</div>)}
                                    </div>
                                )}

                                {plan.month_1_actions && (
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Month 1 Actions</div>
                                        {plan.month_1_actions.map((a, i) => <div key={i} className="text-sm text-muted" style={{ marginBottom: 3 }}>✓ {a}</div>)}
                                    </div>
                                )}

                                {plan.top_affiliate_programs_to_join && (
                                    <div>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Programs to Join</div>
                                        {plan.top_affiliate_programs_to_join.map((p, i) => <div key={i} className="text-sm text-muted" style={{ marginBottom: 3 }}>• {p}</div>)}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎯</div>
                                <div style={{ fontWeight: 600 }}>Enter your income goal and get an exact action plan</div>
                                <div className="text-sm" style={{ marginTop: 8 }}>Works backwards from revenue goal to daily content tasks</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
