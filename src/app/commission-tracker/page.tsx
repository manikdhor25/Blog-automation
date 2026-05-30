'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface HistoryEntry {
    id: string; network: string; program_name: string;
    old_rate: number | null; new_rate: number; commission_type: string;
    change_pct: number | null; direction: string;
    category: string; effective_date: string; notes: string;
}

interface CommissionAlert { id: string; program_name: string; old_rate: number; new_rate: number; change_pct: number; created_at: string; }
interface ProgramSummary { name: string; network: string; current_rate: number; changes: number; last_cut: string | null; }

export default function CommissionTrackerPage() {
    const toast = useToast();
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [alerts, setAlerts] = useState<CommissionAlert[]>([]);
    const [programs, setPrograms] = useState<ProgramSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'log' | 'alerts'>('dashboard');
    const [form, setForm] = useState({ network: 'amazon', program_name: 'Amazon Associates', old_rate: '', new_rate: '', commission_type: 'percentage', category: '', effective_date: new Date().toISOString().split('T')[0], notes: '' });

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [hRes, aRes, sRes] = await Promise.all([fetch('/api/commission-tracker'), fetch('/api/commission-tracker?view=alerts'), fetch('/api/commission-tracker?view=summary')]);
        const [hData, aData, sData] = await Promise.all([hRes.json(), aRes.json(), sRes.json()]);
        setHistory(hData.history || []);
        setAlerts(aData.alerts || []);
        setPrograms(sData.programs || []);
        setLoading(false);
    };

    const logRate = async () => {
        if (!form.new_rate) { toast.warning('New rate required'); return; }
        const res = await fetch('/api/commission-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'log_rate', ...form, old_rate: form.old_rate ? parseFloat(form.old_rate) : undefined, new_rate: parseFloat(form.new_rate) }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); return; }
        toast.success(data.alert_created ? '⚠️ Rate cut detected — alert created' : 'Rate logged');
        setShowForm(false);
        fetchAll();
    };

    const directionVariant = (d: string): 'success' | 'danger' | 'info' | 'warning' =>
        ({ increase: 'success', decrease: 'danger', initial: 'info', unchanged: 'warning' }[d] as 'success' | 'danger' | 'info' | 'warning') || 'info';

    const networks = ['amazon', 'shareasale', 'cj', 'impact', 'rakuten', 'awin', 'clickbank', 'direct', 'other'];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Commission Tracker</h1>
                        <p className="page-description">Log and track rate changes across all affiliate networks — never miss a cut</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Log Rate Change</button>
                </div>

                {alerts.length > 0 && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>⚠️ {alerts.length} Commission Cut Alert{alerts.length > 1 ? 's' : ''}</div>
                        {alerts.map(a => (
                            <div key={a.id} className="text-sm" style={{ marginBottom: 4 }}>
                                <strong>{a.program_name}</strong>: {a.old_rate}% → <strong style={{ color: '#dc2626' }}>{a.new_rate}%</strong> ({a.change_pct?.toFixed(1)}% cut on {new Date(a.created_at).toLocaleDateString()})
                            </div>
                        ))}
                    </div>
                )}

                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
                    <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>History ({history.length})</button>
                    <button className={`tab ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => setActiveTab('alerts')}>Alerts ({alerts.length})</button>
                </div>

                {showForm && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Log Commission Rate Change</h3><button className="btn btn-sm" onClick={() => setShowForm(false)}>✕</button></div>
                        <div className="grid-3" style={{ gap: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Network</label>
                                <select className="form-select" value={form.network} onChange={e => setForm(f => ({ ...f, network: e.target.value }))}>
                                    {networks.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Program Name</label>
                                <input className="form-input" value={form.program_name} onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Category</label>
                                <input className="form-input" placeholder="e.g. Electronics, Health" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Old Rate (%)</label>
                                <input type="number" step="0.1" className="form-input" value={form.old_rate} onChange={e => setForm(f => ({ ...f, old_rate: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">New Rate (%) *</label>
                                <input type="number" step="0.1" className="form-input" value={form.new_rate} onChange={e => setForm(f => ({ ...f, new_rate: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Effective Date</label>
                                <input type="date" className="form-input" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
                            </div>
                        </div>
                        <div className="form-group" style={{ marginTop: 12 }}>
                            <label className="form-label">Notes</label>
                            <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Email announcement, category-specific, etc." />
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={logRate}>Log Rate Change</button>
                    </div>
                )}

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : activeTab === 'dashboard' ? (
                            programs.length === 0 ? <EmptyState icon="📊" title="No Programs Tracked" description="Log your first commission rate to start tracking" />
                                : <div className="grid-3" style={{ gap: 12 }}>
                                    {programs.map((p, i) => (
                                        <div key={i} className="card" style={{ padding: 16 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <span style={{ fontWeight: 700 }}>{p.name || p.network}</span>
                                                <Badge variant="neutral">{p.network}</Badge>
                                            </div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: 4 }}>{p.current_rate}%</div>
                                            <div className="text-sm text-muted">{p.changes} rate change{p.changes !== 1 ? 's' : ''} logged</div>
                                            {p.last_cut && <div className="text-sm" style={{ color: '#dc2626', marginTop: 4 }}>Last cut: {new Date(p.last_cut).toLocaleDateString()}</div>}
                                        </div>
                                    ))}
                                </div>
                        )
                        : activeTab === 'log' ? (
                            history.length === 0 ? <EmptyState icon="📋" title="No History" description="Log rate changes to track them here" />
                                : <DataTable data={history as unknown as Record<string, unknown>[]} searchKeys={['program_name', 'network', 'category']} pageSize={20} columns={[
                                    { key: 'program_name', label: 'Program', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.program_name || r.network)}</span> },
                                    { key: 'network', label: 'Network', render: (r) => <Badge variant="neutral">{String(r.network)}</Badge> },
                                    { key: 'old_rate', label: 'Old Rate', render: (r) => r.old_rate ? <span className="font-mono">{Number(r.old_rate)}%</span> : <span className="text-muted">—</span> },
                                    { key: 'new_rate', label: 'New Rate', render: (r) => <span className="font-mono" style={{ fontWeight: 700 }}>{Number(r.new_rate)}%</span> },
                                    { key: 'change_pct', label: 'Change', render: (r) => r.change_pct ? <span style={{ color: Number(r.change_pct) > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{Number(r.change_pct) > 0 ? '+' : ''}{Number(r.change_pct).toFixed(1)}%</span> : <span className="text-muted">—</span> },
                                    { key: 'direction', label: '', render: (r) => <Badge variant={directionVariant(String(r.direction))}>{String(r.direction)}</Badge> },
                                    { key: 'effective_date', label: 'Date', render: (r) => <span className="text-sm">{String(r.effective_date)}</span> },
                                    { key: 'category', label: 'Category', render: (r) => <span className="text-sm text-muted">{String(r.category || '—')}</span> },
                                ]} />
                        )
                        : (
                            alerts.length === 0 ? <EmptyState icon="✅" title="No Active Alerts" description="You'll be notified here when commissions are cut" />
                                : <DataTable data={alerts as unknown as Record<string, unknown>[]} searchKeys={['program_name']} pageSize={20} columns={[
                                    { key: 'program_name', label: 'Program', render: (r) => <span style={{ fontWeight: 700, color: '#dc2626' }}>{String(r.program_name)}</span> },
                                    { key: 'old_rate', label: 'Was', render: (r) => <span className="font-mono">{Number(r.old_rate)}%</span> },
                                    { key: 'new_rate', label: 'Now', render: (r) => <span className="font-mono" style={{ color: '#dc2626', fontWeight: 700 }}>{Number(r.new_rate)}%</span> },
                                    { key: 'change_pct', label: 'Cut', render: (r) => <span style={{ color: '#dc2626', fontWeight: 700 }}>{Number(r.change_pct).toFixed(1)}%</span> },
                                    { key: 'created_at', label: 'Date', render: (r) => <span className="text-sm">{new Date(String(r.created_at)).toLocaleDateString()}</span> },
                                ]} />
                        )
                    }
                </div>
            </main>
        </div>
    );
}
