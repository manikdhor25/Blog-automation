'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Variant {
    id: string; name: string; title: string; meta_description: string;
    impressions: number; clicks: number; ctr: number; is_active: boolean;
}

interface ABTest {
    id: string; test_name: string; test_type: string; status: string;
    variants: Variant[]; start_date: string; end_date?: string;
    winner_variant?: string; auto_optimize: boolean;
    stats: { totalImpressions: number; totalClicks: number; avgCTR: string; confidence: number; significantAt95: boolean };
}

// From /offer-ab
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

interface OfferAnalysis {
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

const OFFER_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info'> = { running: 'warning', concluded: 'success', paused: 'info' };
const WINNER_COLOR: Record<string, string> = { a: '#2563eb', b: '#7c3aed', inconclusive: '#6b7280' };

export default function ABTestsPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('tests');
    const [tests, setTests] = useState<ABTest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newTest, setNewTest] = useState({
        test_name: '', test_type: 'title' as string,
        variants: [
            { name: 'Variant A', title: '', meta_description: '' },
            { name: 'Variant B', title: '', meta_description: '' },
        ],
    });

    // Offer A/B state
    const [offerTests, setOfferTests] = useState<OfferTest[]>([]);
    const [offerTab, setOfferTab] = useState<'list' | 'create'>('list');
    const [offerKeyword, setOfferKeyword] = useState('');
    const [offerAName, setOfferAName] = useState('');
    const [offerAUrl, setOfferAUrl] = useState('');
    const [offerARate, setOfferARate] = useState('');
    const [offerAPrice, setOfferAPrice] = useState('');
    const [offerBName, setOfferBName] = useState('');
    const [offerBUrl, setOfferBUrl] = useState('');
    const [offerBRate, setOfferBRate] = useState('');
    const [offerBPrice, setOfferBPrice] = useState('');
    const [offerDuration, setOfferDuration] = useState('14');
    const [offerCreating, setOfferCreating] = useState(false);
    const [offerAnalyzing, setOfferAnalyzing] = useState<string | null>(null);
    const [selectedOfferAnalysis, setSelectedOfferAnalysis] = useState<{ id: string; data: OfferAnalysis } | null>(null);

    useEffect(() => { fetchTests(); }, []);
    useEffect(() => { if (activeTab === 'offer-tests') loadOfferTests(); }, [activeTab]);

    const fetchTests = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/ab-tests');
            const data = await res.json();
            setTests(data.tests || []);
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    const handleCreate = async () => {
        if (!newTest.test_name) { toast.warning('Test name required'); return; }
        if (newTest.variants.some(v => !v.title)) { toast.warning('All variants need a title'); return; }
        try {
            const res = await fetch('/api/ab-tests', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', ...newTest }),
            });
            if (res.ok) {
                toast.success('A/B test created!');
                setShowCreate(false);
                setNewTest({ test_name: '', test_type: 'title', variants: [{ name: 'Variant A', title: '', meta_description: '' }, { name: 'Variant B', title: '', meta_description: '' }] });
                fetchTests();
            }
        } catch { toast.error('Failed to create test'); }
    };

    const handleSwitchVariant = async (testId: string, variantId: string) => {
        try {
            await fetch('/api/ab-tests', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'switch_variant', test_id: testId, variant_id: variantId }),
            });
            toast.success('Variant switched!');
            fetchTests();
        } catch { toast.error('Failed to switch'); }
    };

    const handleDeclareWinner = async (testId: string, winnerId: string) => {
        try {
            await fetch('/api/ab-tests', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'declare_winner', test_id: testId, winner_id: winnerId }),
            });
            toast.success('Winner declared! Test complete.');
            fetchTests();
        } catch { toast.error('Failed to declare winner'); }
    };

    const confidenceColor = (c: number) => {
        if (c >= 95) return 'var(--accent-success)';
        if (c >= 80) return 'var(--accent-warning)';
        return 'var(--text-muted)';
    };

    // Offer A/B functions
    const loadOfferTests = async () => {
        const res = await fetch('/api/offer-ab');
        const data = await res.json();
        setOfferTests(data.tests || []);
    };

    const createOfferTest = async () => {
        if (!offerKeyword || !offerAName || !offerAUrl || !offerBName || !offerBUrl) {
            toast.warning('Fill in keyword and both offers'); return;
        }
        setOfferCreating(true);
        const res = await fetch('/api/offer-ab', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_test', keyword: offerKeyword,
                offer_a: { name: offerAName, url: offerAUrl, commission_rate: offerARate ? parseFloat(offerARate) : undefined, price: offerAPrice ? parseFloat(offerAPrice) : undefined },
                offer_b: { name: offerBName, url: offerBUrl, commission_rate: offerBRate ? parseFloat(offerBRate) : undefined, price: offerBPrice ? parseFloat(offerBPrice) : undefined },
                test_duration_days: parseInt(offerDuration),
            }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setOfferCreating(false); return; }
        toast.success('A/B test created');
        setOfferKeyword(''); setOfferAName(''); setOfferAUrl(''); setOfferBName(''); setOfferBUrl('');
        setOfferARate(''); setOfferAPrice(''); setOfferBRate(''); setOfferBPrice('');
        loadOfferTests(); setOfferTab('list');
        setOfferCreating(false);
    };

    const analyzeOffer = async (id: string) => {
        setOfferAnalyzing(id);
        const res = await fetch('/api/offer-ab', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'analyze', test_id: id }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            setSelectedOfferAnalysis({ id, data: data.analysis });
            toast.success('Analysis complete');
            loadOfferTests();
        }
        setOfferAnalyzing(null);
    };

    const offerCtr = (clicks: number, conv: number) => clicks > 0 ? ((conv / clicks) * 100).toFixed(1) : '0';
    const offerEpc = (clicks: number, rev: number) => clicks > 0 ? (rev / clicks).toFixed(4) : '0.0000';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">A/B Testing</h1>
                        <p className="page-description">Test title, meta, and content variants to optimize CTR</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => { if (activeTab === 'tests') setShowCreate(true); else setOfferTab('create'); }}>+ New Test</button>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'tests' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('tests')}>🧪 Title/Meta Tests</button>
                    <button className={`btn ${activeTab === 'offer-tests' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('offer-tests')}>💰 Offer Tests</button>
                </div>

                {activeTab === 'tests' && (
                    <>
                        {/* Create form */}
                        {showCreate && (
                            <div className="card animate-in" style={{ marginBottom: 16 }}>
                                <div className="card-header">
                                    <h3 className="card-title">Create A/B Test</h3>
                                    <button className="btn btn-sm" onClick={() => setShowCreate(false)}>✕</button>
                                </div>
                                <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Test Name</label>
                                        <input className="form-input" placeholder="e.g., Homepage Title Test"
                                            value={newTest.test_name} onChange={e => setNewTest(p => ({ ...p, test_name: e.target.value }))} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Test Type</label>
                                        <select className="form-select" value={newTest.test_type}
                                            onChange={e => setNewTest(p => ({ ...p, test_type: e.target.value }))}>
                                            <option value="title">Title Test</option>
                                            <option value="meta">Meta Description Test</option>
                                            <option value="content">Content Test</option>
                                        </select>
                                    </div>
                                </div>
                                {newTest.variants.map((v, i) => (
                                    <div key={i} className="card" style={{ marginBottom: 12, padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8, color: i === 0 ? 'var(--accent-primary-light)' : 'var(--accent-warning)' }}>
                                            {v.name}
                                        </div>
                                        <div className="form-group" style={{ margin: '0 0 8px' }}>
                                            <input className="form-input" placeholder="Title variant"
                                                value={v.title} onChange={e => {
                                                    const updated = [...newTest.variants];
                                                    updated[i] = { ...updated[i], title: e.target.value };
                                                    setNewTest(p => ({ ...p, variants: updated }));
                                                }} />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <input className="form-input" placeholder="Meta description variant"
                                                value={v.meta_description} onChange={e => {
                                                    const updated = [...newTest.variants];
                                                    updated[i] = { ...updated[i], meta_description: e.target.value };
                                                    setNewTest(p => ({ ...p, variants: updated }));
                                                }} />
                                        </div>
                                    </div>
                                ))}
                                <button className="btn btn-primary" onClick={handleCreate}>Create Test</button>
                            </div>
                        )}

                        {/* Tests list */}
                        {loading ? (
                            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                                <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                            </div>
                        ) : tests.length === 0 ? (
                            <div className="card">
                                <EmptyState icon="🧪" title="No A/B Tests Yet" description="Create your first test to start optimizing CTR and rankings" />
                            </div>
                        ) : (
                            tests.map(test => (
                                <div key={test.id} className="card" style={{ marginBottom: 16 }}>
                                    <div className="card-header">
                                        <div>
                                            <h3 className="card-title">{test.test_name}</h3>
                                            <div className="text-sm text-muted">
                                                {test.test_type} test • Started {new Date(test.start_date).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Badge variant={test.status === 'active' ? 'success' : 'neutral'}>{test.status}</Badge>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: confidenceColor(test.stats.confidence) }}>
                                                    {test.stats.confidence}%
                                                </div>
                                                <div className="text-xs text-muted">confidence</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Variant comparison */}
                                    <div className="grid-2" style={{ gap: 12 }}>
                                        {test.variants.map((v, i) => (
                                            <div key={v.id} style={{
                                                padding: 16, borderRadius: 8,
                                                border: `1px solid ${v.is_active ? 'var(--accent-success)' : 'var(--border-subtle)'}`,
                                                background: v.is_active ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)',
                                                position: 'relative',
                                            }}>
                                                {v.is_active && (
                                                    <span style={{ position: 'absolute', top: 8, right: 8 }}><Badge variant="success">LIVE</Badge></span>
                                                )}
                                                {test.winner_variant === v.id && (
                                                    <span style={{ position: 'absolute', top: 8, right: 8 }}><Badge variant="warning">🏆 WINNER</Badge></span>
                                                )}
                                                <div style={{ fontWeight: 600, marginBottom: 8, color: i === 0 ? 'var(--accent-primary-light)' : 'var(--accent-warning)' }}>
                                                    {v.name}
                                                </div>
                                                <div className="text-sm" style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
                                                    {v.title || 'No title set'}
                                                </div>
                                                <div className="grid-3" style={{ gap: 8, textAlign: 'center' }}>
                                                    <div>
                                                        <div className="font-mono" style={{ fontWeight: 700 }}>{v.impressions.toLocaleString()}</div>
                                                        <div className="text-xs text-muted">Impressions</div>
                                                    </div>
                                                    <div>
                                                        <div className="font-mono" style={{ fontWeight: 700 }}>{v.clicks.toLocaleString()}</div>
                                                        <div className="text-xs text-muted">Clicks</div>
                                                    </div>
                                                    <div>
                                                        <div className="font-mono" style={{ fontWeight: 700, color: v.ctr > 0 ? 'var(--accent-success)' : 'inherit' }}>
                                                            {v.ctr.toFixed(2)}%
                                                        </div>
                                                        <div className="text-xs text-muted">CTR</div>
                                                    </div>
                                                </div>
                                                {test.status === 'active' && !v.is_active && (
                                                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => handleSwitchVariant(test.id, v.id)}>
                                                            Activate
                                                        </button>
                                                        {test.stats.significantAt95 && (
                                                            <button className="btn btn-sm btn-success" onClick={() => handleDeclareWinner(test.id, v.id)}>
                                                                🏆 Declare Winner
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                {activeTab === 'offer-tests' && (
                    <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            {(['list', 'create'] as const).map(t => (
                                <button key={t} className={`btn btn-sm ${offerTab === t ? 'btn-primary' : ''}`} onClick={() => setOfferTab(t)}>
                                    {t === 'create' ? '+ New Offer Test' : 'Offer Tests'}
                                </button>
                            ))}
                        </div>

                        {offerTab === 'create' && (
                            <div className="card" style={{ marginBottom: 16 }}>
                                <h3 className="card-title" style={{ marginBottom: 16 }}>New Offer A/B Test</h3>
                                <div className="form-group">
                                    <label className="form-label">Keyword / Post Topic *</label>
                                    <input className="form-input" value={offerKeyword} onChange={e => setOfferKeyword(e.target.value)} placeholder="best web hosting 2025" />
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
                                    <select className="form-input" value={offerDuration} onChange={e => setOfferDuration(e.target.value)} style={{ maxWidth: 200 }}>
                                        {['7', '14', '21', '30', '60', '90'].map(d => <option key={d} value={d}>{d} days</option>)}
                                    </select>
                                </div>

                                <button className="btn btn-primary" onClick={createOfferTest} disabled={offerCreating}>
                                    {offerCreating ? 'Creating...' : '🧪 Start A/B Test'}
                                </button>
                            </div>
                        )}

                        {offerTab === 'list' && (
                            <>
                                {offerTests.length === 0 ? (
                                    <EmptyState icon="🧪" title="No A/B tests yet" description="Test different affiliate offers to find which earns more per click" />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {offerTests.map((test, i) => (
                                            <div key={i} className="card">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                                    <div>
                                                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{test.keyword}</div>
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <Badge variant={OFFER_STATUS_VARIANT[test.status]}>{test.status}</Badge>
                                                            {test.winner && <span style={{ fontWeight: 700, color: WINNER_COLOR[test.winner] }}>Winner: {test.winner === 'inconclusive' ? 'Inconclusive' : `Offer ${test.winner.toUpperCase()}`}</span>}
                                                            <span className="text-sm text-muted">Ends {new Date(test.ends_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                    {test.status === 'running' && (
                                                        <button className="btn btn-sm btn-primary" onClick={() => analyzeOffer(test.id)} disabled={offerAnalyzing === test.id}>
                                                            {offerAnalyzing === test.id ? 'Analyzing...' : '🤖 Analyze'}
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
                                                                <div><div className="text-sm text-muted">CTR</div><div style={{ fontWeight: 700 }}>{offerCtr(offer.clicks, offer.conv)}%</div></div>
                                                                <div><div className="text-sm text-muted">EPC</div><div style={{ fontWeight: 700 }}>${offerEpc(offer.clicks, offer.rev)}</div></div>
                                                            </div>
                                                            <div style={{ marginTop: 6 }}>
                                                                <div className="text-sm text-muted">Revenue: <strong>${offer.rev.toFixed(2)}</strong> · Conversions: <strong>{offer.conv}</strong></div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {selectedOfferAnalysis?.id === test.id && (
                                                    <div style={{ marginTop: 12, padding: '12px 14px', background: '#f0fdf4', borderRadius: 8 }}>
                                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>🤖 AI Analysis</div>
                                                        <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                                                            <span>Winner: <strong style={{ color: WINNER_COLOR[selectedOfferAnalysis.data.winner] }}>Offer {selectedOfferAnalysis.data.winner.toUpperCase()}</strong></span>
                                                            <span>Confidence: <strong>{selectedOfferAnalysis.data.confidence_pct}%</strong></span>
                                                            <span>Lift: <strong>+{selectedOfferAnalysis.data.lift_pct}%</strong></span>
                                                        </div>
                                                        <div className="text-sm" style={{ marginBottom: 6 }}>{selectedOfferAnalysis.data.recommendation}</div>
                                                        <div className="text-sm text-muted">{selectedOfferAnalysis.data.reasoning}</div>
                                                        {selectedOfferAnalysis.data.action_items?.length > 0 && (
                                                            <div style={{ marginTop: 8 }}>
                                                                {selectedOfferAnalysis.data.action_items.map((item, ai) => (
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
                    </>
                )}
            </main>
        </div>
    );
}
