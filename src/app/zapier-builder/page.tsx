'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Webhook {
    id: string;
    name: string;
    trigger_event: string;
    endpoint_url: string;
    method: 'POST' | 'GET';
    payload_template: Record<string, string>;
    headers: Record<string, string>;
    is_active: boolean;
    last_triggered?: string;
    trigger_count: number;
    failure_count: number;
    created_at: string;
}

const TRIGGER_EVENTS = [
    { value: 'post_published', label: '📄 Post Published', description: 'When a post goes live' },
    { value: 'rank_change', label: '📈 Rank Changed', description: 'Keyword position moves significantly' },
    { value: 'link_broken', label: '🔗 Link Broken', description: 'Affiliate link detected dead' },
    { value: 'commission_received', label: '💰 Commission Received', description: 'New affiliate commission logged' },
    { value: 'new_subscriber', label: '👤 New Subscriber', description: 'Email list gains subscriber' },
    { value: 'competitor_published', label: '🏢 Competitor Published', description: 'Competitor releases new content' },
    { value: 'content_decay', label: '⏰ Content Decay', description: 'Post traffic drops significantly' },
    { value: 'serp_feature_won', label: '⭐ SERP Feature Won', description: 'Featured snippet captured' },
    { value: 'goal_milestone', label: '🎯 Goal Milestone', description: 'Revenue/traffic goal hit' },
];

const METHOD_COLOR: Record<string, string> = { POST: '#2563eb', GET: '#16a34a' };

export default function ZapierBuilderPage() {
    const toast = useToast();
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [tab, setTab] = useState<'list' | 'create'>('list');
    const [name, setName] = useState('');
    const [triggerEvent, setTriggerEvent] = useState('post_published');
    const [endpointUrl, setEndpointUrl] = useState('');
    const [method, setMethod] = useState<'POST' | 'GET'>('POST');
    const [customHeaders, setCustomHeaders] = useState('');
    const [customPayload, setCustomPayload] = useState('');
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);

    useEffect(() => { loadWebhooks(); }, []);

    const loadWebhooks = async () => {
        const res = await fetch('/api/zapier-builder');
        const data = await res.json();
        setWebhooks(data.webhooks || []);
    };

    const createWebhook = async () => {
        if (!name || !endpointUrl) { toast.warning('Name and endpoint URL required'); return; }
        let headers: Record<string, string> = {};
        let payload: Record<string, string> = {};
        try {
            if (customHeaders) headers = JSON.parse(customHeaders);
            if (customPayload) payload = JSON.parse(customPayload);
        } catch { toast.error('Invalid JSON in headers or payload'); return; }
        setSaving(true);
        const res = await fetch('/api/zapier-builder', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', name, trigger_event: triggerEvent, endpoint_url: endpointUrl, method, headers, payload_template: payload }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setSaving(false); return; }
        toast.success('Webhook created');
        setName(''); setEndpointUrl(''); setCustomHeaders(''); setCustomPayload('');
        loadWebhooks(); setTab('list');
        setSaving(false);
    };

    const testWebhook = async (id: string) => {
        setTesting(id);
        const res = await fetch('/api/zapier-builder', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'test', webhook_id: id }),
        });
        const data = await res.json();
        if (res.ok) toast.success(`Test sent! Status: ${data.status_code}`);
        else toast.error(data.error || 'Test failed');
        setTesting(null);
    };

    const toggleWebhook = async (id: string, active: boolean) => {
        await fetch('/api/zapier-builder', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle', webhook_id: id, active }),
        });
        loadWebhooks();
        toast.success(active ? 'Webhook enabled' : 'Webhook paused');
    };

    const selectedTrigger = TRIGGER_EVENTS.find(t => t.value === triggerEvent);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Webhook / Zapier Builder</h1>
                        <p className="page-description">Connect RankMaster to Zapier, Make, Slack, Notion — trigger on any platform event</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['list', 'create'] as const).map(t => (
                            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                                {t === 'create' ? '+ New Webhook' : 'Webhooks'}
                            </button>
                        ))}
                    </div>
                </div>

                {tab === 'create' && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h3 className="card-title" style={{ marginBottom: 16 }}>New Webhook</h3>

                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Webhook Name *</label>
                                <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Notify Slack on post publish" />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Trigger Event *</label>
                                <select className="form-input" value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)}>
                                    {TRIGGER_EVENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                        </div>

                        {selectedTrigger && (
                            <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 6, marginBottom: 12 }}>
                                <div className="text-sm text-muted">{selectedTrigger.description}</div>
                            </div>
                        )}

                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Endpoint URL *</label>
                                <input className="form-input" value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/..." />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Method</label>
                                <select className="form-input" value={method} onChange={e => setMethod(e.target.value as 'POST' | 'GET')}>
                                    <option value="POST">POST</option>
                                    <option value="GET">GET</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Custom Headers <span className="text-muted text-sm">(JSON)</span></label>
                                <textarea className="form-input" rows={3} value={customHeaders} onChange={e => setCustomHeaders(e.target.value)} placeholder={'{\n  "Authorization": "Bearer token"\n}'} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Custom Payload <span className="text-muted text-sm">(JSON, merged with event data)</span></label>
                                <textarea className="form-input" rows={3} value={customPayload} onChange={e => setCustomPayload(e.target.value)} placeholder={'{\n  "channel": "#content"\n}'} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                            </div>
                        </div>

                        <button className="btn btn-primary" onClick={createWebhook} disabled={saving}>
                            {saving ? 'Saving...' : '🔗 Create Webhook'}
                        </button>
                    </div>
                )}

                {tab === 'list' && (
                    <>
                        {webhooks.length === 0 ? (
                            <EmptyState icon="🔗" title="No webhooks yet" description="Connect RankMaster events to Zapier, Make, Slack, or any HTTP endpoint" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {webhooks.map((wh, i) => (
                                    <div key={i} className="card" style={{ padding: '14px', opacity: wh.is_active ? 1 : 0.6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                                    <span style={{ fontWeight: 700 }}>{wh.name}</span>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: METHOD_COLOR[wh.method], border: `1px solid ${METHOD_COLOR[wh.method]}`, padding: '1px 6px', borderRadius: 3 }}>{wh.method}</span>
                                                    <Badge variant={wh.is_active ? 'success' : 'neutral'}>{wh.is_active ? 'Active' : 'Paused'}</Badge>
                                                </div>
                                                <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                                                    {TRIGGER_EVENTS.find(t => t.value === wh.trigger_event)?.label || wh.trigger_event} → {wh.endpoint_url.substring(0, 50)}...
                                                </div>
                                                <div style={{ display: 'flex', gap: 16 }}>
                                                    <span className="text-sm text-muted">Triggered: <strong>{wh.trigger_count}</strong></span>
                                                    {wh.failure_count > 0 && <span className="text-sm" style={{ color: '#dc2626' }}>Failures: <strong>{wh.failure_count}</strong></span>}
                                                    {wh.last_triggered && <span className="text-sm text-muted">Last: {new Date(wh.last_triggered).toLocaleDateString()}</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                <button className="btn btn-sm" onClick={() => testWebhook(wh.id)} disabled={testing === wh.id}>
                                                    {testing === wh.id ? '...' : '🧪 Test'}
                                                </button>
                                                <button className="btn btn-sm" onClick={() => toggleWebhook(wh.id, !wh.is_active)}>
                                                    {wh.is_active ? '⏸' : '▶'}
                                                </button>
                                            </div>
                                        </div>
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
