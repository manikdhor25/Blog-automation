'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface TrackedLink { id: string; tracking_id: string; label: string; destination_url: string; affiliate_program?: string; total_clicks: number; unique_clicks: number; conversions: number; total_revenue: number; is_active: boolean; created_at: string; }
interface Stats { total_clicks: number; total_conversions: number; total_revenue: number; conversion_rate: string; epc: string; }

export default function ClickTrackerPage() {
    const toast = useToast();
    const [links, setLinks] = useState<TrackedLink[]>([]);
    const [stats, setStats] = useState<Stats>({ total_clicks: 0, total_conversions: 0, total_revenue: 0, conversion_rate: '0', epc: '0' });
    const [period, setPeriod] = useState('30');
    const [tab, setTab] = useState<'links' | 'create'>('links');
    const [label, setLabel] = useState('');
    const [destUrl, setDestUrl] = useState('');
    const [program, setProgram] = useState('');
    const [commission, setCommission] = useState('');
    const [creating, setCreating] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => { load(); }, [period]);

    const load = async () => {
        const res = await fetch(`/api/click-tracker?period=${period}`);
        const data = await res.json();
        setLinks(data.links || []);
        setStats(data.stats || {});
    };

    const create = async () => {
        if (!label || !destUrl) { toast.warning('Label and destination URL required'); return; }
        setCreating(true);
        const res = await fetch('/api/click-tracker', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create_link', label, destination_url: destUrl, affiliate_program: program || undefined, expected_commission: commission ? parseFloat(commission) : undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success(`Link created! Tracking URL: ${data.tracking_url}`);
            setLabel(''); setDestUrl(''); setProgram(''); setCommission('');
            load(); setTab('links');
        }
        setCreating(false);
    };

    const copyTracking = (id: string) => {
        const url = `${window.location.origin}/api/click-tracker/go?id=${id}`;
        navigator.clipboard.writeText(url);
        setCopied(id);
        toast.success('Tracking URL copied');
        setTimeout(() => setCopied(null), 2000);
    };

    const ctr = (clicks: number, conv: number) => clicks > 0 ? ((conv / clicks) * 100).toFixed(1) : '0';
    const epc = (clicks: number, rev: number) => clicks > 0 ? (rev / clicks).toFixed(4) : '0.0000';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Affiliate Click Tracker</h1>
                        <p className="page-description">Track every affiliate link click, conversion, and EPC — know exactly which links earn most</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select className="form-input" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 'auto' }}>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                        </select>
                        {(['links', 'create'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                                {t === 'create' ? '+ Add Link' : 'Links'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                    {[
                        { label: 'Total Clicks', value: stats.total_clicks.toLocaleString(), icon: '👆' },
                        { label: 'Conversions', value: stats.total_conversions, icon: '✅' },
                        { label: 'Revenue', value: `$${(stats.total_revenue || 0).toFixed(2)}`, icon: '💰' },
                        { label: 'EPC', value: `$${stats.epc}`, icon: '📊' },
                    ].map((s, i) => (
                        <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{s.value}</div>
                            <div className="text-sm text-muted">{s.label}</div>
                        </div>
                    ))}
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Add Tracked Link</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Label *</label>
                                <input className="form-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Bluehost - hosting review" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Affiliate Program</label>
                                <input className="form-input" value={program} onChange={e => setProgram(e.target.value)} placeholder="e.g. Bluehost, Amazon, etc." />
                            </div>
                            <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                <label className="form-label">Destination URL *</label>
                                <input className="form-input" value={destUrl} onChange={e => setDestUrl(e.target.value)} placeholder="https://affiliate-link.com/..." />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={create} disabled={creating}>{creating ? 'Creating...' : '🔗 Create Tracked Link'}</button>
                    </div>
                )}

                {tab === 'links' && (
                    links.length === 0 ? <EmptyState icon="🔗" title="No tracked links" description="Add affiliate links to start tracking clicks, conversions, and EPC" /> : (
                        <div className="card">
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            {['Link', 'Program', 'Clicks', 'Conv.', 'CTR', 'Revenue', 'EPC', 'Actions'].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {links.map((link, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                <td style={{ padding: '10px' }}>
                                                    <div style={{ fontWeight: 600 }}>{link.label}</div>
                                                    <div className="text-sm text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{link.tracking_id}</div>
                                                </td>
                                                <td style={{ padding: '10px' }}><span className="text-sm text-muted">{link.affiliate_program || '—'}</span></td>
                                                <td style={{ padding: '10px' }}><strong>{link.total_clicks}</strong></td>
                                                <td style={{ padding: '10px' }}><strong>{link.conversions}</strong></td>
                                                <td style={{ padding: '10px' }}><span style={{ color: parseFloat(ctr(link.total_clicks, link.conversions)) >= 2 ? '#16a34a' : '#d97706' }}>{ctr(link.total_clicks, link.conversions)}%</span></td>
                                                <td style={{ padding: '10px' }}><strong style={{ color: '#16a34a' }}>${link.total_revenue.toFixed(2)}</strong></td>
                                                <td style={{ padding: '10px' }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>${epc(link.total_clicks, link.total_revenue)}</span></td>
                                                <td style={{ padding: '10px' }}>
                                                    <button className="btn btn-sm" onClick={() => copyTracking(link.tracking_id)}>
                                                        {copied === link.tracking_id ? '✓' : '📋'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
