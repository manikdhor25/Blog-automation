'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Niche { niche: string; parent_category: string; opportunity_score: number; competition_level: string; monetization_score: number; traffic_potential: string; time_to_revenue_months: number; estimated_monthly_revenue_12mo: number; estimated_monthly_revenue_24mo: number; startup_cost_estimate: number; top_affiliate_programs: string[]; example_keywords: string[]; example_sites: string[]; content_ideas: string[]; why_now: string; risks: string[]; hidden_gem: boolean; sub_niches: string[]; }

const COMP_COLOR: Record<string, string> = { low: '#16a34a', medium: '#d97706', high: '#dc2626' };
const TRAFFIC_COLOR: Record<string, string> = { low: '#6b7280', medium: '#d97706', high: '#16a34a', very_high: '#2563eb' };

export default function NicheWizardPage() {
    const toast = useToast();
    const [seedNiche, setSeedNiche] = useState('');
    const [budget, setBudget] = useState<'bootstrap' | 'moderate' | 'aggressive'>('moderate');
    const [timeCommit, setTimeCommit] = useState<'part_time' | 'full_time'>('part_time');
    const [monetizationPref, setMonetizationPref] = useState<string[]>(['affiliate']);
    const [avoidNiches, setAvoidNiches] = useState('');
    const [niches, setNiches] = useState<Niche[]>([]);
    const [history, setHistory] = useState<Array<{ id: string; seed_niche: string; niches_count: number; created_at: string }>>([]);
    const [researching, setResearching] = useState(false);
    const [expandedNiche, setExpandedNiche] = useState<string | null>(null);

    useEffect(() => { loadHistory(); }, []);

    const loadHistory = async () => {
        const res = await fetch('/api/niche-wizard');
        const data = await res.json();
        setHistory(data.results || []);
    };

    const research = async () => {
        setResearching(true);
        const res = await fetch('/api/niche-wizard', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'research', seed_niche: seedNiche || undefined, budget, time_commitment: timeCommit, monetization_preference: monetizationPref, avoid_niches: avoidNiches ? avoidNiches.split(',').map(s => s.trim()).filter(Boolean) : [] }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setResearching(false); return; }
        setNiches(data.niches || []);
        toast.success(`Found ${data.niches.length} opportunities via ${data.provider}`);
        loadHistory();
        setResearching(false);
    };

    const toggleMon = (m: string) => setMonetizationPref(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Niche Research Wizard</h1>
                        <p className="page-description">Find profitable niches — revenue potential, competition, affiliate programs, content ideas</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Seed Idea <span className="text-muted text-sm">(optional — leave blank for suggestions)</span></label>
                            <input className="form-input" value={seedNiche} onChange={e => setSeedNiche(e.target.value)} placeholder="fitness, finance, pets, tech..." />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Budget</label>
                            <select className="form-input" value={budget} onChange={e => setBudget(e.target.value as typeof budget)}>
                                <option value="bootstrap">Bootstrap (&lt;$500)</option>
                                <option value="moderate">Moderate ($500-2k)</option>
                                <option value="aggressive">Aggressive ($2k+)</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Time Commitment</label>
                            <select className="form-input" value={timeCommit} onChange={e => setTimeCommit(e.target.value as typeof timeCommit)}>
                                <option value="part_time">Part-time (10-20h/week)</option>
                                <option value="full_time">Full-time (40h+/week)</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niches to Avoid <span className="text-muted text-sm">(comma-separated)</span></label>
                            <input className="form-input" value={avoidNiches} onChange={e => setAvoidNiches(e.target.value)} placeholder="crypto, dating, gambling" />
                        </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div className="form-label">Monetization Preference</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {['affiliate', 'adsense', 'info_products', 'sponsored', 'mixed'].map(m => (
                                <button key={m} className={`btn btn-sm ${monetizationPref.includes(m) ? 'btn-primary' : ''}`} onClick={() => toggleMon(m)} style={{ textTransform: 'capitalize' }}>{m.replace('_', ' ')}</button>
                            ))}
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={research} disabled={researching}>{researching ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Researching...</> : '🔮 Find Niches'}</button>
                </div>

                {niches.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {niches.sort((a, b) => b.opportunity_score - a.opportunity_score).map((n, i) => (
                            <div key={i} className="card animate-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{n.niche}</span>
                                            {n.hidden_gem && <Badge variant="warning">💎 Hidden Gem</Badge>}
                                            <Badge variant="neutral">{n.parent_category}</Badge>
                                        </div>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, color: scoreColor(n.opportunity_score) }}>Opp: {n.opportunity_score}/100</span>
                                            <span style={{ fontWeight: 700, color: COMP_COLOR[n.competition_level] }}>Comp: {n.competition_level}</span>
                                            <span style={{ color: TRAFFIC_COLOR[n.traffic_potential], fontWeight: 600 }}>Traffic: {n.traffic_potential}</span>
                                            <span className="text-sm text-muted">Revenue in {n.time_to_revenue_months}mo</span>
                                            <span className="text-sm text-muted">Startup: ${n.startup_cost_estimate.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                                            <div><span className="text-sm text-muted">12mo: </span><span style={{ fontWeight: 700, color: '#16a34a' }}>${n.estimated_monthly_revenue_12mo.toLocaleString()}/mo</span></div>
                                            <div><span className="text-sm text-muted">24mo: </span><span style={{ fontWeight: 700, color: '#16a34a' }}>${n.estimated_monthly_revenue_24mo.toLocaleString()}/mo</span></div>
                                        </div>
                                    </div>
                                    <button className="btn btn-sm" onClick={() => setExpandedNiche(expandedNiche === n.niche ? null : n.niche)}>{expandedNiche === n.niche ? 'Less' : 'More'}</button>
                                </div>

                                <div style={{ padding: '8px 10px', background: '#eff6ff', borderRadius: 4, marginBottom: 8 }}>
                                    <div className="text-sm" style={{ color: '#1e40af' }}>⚡ {n.why_now}</div>
                                </div>

                                {expandedNiche === n.niche && (
                                    <div className="grid-2" style={{ gap: 12, marginTop: 8 }}>
                                        <div>
                                            <div className="form-label">Top Affiliate Programs</div>
                                            {n.top_affiliate_programs.map((p, pi) => <div key={pi} className="text-sm" style={{ marginBottom: 2 }}>• {p}</div>)}
                                        </div>
                                        <div>
                                            <div className="form-label">Example Keywords</div>
                                            {n.example_keywords.map((k, ki) => <div key={ki} className="text-sm text-muted" style={{ marginBottom: 2 }}>• {k}</div>)}
                                        </div>
                                        <div>
                                            <div className="form-label">Content Ideas</div>
                                            {n.content_ideas.map((c, ci) => <div key={ci} className="text-sm" style={{ marginBottom: 2 }}>• {c}</div>)}
                                        </div>
                                        <div>
                                            <div className="form-label">Sub-Niches</div>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                                {n.sub_niches.map((s, si) => <span key={si} style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10, fontSize: '0.8rem' }}>{s}</span>)}
                                            </div>
                                            <div className="form-label" style={{ color: '#dc2626' }}>Risks</div>
                                            {n.risks.map((r, ri) => <div key={ri} className="text-sm text-muted" style={{ marginBottom: 2 }}>• {r}</div>)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {!niches.length && !researching && (
                    <EmptyState icon="🔮" title="Find your next profitable niche" description="Get 8 researched opportunities with revenue estimates, affiliate programs, and content ideas" />
                )}
            </main>
        </div>
    );
}
