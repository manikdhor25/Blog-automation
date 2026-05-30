'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface GapDomain { domain: string; da_estimate: number; linking_to_competitors: string[]; link_type: string; how_they_link: string; outreach_angle: string; contact_approach: string; priority_score: number; why_they_would_link_to_you: string; }
interface GapResult { gap_domains: GapDomain[]; total_gaps: number; quick_wins: string[]; strategy_summary: string; }

const LINK_TYPE_COLOR: Record<string, string> = { editorial: '#16a34a', resource_page: '#2563eb', guest_post_opportunity: '#7c3aed', directory: '#d97706', citation: '#ea580c' };

export default function BacklinkGapPage() {
    const toast = useToast();
    const [yourDomain, setYourDomain] = useState('');
    const [competitors, setCompetitors] = useState('');
    const [niche, setNiche] = useState('');
    const [linkType, setLinkType] = useState('any');
    const [result, setResult] = useState<GapResult | null>(null);
    const [history, setHistory] = useState<Array<{ id: string; your_domain: string; competitor_domains: string[]; gap_count: number; created_at: string }>>([]);
    const [finding, setFinding] = useState(false);
    const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

    useEffect(() => { loadHistory(); }, []);

    const loadHistory = async () => {
        const res = await fetch('/api/backlink-gap');
        const data = await res.json();
        setHistory(data.results || []);
    };

    const find = async () => {
        const compList = competitors.split('\n').map(s => s.trim()).filter(Boolean);
        if (!yourDomain) { toast.warning('Enter your domain'); return; }
        if (compList.length < 2) { toast.warning('Enter at least 2 competitor domains'); return; }
        setFinding(true);
        const res = await fetch('/api/backlink-gap', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'find_gap', your_domain: yourDomain, competitor_domains: compList, niche: niche || undefined, link_type_preference: linkType }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setFinding(false); return; }
        setResult(data.result);
        toast.success(`Found ${data.result.gap_domains?.length} backlink gap opportunities`);
        loadHistory();
        setFinding(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Competitor Backlink Gap</h1>
                        <p className="page-description">Find domains linking to 2+ competitors but not you — highest-quality link prospects</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Your Domain *</label>
                            <input className="form-input" value={yourDomain} onChange={e => setYourDomain(e.target.value)} placeholder="yourblog.com" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Niche</label>
                            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="personal finance" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Competitor Domains * <span className="text-muted text-sm">(2-5, one per line)</span></label>
                            <textarea className="form-input" rows={4} value={competitors} onChange={e => setCompetitors(e.target.value)} placeholder={"nerdwallet.com\nbankrate.com\nthepointsguy.com"} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Link Type Preference</label>
                            <select className="form-input" value={linkType} onChange={e => setLinkType(e.target.value)}>
                                <option value="any">Any type</option>
                                <option value="editorial">Editorial</option>
                                <option value="dofollow">Dofollow only</option>
                                <option value="resource">Resource pages</option>
                            </select>
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={find} disabled={finding}>{finding ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🔍 Find Backlink Gaps'}</button>
                </div>

                {result && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>📋 Strategy</div>
                            <p className="text-sm">{result.strategy_summary}</p>
                            {result.quick_wins?.length > 0 && (
                                <div style={{ marginTop: 10 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 6 }}>⚡ Quick Wins</div>
                                    {result.quick_wins.map((w, i) => <div key={i} className="text-sm" style={{ marginBottom: 3 }}>• {w}</div>)}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {result.gap_domains?.sort((a, b) => b.priority_score - a.priority_score).map((d, i) => (
                                <div key={i} className="card" style={{ padding: '12px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setExpandedDomain(expandedDomain === d.domain ? null : d.domain)}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 700 }}>{d.domain}</span>
                                                <span className="text-sm text-muted">DA ~{d.da_estimate}</span>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: LINK_TYPE_COLOR[d.link_type] || '#6b7280', border: `1px solid ${LINK_TYPE_COLOR[d.link_type] || '#6b7280'}`, padding: '1px 6px', borderRadius: 10 }}>{d.link_type?.replace('_', ' ')}</span>
                                                <span style={{ fontWeight: 700, color: d.priority_score >= 80 ? '#16a34a' : d.priority_score >= 60 ? '#d97706' : '#6b7280', fontSize: '0.85rem' }}>Score: {d.priority_score}</span>
                                            </div>
                                            <div className="text-sm text-muted">Links to: {d.linking_to_competitors?.join(', ')}</div>
                                        </div>
                                        <span style={{ color: 'var(--text-muted)' }}>{expandedDomain === d.domain ? '▲' : '▼'}</span>
                                    </div>

                                    {expandedDomain === d.domain && (
                                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <div className="form-label">How They Link</div>
                                                <div className="text-sm text-muted">{d.how_they_link}</div>
                                            </div>
                                            <div>
                                                <div className="form-label">Why They'd Link To You</div>
                                                <div className="text-sm">{d.why_they_would_link_to_you}</div>
                                            </div>
                                            <div>
                                                <div className="form-label">Outreach Angle</div>
                                                <div className="text-sm" style={{ color: '#16a34a' }}>{d.outreach_angle}</div>
                                            </div>
                                            <div>
                                                <div className="form-label">How to Contact</div>
                                                <div className="text-sm text-muted">{d.contact_approach}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {history.length > 0 && !result && (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Previous Analyses</h3>
                        {history.map((h, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                <div><span style={{ fontWeight: 600 }}>{h.your_domain}</span><span className="text-sm text-muted" style={{ marginLeft: 8 }}>vs {h.competitor_domains.join(', ')}</span></div>
                                <div style={{ display: 'flex', gap: 12 }}><span className="text-sm text-muted">{h.gap_count} gaps</span><span className="text-sm text-muted">{new Date(h.created_at).toLocaleDateString()}</span></div>
                            </div>
                        ))}
                    </div>
                )}

                {!result && !finding && history.length === 0 && <EmptyState icon="🔍" title="Enter your domain and competitors" description="Finds sites linking to 2+ competitors but not you — your highest-value link targets" />}
            </main>
        </div>
    );
}
