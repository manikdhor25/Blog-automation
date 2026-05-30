'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Alert { id: string; keyword: string; alert_type: string; threshold_position?: number; change_threshold?: number; is_active: boolean; trigger_count: number; last_triggered?: string; notify_email: boolean; notify_webhook: boolean; }
interface HistoryItem { id: string; keyword: string; previous_position?: number; current_position: number; message: string; triggered_at: string; }

const ALERT_ICONS: Record<string, string> = { enters_top_10: '🎯', enters_top_3: '🏆', drops_from_top_3: '📉', drops_from_top_10: '⚠️', position_change: '📊', custom: '⚙️' };

export default function KeywordAlertsPage() {
    const toast = useToast();
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [tab, setTab] = useState<'alerts' | 'create' | 'history'>('alerts');
    const [keyword, setKeyword] = useState('');
    const [alertType, setAlertType] = useState('enters_top_10');
    const [threshold, setThreshold] = useState('');
    const [changeThreshold, setChangeThreshold] = useState('5');
    const [notifyEmail, setNotifyEmail] = useState(true);
    const [notifyWebhook, setNotifyWebhook] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await fetch('/api/keyword-alerts');
        const data = await res.json();
        setAlerts(data.alerts || []);
        setHistory(data.history || []);
    };

    const create = async () => {
        if (!keyword || !alertType) { toast.warning('Keyword and alert type required'); return; }
        setSaving(true);
        const res = await fetch('/api/keyword-alerts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create', keyword, alert_type: alertType,
                threshold_position: ['custom'].includes(alertType) && threshold ? parseInt(threshold) : undefined,
                change_threshold: alertType === 'position_change' ? parseInt(changeThreshold) : undefined,
                notify_email: notifyEmail, notify_webhook: notifyWebhook, webhook_url: webhookUrl || undefined,
            }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); } else {
            toast.success('Alert created');
            setKeyword(''); setWebhookUrl('');
            load(); setTab('alerts');
        }
        setSaving(false);
    };

    const toggle = async (id: string, active: boolean) => {
        await fetch('/api/keyword-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle', alert_id: id, active }) });
        load();
    };

    const del = async (id: string) => {
        await fetch('/api/keyword-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', alert_id: id }) });
        toast.success('Alert deleted');
        load();
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Keyword Rank Alerts</h1>
                        <p className="page-description">Get notified when keywords enter top 10, drop from top 3, or change significantly</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['alerts', 'create', 'history'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
                                {t === 'create' ? '+ New Alert' : t === 'history' ? `History (${history.length})` : `Alerts (${alerts.length})`}
                            </button>
                        ))}
                    </div>
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 16 }}>New Keyword Alert</h3>
                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Keyword *</label>
                                <input className="form-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="best standing desks" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Alert Type *</label>
                                <select className="form-input" value={alertType} onChange={e => setAlertType(e.target.value)}>
                                    <option value="enters_top_10">🎯 Enters Top 10</option>
                                    <option value="enters_top_3">🏆 Enters Top 3</option>
                                    <option value="drops_from_top_3">📉 Drops from Top 3</option>
                                    <option value="drops_from_top_10">⚠️ Drops from Top 10</option>
                                    <option value="position_change">📊 Any Position Change</option>
                                    <option value="custom">⚙️ Custom Threshold</option>
                                </select>
                            </div>
                            {alertType === 'position_change' && (
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Alert if moves more than (positions)</label>
                                    <input className="form-input" type="number" value={changeThreshold} onChange={e => setChangeThreshold(e.target.value)} placeholder="5" />
                                </div>
                            )}
                            {alertType === 'custom' && (
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Alert when reaches position #</label>
                                    <input className="form-input" type="number" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="15" />
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} />
                                <span className="text-sm">Email notification</span>
                            </label>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={notifyWebhook} onChange={e => setNotifyWebhook(e.target.checked)} />
                                <span className="text-sm">Webhook (Slack/Zapier)</span>
                            </label>
                        </div>
                        {notifyWebhook && (
                            <div className="form-group" style={{ marginBottom: 12 }}>
                                <label className="form-label">Webhook URL</label>
                                <input className="form-input" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/..." />
                            </div>
                        )}
                        <button className="btn btn-primary" onClick={create} disabled={saving}>{saving ? 'Saving...' : '🔔 Create Alert'}</button>
                    </div>
                )}

                {tab === 'alerts' && (
                    alerts.length === 0 ? <EmptyState icon="🔔" title="No alerts yet" description="Create alerts to get notified when your keywords move in the SERPs" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {alerts.map((a, i) => (
                                <div key={i} className="card" style={{ padding: '12px 14px', opacity: a.is_active ? 1 : 0.6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                <span>{ALERT_ICONS[a.alert_type]}</span>
                                                <span style={{ fontWeight: 700 }}>{a.keyword}</span>
                                                <Badge variant={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'Active' : 'Paused'}</Badge>
                                            </div>
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                <span className="text-sm text-muted">{a.alert_type.replace(/_/g, ' ')}{a.threshold_position ? ` (#${a.threshold_position})` : ''}</span>
                                                <span className="text-sm text-muted">Triggered: {a.trigger_count}×</span>
                                                {a.last_triggered && <span className="text-sm text-muted">Last: {new Date(a.last_triggered).toLocaleDateString()}</span>}
                                                {a.notify_email && <span className="text-sm text-muted">📧</span>}
                                                {a.notify_webhook && <span className="text-sm text-muted">🔗</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm" onClick={() => toggle(a.id, !a.is_active)}>{a.is_active ? '⏸' : '▶'}</button>
                                            <button className="btn btn-sm" onClick={() => del(a.id)} style={{ color: '#dc2626' }}>🗑</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {tab === 'history' && (
                    history.length === 0 ? <EmptyState icon="📋" title="No alert history" description="Alert triggers will appear here" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {history.map((h, i) => (
                                <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div className="text-sm" style={{ fontWeight: 600 }}>{h.message}</div>
                                        {h.previous_position && <div className="text-sm text-muted">#{h.previous_position} → #{h.current_position}</div>}
                                    </div>
                                    <span className="text-sm text-muted">{new Date(h.triggered_at).toLocaleDateString()}</span>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
