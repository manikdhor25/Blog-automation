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

export default function ABTestsPage() {
    const toast = useToast();
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

    useEffect(() => { fetchTests(); }, []);

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

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">A/B Testing</h1>
                        <p className="page-description">Test title, meta, and content variants to optimize CTR</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ New Test</button>
                </div>

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
            </main>
        </div>
    );
}
