'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Stats { total_revenue: number; total_clicks: number; avg_monthly: number; epc: string; top_program: string; }
interface ByProgram { [program: string]: { total_revenue: number; total_clicks: number; total_conversions: number; months: number } }
interface ByMonth { [month: string]: number }

export default function AffiliateEarningsPage() {
    const toast = useToast();
    const [stats, setStats] = useState<Stats>({ total_revenue: 0, total_clicks: 0, avg_monthly: 0, epc: '0', top_program: '' });
    const [byProgram, setByProgram] = useState<ByProgram>({});
    const [byMonth, setByMonth] = useState<ByMonth>({});
    const [period, setPeriod] = useState('12');
    const [tab, setTab] = useState<'overview' | 'add'>('overview');
    const [program, setProgram] = useState('');
    const [network, setNetwork] = useState('');
    const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
    const [clicks, setClicks] = useState('');
    const [conversions, setConversions] = useState('');
    const [revenue, setRevenue] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); }, [period]);

    const load = async () => {
        const res = await fetch(`/api/affiliate-earnings?months=${period}`);
        const data = await res.json();
        setStats(data.stats || {});
        setByProgram(data.by_program || {});
        setByMonth(data.by_month || {});
    };

    const add = async () => {
        if (!program || !month || !revenue) { toast.warning('Program, month, and revenue required'); return; }
        setSaving(true);
        const res = await fetch('/api/affiliate-earnings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', program, network, month, clicks: clicks ? parseInt(clicks) : 0, conversions: conversions ? parseInt(conversions) : 0, revenue: parseFloat(revenue) }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success('Earnings added');
            setProgram(''); setRevenue(''); setClicks(''); setConversions('');
            load(); setTab('overview');
        }
        setSaving(false);
    };

    const sortedPrograms = Object.entries(byProgram).sort((a, b) => b[1].total_revenue - a[1].total_revenue);
    const sortedMonths = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
    const maxMonthRevenue = Math.max(...Object.values(byMonth), 1);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Affiliate Earnings Dashboard</h1>
                        <p className="page-description">Unified view of commissions across all programs — Amazon, ShareASale, CJ, Impact</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select className="form-input" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 'auto' }}>
                            <option value="3">Last 3 months</option>
                            <option value="6">Last 6 months</option>
                            <option value="12">Last 12 months</option>
                            <option value="24">Last 24 months</option>
                        </select>
                        {(['overview', 'add'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                                {t === 'add' ? '+ Add Earnings' : 'Overview'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                    {[
                        { label: 'Total Revenue', value: `$${(stats.total_revenue || 0).toFixed(2)}`, icon: '💰', color: '#16a34a' },
                        { label: 'Avg Monthly', value: `$${(stats.avg_monthly || 0).toFixed(2)}`, icon: '📊' },
                        { label: 'Total Clicks', value: (stats.total_clicks || 0).toLocaleString(), icon: '👆' },
                        { label: 'EPC', value: `$${stats.epc}`, icon: '🎯' },
                    ].map((s, i) => (
                        <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color }}>{s.value}</div>
                            <div className="text-sm text-muted">{s.label}</div>
                        </div>
                    ))}
                </div>

                {tab === 'add' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Add Monthly Earnings</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Affiliate Program *</label>
                                <input className="form-input" value={program} onChange={e => setProgram(e.target.value)} placeholder="Amazon Associates" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Network</label>
                                <input className="form-input" value={network} onChange={e => setNetwork(e.target.value)} placeholder="Amazon, ShareASale, CJ..." />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Month *</label>
                                <input className="form-input" type="month" value={month} onChange={e => setMonth(e.target.value)} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Revenue ($) *</label>
                                <input className="form-input" type="number" step="0.01" value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="245.50" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Clicks</label>
                                <input className="form-input" type="number" value={clicks} onChange={e => setClicks(e.target.value)} placeholder="1200" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Conversions</label>
                                <input className="form-input" type="number" value={conversions} onChange={e => setConversions(e.target.value)} placeholder="18" />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={add} disabled={saving}>{saving ? 'Saving...' : '💾 Save Earnings'}</button>
                    </div>
                )}

                {tab === 'overview' && (
                    <>
                        {/* Monthly chart */}
                        {sortedMonths.length > 0 && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 12 }}>Monthly Revenue</h3>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 100 }}>
                                    {sortedMonths.map(([m, rev], i) => (
                                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>${rev.toFixed(0)}</div>
                                            <div style={{ width: '100%', background: 'var(--accent-primary)', borderRadius: '2px 2px 0 0', height: `${(rev / maxMonthRevenue) * 70}px`, minHeight: 4 }} />
                                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', transformOrigin: 'top', marginTop: 4 }}>{m.substring(5)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* By program */}
                        {sortedPrograms.length === 0 ? (
                            <EmptyState icon="💰" title="No earnings data" description="Add your monthly earnings from each affiliate program to track performance" />
                        ) : (
                            <div className="card">
                                <h3 className="card-title" style={{ marginBottom: 12 }}>By Program</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {sortedPrograms.map(([prog, data], i) => {
                                        const pct = (data.total_revenue / (stats.total_revenue || 1)) * 100;
                                        return (
                                            <div key={i}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 600 }}>{prog}</span>
                                                    <div style={{ display: 'flex', gap: 16 }}>
                                                        <span style={{ fontWeight: 700, color: '#16a34a' }}>${data.total_revenue.toFixed(2)}</span>
                                                        <span className="text-sm text-muted">${(data.total_revenue / (data.months || 1)).toFixed(0)}/mo</span>
                                                        {data.total_clicks > 0 && <span className="text-sm text-muted">EPC: ${(data.total_revenue / data.total_clicks).toFixed(4)}</span>}
                                                    </div>
                                                </div>
                                                <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3 }}>
                                                    <div style={{ height: '100%', background: `hsl(${210 + i * 30}, 70%, 55%)`, width: `${pct}%`, borderRadius: 3 }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
