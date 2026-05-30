'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Monitor { id: string; program_name: string; network?: string; category?: string; current_rate: number; original_rate: number; rate_type: string; alert_threshold_pct: number; is_active: boolean; rate_change_history?: Array<{ rate: number; change_pct: number; logged_at: string }>; }

export default function RateMonitorPage() {
    const toast = useToast();
    const [monitors, setMonitors] = useState<Monitor[]>([]);
    const [tab, setTab] = useState<'list' | 'add'>('list');
    const [programName, setProgramName] = useState('');
    const [network, setNetwork] = useState('');
    const [category, setCategory] = useState('');
    const [currentRate, setCurrentRate] = useState('');
    const [rateType, setRateType] = useState('percentage');
    const [alertThreshold, setAlertThreshold] = useState('10');
    const [saving, setSaving] = useState(false);
    const [updateId, setUpdateId] = useState('');
    const [newRate, setNewRate] = useState('');
    const [changeReason, setChangeReason] = useState('');
    const [logging, setLogging] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await fetch('/api/rate-monitor');
        const data = await res.json();
        setMonitors(data.monitors || []);
    };

    const add = async () => {
        if (!programName || !currentRate) { toast.warning('Program name and rate required'); return; }
        setSaving(true);
        const res = await fetch('/api/rate-monitor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', program_name: programName, network: network || undefined, category: category || undefined, current_rate: parseFloat(currentRate), rate_type: rateType, alert_threshold_pct: parseInt(alertThreshold) }),
        });
        if (res.ok) { toast.success('Monitor added'); setProgramName(''); setCurrentRate(''); setNetwork(''); load(); setTab('list'); }
        setSaving(false);
    };

    const logChange = async () => {
        if (!updateId || !newRate) { toast.warning('Select program and enter new rate'); return; }
        setLogging(true);
        const res = await fetch('/api/rate-monitor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'log_change', monitor_id: updateId, new_rate: parseFloat(newRate), change_reason: changeReason || undefined }),
        });
        const data = await res.json();
        if (res.ok) {
            const pct = parseFloat(data.change_pct);
            toast[pct < -10 ? 'warning' : 'success'](`Rate changed ${pct > 0 ? '+' : ''}${pct}%${data.is_alert ? ' ⚠️ Alert triggered' : ''}`);
            setUpdateId(''); setNewRate(''); setChangeReason('');
            load();
        }
        setLogging(false);
    };

    const rateChange = (m: Monitor) => {
        if (m.original_rate === m.current_rate) return null;
        return ((m.current_rate - m.original_rate) / m.original_rate * 100).toFixed(1);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Affiliate Rate Monitor</h1>
                        <p className="page-description">Track commission rate changes across programs — get alerted when Amazon or others cut rates</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['list', 'add'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                                {t === 'add' ? '+ Add Program' : `Programs (${monitors.length})`}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Log rate change */}
                <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>📊 Log Rate Change</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <select className="form-input" value={updateId} onChange={e => setUpdateId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
                            <option value="">Select program...</option>
                            {monitors.map(m => <option key={m.id} value={m.id}>{m.program_name} (current: {m.current_rate}{m.rate_type === 'percentage' ? '%' : ''})</option>)}
                        </select>
                        <input className="form-input" type="number" step="0.1" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="New rate" style={{ flex: '0 0 100px' }} />
                        <input className="form-input" value={changeReason} onChange={e => setChangeReason(e.target.value)} placeholder="Reason (optional)" style={{ flex: 1, minWidth: 140 }} />
                        <button className="btn btn-primary" onClick={logChange} disabled={logging}>{logging ? 'Logging...' : 'Log Change'}</button>
                    </div>
                </div>

                {tab === 'add' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Add Program to Monitor</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Program Name *</label><input className="form-input" value={programName} onChange={e => setProgramName(e.target.value)} placeholder="Amazon Associates" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Network</label><input className="form-input" value={network} onChange={e => setNetwork(e.target.value)} placeholder="Amazon, ShareASale, CJ..." /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Category</label><input className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="Electronics, Home, Fashion..." /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Current Rate *</label><input className="form-input" type="number" step="0.1" value={currentRate} onChange={e => setCurrentRate(e.target.value)} placeholder="4.5" /></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Rate Type</label><select className="form-input" value={rateType} onChange={e => setRateType(e.target.value)}><option value="percentage">Percentage (%)</option><option value="flat">Flat ($)</option><option value="cpa">CPA</option></select></div>
                            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Alert if changes by (%)</label><input className="form-input" type="number" value={alertThreshold} onChange={e => setAlertThreshold(e.target.value)} placeholder="10" /></div>
                        </div>
                        <button className="btn btn-primary" onClick={add} disabled={saving}>{saving ? 'Adding...' : '+ Add Monitor'}</button>
                    </div>
                )}

                {tab === 'list' && (
                    monitors.length === 0 ? <EmptyState icon="📊" title="No programs monitored" description="Add affiliate programs to track commission rate changes and get alerts" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {monitors.map((m, i) => {
                                const change = rateChange(m);
                                return (
                                    <div key={i} className="card" style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 700 }}>{m.program_name}</span>
                                                    {m.network && <Badge variant="neutral">{m.network}</Badge>}
                                                    {m.category && <span className="text-sm text-muted">{m.category}</span>}
                                                </div>
                                                <div style={{ display: 'flex', gap: 16 }}>
                                                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{m.current_rate}{m.rate_type === 'percentage' ? '%' : ' flat'}</span>
                                                    {change && <span style={{ fontWeight: 700, color: parseFloat(change) > 0 ? '#16a34a' : '#dc2626' }}>{parseFloat(change) > 0 ? '▲' : '▼'}{Math.abs(parseFloat(change))}% from original</span>}
                                                    <span className="text-sm text-muted">Original: {m.original_rate}{m.rate_type === 'percentage' ? '%' : ''}</span>
                                                    <span className="text-sm text-muted">Alert: ±{m.alert_threshold_pct}%</span>
                                                </div>
                                            </div>
                                            <button className="btn btn-sm" onClick={async () => { await fetch('/api/rate-monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', monitor_id: m.id }) }); load(); }} style={{ color: '#dc2626' }}>🗑</button>
                                        </div>
                                        {m.rate_change_history && m.rate_change_history.length > 0 && (
                                            <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                                                {m.rate_change_history.slice(-6).map((h, hi) => (
                                                    <div key={hi} title={`${h.rate}% on ${new Date(h.logged_at).toLocaleDateString()}`} style={{ padding: '2px 6px', background: h.change_pct < 0 ? '#fef2f2' : '#f0fdf4', color: h.change_pct < 0 ? '#dc2626' : '#16a34a', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700 }}>
                                                        {h.change_pct > 0 ? '+' : ''}{h.change_pct.toFixed(1)}%
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
