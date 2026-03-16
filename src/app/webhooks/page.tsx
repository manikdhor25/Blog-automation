'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Webhook {
    id: string; name: string; url: string; events: string[]; active: boolean; created_at: string;
}

const EVENT_OPTIONS = [
    { value: 'content.published', label: '📝 Content Published' },
    { value: 'content.updated', label: '✏️ Content Updated' },
    { value: 'rank.changed', label: '📊 Rank Changed' },
    { value: 'decay.detected', label: '⏰ Decay Detected' },
    { value: 'queue.completed', label: '📤 Queue Item Completed' },
    { value: 'audit.completed', label: '🩺 Audit Completed' },
];

export default function WebhooksPage() {
    const toast = useToast();
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [events, setEvents] = useState<string[]>(['content.published']);
    const [saving, setSaving] = useState(false);

    const fetchWebhooks = async () => {
        try {
            const res = await fetch('/api/webhooks');
            const data = await res.json();
            setWebhooks(data.webhooks || []);
        } catch { /* silent */ }
        setLoading(false);
    };

    useEffect(() => { fetchWebhooks(); }, []);

    const toggleEvent = (e: string) => {
        setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
    };

    const handleCreate = async () => {
        if (!name.trim() || !url.trim()) { toast.warning('Name and URL are required'); return; }
        if (events.length === 0) { toast.warning('Select at least one event'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url, events }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success('Webhook created!');
            setShowForm(false);
            setName(''); setUrl(''); setEvents(['content.published']);
            fetchWebhooks();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Creation failed');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async (webhook: Webhook) => {
        try {
            const res = await fetch('/api/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test', webhook_id: webhook.id, url: webhook.url }),
            });
            const data = await res.json();
            if (data.success) toast.success(`Webhook responded with status ${data.status}`);
            else toast.error('Webhook test failed');
        } catch {
            toast.error('Connection failed');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/webhooks?id=${id}`, { method: 'DELETE' });
            toast.success('Webhook deleted');
            fetchWebhooks();
        } catch {
            toast.error('Delete failed');
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Webhooks</h1>
                        <p className="page-description">Configure webhook triggers for external integrations</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? '✕ Cancel' : '+ New Webhook'}
                    </button>
                </div>

                {showForm && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Webhook Name</label>
                                <input className="form-input" placeholder="e.g. Slack Notifications" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Endpoint URL</label>
                                <input className="form-input" placeholder="https://hooks.example.com/..." value={url} onChange={e => setUrl(e.target.value)} />
                            </div>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label className="form-label">Events</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {EVENT_OPTIONS.map(ev => (
                                    <button key={ev.value} className={`btn btn-sm ${events.includes(ev.value) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleEvent(ev.value)}>
                                        {ev.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                            {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving...</> : '💾 Create Webhook'}
                        </button>
                    </div>
                )}

                <div className="card">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading...</div>
                    ) : webhooks.length === 0 ? (
                        <EmptyState icon="🔔" title="No Webhooks" description="Create webhooks to receive notifications when events occur." />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {webhooks.map(wh => (
                                <div key={wh.id} className="card">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '1.2rem' }}>🔔</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600 }}>{wh.name}</div>
                                            <div className="text-sm font-mono text-muted">{wh.url}</div>
                                        </div>
                                        <Badge variant={wh.active ? 'success' : 'danger'}>{wh.active ? 'ACTIVE' : 'INACTIVE'}</Badge>
                                        <button className="btn btn-secondary btn-sm" onClick={() => handleTest(wh)}>🧪 Test</button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(wh.id)} style={{ color: 'var(--accent-danger)' }}>🗑️</button>
                                    </div>
                                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {(wh.events || []).map(ev => (
                                            <Badge key={ev} variant="neutral">{ev}</Badge>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
