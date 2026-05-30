'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface OfferTest {
    id: string;
    keyword: string;
    offer_a_name: string;
    offer_a_url: string;
    offer_a_commission_rate?: number;
    offer_a_price?: number;
    offer_b_name: string;
    offer_b_url: string;
    offer_b_commission_rate?: number;
    offer_b_price?: number;
    test_duration_days: number;
    status: 'running' | 'concluded' | 'paused';
    winner?: 'a' | 'b' | 'inconclusive';
    clicks_a: number;
    clicks_b: number;
    conversions_a: number;
    conversions_b: number;
    revenue_a: number;
    revenue_b: number;
    analysis?: Record<string, unknown>;
    started_at: string;
    ends_at: string;
    created_at: string;
}

interface Analysis {
    winner: 'a' | 'b' | 'inconclusive';
    confidence_pct: number;
    lift_pct: number;
    recommendation: string;
    reasoning: string;
    statistical_significance: string;
    action_items: string[];
    ctr_a: string;
    ctr_b: string;
    epc_a: string;
    epc_b: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info'> = { running: 'warning', concluded: 'success', paused: 'info' };
const WINNER_COLOR: Record<string, string> = { a: '#2563eb', b: '#7c3aed', inconclusive: '#6b7280' };

export default function OfferAbPage() {
    const toast = useToast();
    const [tests, setTests] = useState<OfferTest[]>([]);
    const [tab, setTab] = useState<'list' | 'create'>('list');
    const [keyword, setKeyword] = useState('');
    const [offerAName, setOfferAName] = useState('');
    const [offerAUrl, setOfferAUrl] = useState('');
    const [offerARate, setOfferARate] = useState('');
    const [offerAPrice, setOfferAPrice] = useState('');
    const [offerBName, setOfferBName] = useState('');
    const [offerBUrl, setOfferBUrl] = useState('');
    const [offerBRate, setOfferBRate] = useState('');
    const [offerBPrice, setOfferBPrice] = useState('');
    const [duration, setDuration] = useState('14');
    const [creating, setCreating] = useState(false);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [selectedAnalysis, setSelectedAnalysis] = useState<{ id: string; data: Analysis } | null>(null);

    useEffect(() => { loadTests(); }, []);

    const loadTests = async () => {
        const res = await fetch('/api/offer-ab');
        const data = await res.json();
        setTests(data.tests || []);
    };

    const createTest = async () => {
        if (!keyword || !offerAName || !offerAUrl || !offerBName || !offerBUrl) {
            toast.warning('Fill in keyword and both offers'); return;
        }
        setCreating(true);
        const res = await fetch('/api/offer-ab', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_test', keyword,
                offer_a: { name: offerAName, url: offerAUrl, commission_rate: offerARate ? parseFloat(offerARate) : undefined, price: offerAPrice ? parseFloat(offerAPrice) : undefined },
                offer_b: { name: offerBName, url: offerBUrl, commission_rate: offerBRate ? parseFloat(offerBRate) : undefined, price: offerBPrice ? parseFloat(offerBPrice) : undefined },
                test_duration_days: parseInt(duration),
            }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setCreating(false); return; }
        toast.success('A/B test created');
        setKeyword(''); setOfferAName(''); setOfferAUrl(''); setOfferBName(''); setOfferBUrl('');
        setOfferARate(''); setOfferAPrice(''); setOfferBRate(''); setOfferBPrice('');
        loadTests(); setTab('list');
        setCreating(false);
    };

    const analyze = async (id: string) => {
        setAnalyzing(id);
        const res = await fetch('/api/offer-ab', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'analyze', test_id: id }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setSelectedAnalysis({ id, data: data.analysis });
            toast.success('Analysis complete');
            loadTests();
        }
        setAnalyzing(null);
    };

    const ctr = (clicks: number, conv: number) => clicks > 0 ? ((conv / clicks) * 100).toFixed(1) : '0';
    const epc = (clicks: number, rev: number) => clicks > 0 ? (rev / clicks).toFixed(4) : '0.0000';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Affiliate Offer A/B Tester</h1>
                        <p className="page-description">Test two affiliate offers side-by-side — CTR, EPC, revenue. AI picks winner.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['list', 'create'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                                {t === 'create' ? '+ New Test' : 'Tests'}
                            </button>
                        ))}
                    </div>
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 16 }}>New A/B Test</h3>
                        <div className="form-group">
                            <label className="form-label">Keyword / Post Topic *</label>
                            <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best web hosting 2025" />
                        </div>

                        <div className="grid-2" style={{ gap: 16, marginBottom: 12 }}>
                            {/* Offer A */}
                            <div style={{ padding: '14px', background: '#eff6ff', borderRadius: 8 }}>
                                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 10 }}>🅰 Offer A</div>
                                <div className="form-group" style={{ margin: '0 0 8px' }}>
                                    <label className="form-label">Name *</label>
                                    <input className="form-input" value={offerAName} onChange={e => setOfferAName(e.target.value)} placeholder="Bluehost" />
                                </div>
                                <div className="form-group" style={{ margin: '0 0 8px' }}>
                                    <label className="form-label">Affiliate URL *</label>
                                    <input className="form-input" value={offerAUrl} onChange={e => setOfferAUrl(e.target.value)} placeholder="https://affiliate.link/a" />
                                </div>
                                <div className="grid-2" style={{ gap: 8 }}>
                                    <div>
                                        <label className="form-label">Commission %</label>
                                        <input className="form-input" type="number" value={offerARate} onChange={e => setOfferARate(e.target.value)} placeholder="65" />
                                    </div>
                                    <div>
                                        <label className="form-label">Price ($)</label>
                                        <input className="form-input" type="number" value={offerAPrice} onChange={e => setOfferAPrice(e.target.value)} placeholder="2.95" />
                                    </div>
                                </div>
                            </div>

                            {/* Offer B */}
                            <div style={{ padding: '14px', background: '#faf5ff', borderRadius: 8 }}>
                                <div style={{ fontWeight: 700, color: '#6d28d9', marginBottom: 10 }}>🅱 Offer B</div>
                                <div className="form-group" style={{ margin: '0 0 8px' }}>
                                    <label className="form-label">Name *</label>
                                    <input className="form-input" value={offerBName} onChange={e => setOfferBName(e.target.value)} placeholder="SiteGround" />
                                </div>
                                <div className="form-group" style={{ margin: '0 0 8px' }}>
                                    <label className="form-label">Affiliate URL *</label>
                                    <input className="form-input" value={offerBUrl} onChange={e => setOfferBUrl(e.target.value)} placeholder="https://affiliate.link/b" />
                                </div>
                                <div className="grid-2" style={{ gap: 8 }}>
                                    <div>
                                        <label className="form-label">Commission %</label>
                                        <input className="form-input" type="number" value={offerBRate} onChange={e => setOfferBRate(e.target.value)} placeholder="50" />
                                    </div>
                                    <div>
                                        <label className="form-label">Price ($)</label>
                                        <input className="form-input" type="number" value={offerBPrice} onChange={e => setOfferBPrice(e.target.value)} placeholder="3.99" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Test Duration</label>
                            <select className="form-input" value={duration} onChange={e => setDuration(e.target.value)} style={{ maxWidth: 200 }}>
                                {['7', '14', '21', '30', '60', '90'].map(d => <option key={d} value={d}>{d} days</option>)}
                            </select>
                        </div>

                        <button className="btn btn-primary" onClick={createTest} disabled={creating}>
                            {creating ? 'Creating...' : '🧪 Start A/B Test'}
                        </button>
                    </div>
                )}

                {tab === 'list' && (
                    <>
                        {tests.length === 0 ? (
                            <EmptyState icon="🧪" title="No A/B tests yet" description="Test different affiliate offers to find which earns more per click" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {tests.map((test, i) => (
                                    <div key={i} className="card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                            <div>
                                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{test.keyword}</div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Badge variant={STATUS_VARIANT[test.status]}>{test.status}</Badge>
                                                    {test.winner && <span style={{ fontWeight: 700, color: WINNER_COLOR[test.winner] }}>Winner: {test.winner === 'inconclusive' ? 'Inconclusive' : `Offer ${test.winner.toUpperCase()}`}</span>}
                                                    <span className="text-sm text-muted">Ends {new Date(test.ends_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            {test.status === 'running' && (
                                                <button className="btn btn-sm btn-primary" onClick={() => analyze(test.id)} disabled={analyzing === test.id}>
                                                    {analyzing === test.id ? 'Analyzing...' : '🤖 Analyze'}
                                                </button>
                                            )}
                                        </div>

                                        {/* Comparison bars */}
                                        <div className="grid-2" style={{ gap: 12 }}>
                                            {[
                                                { label: test.offer_a_name, clicks: test.clicks_a, conv: test.conversions_a, rev: test.revenue_a, color: '#2563eb', variant: 'A' },
                                                { label: test.offer_b_name, clicks: test.clicks_b, conv: test.conversions_b, rev: test.revenue_b, color: '#7c3aed', variant: 'B' },
                                            ].map((offer, oi) => (
                                                <div key={oi} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${offer.color}` }}>
                                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                                        <span style={{ color: offer.color }}>Offer {offer.variant}:</span> {offer.label}
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                                        <div><div className="text-sm text-muted">Clicks</div><div style={{ fontWeight: 700 }}>{offer.clicks}</div></div>
                                                        <div><div className="text-sm text-muted">CTR</div><div style={{ fontWeight: 700 }}>{ctr(offer.clicks, offer.conv)}%</div></div>
                                                        <div><div className="text-sm text-muted">EPC</div><div style={{ fontWeight: 700 }}>${epc(offer.clicks, offer.rev)}</div></div>
                                                    </div>
                                                    <div style={{ marginTop: 6 }}>
                                                        <div className="text-sm text-muted">Revenue: <strong>${offer.rev.toFixed(2)}</strong> · Conversions: <strong>{offer.conv}</strong></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {selectedAnalysis?.id === test.id && (
                                            <div style={{ marginTop: 12, padding: '12px 14px', background: '#f0fdf4', borderRadius: 8 }}>
                                                <div style={{ fontWeight: 700, marginBottom: 8 }}>🤖 AI Analysis</div>
                                                <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                                                    <span>Winner: <strong style={{ color: WINNER_COLOR[selectedAnalysis.data.winner] }}>Offer {selectedAnalysis.data.winner.toUpperCase()}</strong></span>
                                                    <span>Confidence: <strong>{selectedAnalysis.data.confidence_pct}%</strong></span>
                                                    <span>Lift: <strong>+{selectedAnalysis.data.lift_pct}%</strong></span>
                                                </div>
                                                <div className="text-sm" style={{ marginBottom: 6 }}>{selectedAnalysis.data.recommendation}</div>
                                                <div className="text-sm text-muted">{selectedAnalysis.data.reasoning}</div>
                                                {selectedAnalysis.data.action_items?.length > 0 && (
                                                    <div style={{ marginTop: 8 }}>
                                                        {selectedAnalysis.data.action_items.map((item, ai) => (
                                                            <div key={ai} className="text-sm">• {item}</div>
                                                        ))}
                                                    </div>
                                                )}
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
