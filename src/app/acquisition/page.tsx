'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Prospect {
    id: string;
    name: string;
    url?: string;
    niche: string;
    asking_price: number;
    monthly_revenue: number;
    monthly_traffic: number;
    da?: number;
    age_months?: number;
    monetization: string[];
    acquisition_score: number;
    pros: string[];
    cons: string[];
    due_diligence_checklist: string[];
    source?: string;
    status: 'watching' | 'contacted' | 'due_diligence' | 'negotiating' | 'acquired' | 'passed';
    notes?: string;
    multiple?: number;
    growth_potential?: string;
    risk_level?: string;
    key_opportunity?: string;
    created_at: string;
}

interface ScoutResult extends Prospect { }

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
    watching: 'info', contacted: 'warning', due_diligence: 'warning', negotiating: 'warning', acquired: 'success', passed: 'neutral'
};
const SCORE_COLOR = (s: number) => s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626';
const RISK_COLOR: Record<string, string> = { low: '#16a34a', medium: '#d97706', high: '#dc2626' };

export default function AcquisitionPage() {
    const toast = useToast();
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [scouted, setScouted] = useState<ScoutResult[]>([]);
    const [tab, setTab] = useState<'saved' | 'scout'>('scout');
    const [niche, setNiche] = useState('');
    const [budgetMin, setBudgetMin] = useState('');
    const [budgetMax, setBudgetMax] = useState('50000');
    const [minRevenue, setMinRevenue] = useState('');
    const [ageMin, setAgeMin] = useState('');
    const [notes, setNotes] = useState('');
    const [scouting, setScouting] = useState(false);
    const [saving, setSaving] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => { loadProspects(); }, []);

    const loadProspects = async () => {
        const res = await fetch('/api/acquisition');
        const data = await res.json();
        setProspects(data.prospects || []);
    };

    const scout = async () => {
        if (!niche) { toast.warning('Enter niche'); return; }
        setScouting(true);
        const res = await fetch('/api/acquisition', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'scout', niche,
                budget_min: budgetMin ? parseInt(budgetMin) : 0,
                budget_max: budgetMax ? parseInt(budgetMax) : 50000,
                min_monthly_revenue: minRevenue ? parseInt(minRevenue) : 0,
                age_months_min: ageMin ? parseInt(ageMin) : 0,
                criteria_notes: notes || undefined,
            }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setScouting(false); return; }
        setScouted(data.sites || []);
        toast.success(`Found ${data.sites.length} opportunities`);
        setScouting(false);
    };

    const saveProspect = async (site: ScoutResult, index: number) => {
        setSaving(index);
        const res = await fetch('/api/acquisition', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save', site }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success('Prospect saved to watchlist');
            loadProspects();
        }
        setSaving(null);
    };

    const updateStatus = async (id: string, status: string) => {
        await fetch('/api/acquisition', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_status', prospect_id: id, status }),
        });
        loadProspects();
        toast.success('Status updated');
    };

    const formatPrice = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
    const multiple = (price: number, rev: number) => rev > 0 ? (price / (rev * 12)).toFixed(1) : '—';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Site Acquisition Scout</h1>
                        <p className="page-description">Find undervalued niche sites to buy — score, vet, track due diligence pipeline</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['scout', 'saved'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
                                {t === 'saved' ? `Watchlist (${prospects.length})` : '🔍 Scout'}
                            </button>
                        ))}
                    </div>
                </div>

                {tab === 'scout' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Niche *</label>
                                    <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance, health, pets..." />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Budget Range ($)</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className="form-input" type="number" value={budgetMin} onChange={e => setBudgetMin(e.target.value)} placeholder="Min" />
                                        <input className="form-input" type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} placeholder="Max" />
                                    </div>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Min Monthly Revenue ($)</label>
                                    <input className="form-input" type="number" value={minRevenue} onChange={e => setMinRevenue(e.target.value)} placeholder="500" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Min Site Age (months)</label>
                                    <input className="form-input" type="number" value={ageMin} onChange={e => setAgeMin(e.target.value)} placeholder="12" />
                                </div>
                                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                    <label className="form-label">Additional Criteria</label>
                                    <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. must have email list, prefer Amazon affiliate, no PBN links" />
                                </div>
                            </div>
                            <button className="btn btn-primary" onClick={scout} disabled={scouting}>
                                {scouting ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Scouting...</> : '🔍 Scout Opportunities'}
                            </button>
                        </div>

                        {scouted.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {scouted.sort((a, b) => b.acquisition_score - a.acquisition_score).map((site, i) => (
                                    <div key={i} className="card animate-in">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{site.name}</span>
                                                    {site.url && <span className="text-sm text-muted">{site.url}</span>}
                                                    {site.source && <Badge variant="neutral">{site.source}</Badge>}
                                                </div>
                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: SCORE_COLOR(site.acquisition_score) }}>{site.acquisition_score}/100</span>
                                                    <span style={{ fontWeight: 700, color: '#16a34a' }}>{formatPrice(site.asking_price)}</span>
                                                    <span className="text-sm text-muted">{multiple(site.asking_price, site.monthly_revenue)}x multiple</span>
                                                    <span className="text-sm text-muted">${site.monthly_revenue.toLocaleString()}/mo revenue</span>
                                                    {site.da && <span className="text-sm text-muted">DA {site.da}</span>}
                                                    {site.age_months && <span className="text-sm text-muted">{site.age_months}mo old</span>}
                                                    {site.risk_level && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: RISK_COLOR[site.risk_level] }}>{site.risk_level} risk</span>}
                                                </div>
                                                {site.key_opportunity && (
                                                    <div className="text-sm" style={{ marginTop: 6, color: '#166534' }}>💡 {site.key_opportunity}</div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <button className="btn btn-sm btn-primary" onClick={() => saveProspect(site, i)} disabled={saving === i}>
                                                    {saving === i ? '...' : '+ Watchlist'}
                                                </button>
                                                <button className="btn btn-sm" onClick={() => setExpandedId(expandedId === `scout-${i}` ? null : `scout-${i}`)}>
                                                    {expandedId === `scout-${i}` ? 'Less' : 'Details'}
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                            {site.monetization.map((m, mi) => <Badge key={mi} variant="info">{m}</Badge>)}
                                        </div>

                                        {expandedId === `scout-${i}` && (
                                            <div className="grid-2" style={{ gap: 12, marginTop: 8 }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: '#16a34a', marginBottom: 6 }}>✅ Pros</div>
                                                    {site.pros.map((p, pi) => <div key={pi} className="text-sm" style={{ marginBottom: 3 }}>• {p}</div>)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>❌ Cons</div>
                                                    {site.cons.map((c, ci) => <div key={ci} className="text-sm" style={{ marginBottom: 3 }}>• {c}</div>)}
                                                </div>
                                                <div style={{ gridColumn: '1 / -1' }}>
                                                    <div style={{ fontWeight: 600, marginBottom: 6 }}>🔍 Due Diligence Checklist</div>
                                                    {site.due_diligence_checklist.map((d, di) => (
                                                        <div key={di} className="text-sm" style={{ marginBottom: 3, display: 'flex', gap: 6 }}>
                                                            <input type="checkbox" style={{ marginTop: 2 }} />
                                                            <span>{d}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {scouted.length === 0 && !scouting && (
                            <EmptyState icon="🔍" title="Enter criteria to scout opportunities" description="AI generates realistic acquisition targets from Flippa, Empire Flippers, Motion Invest and direct outreach" />
                        )}
                    </>
                )}

                {tab === 'saved' && (
                    <>
                        {prospects.length === 0 ? (
                            <EmptyState icon="📋" title="Watchlist empty" description="Scout opportunities and save interesting ones to track here" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {prospects.map((p, i) => (
                                    <div key={i} className="card" style={{ padding: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                                                    <span style={{ fontWeight: 700, color: SCORE_COLOR(p.acquisition_score) }}>{p.acquisition_score}/100</span>
                                                    <Badge variant={STATUS_VARIANT[p.status]}>{p.status.replace('_', ' ')}</Badge>
                                                </div>
                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                    <span style={{ color: '#16a34a', fontWeight: 700 }}>{formatPrice(p.asking_price)}</span>
                                                    <span className="text-sm text-muted">${p.monthly_revenue.toLocaleString()}/mo · {multiple(p.asking_price, p.monthly_revenue)}x</span>
                                                    {p.da && <span className="text-sm text-muted">DA {p.da}</span>}
                                                </div>
                                            </div>
                                            <select className="form-input" value={p.status} onChange={e => updateStatus(p.id, e.target.value)} style={{ width: 'auto', fontSize: '0.8rem' }}>
                                                {['watching', 'contacted', 'due_diligence', 'negotiating', 'acquired', 'passed'].map(s => (
                                                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                                            {expandedId === p.id ? 'Hide Details' : 'Due Diligence'}
                                        </button>

                                        {expandedId === p.id && (
                                            <div style={{ marginTop: 10 }}>
                                                {p.due_diligence_checklist.map((d, di) => (
                                                    <div key={di} className="text-sm" style={{ marginBottom: 4, display: 'flex', gap: 6 }}>
                                                        <input type="checkbox" style={{ marginTop: 2 }} />
                                                        <span>{d}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
