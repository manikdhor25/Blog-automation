'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface BulkLog { id: string; operation: string; items_processed: number; items_succeeded: number; details: Record<string, unknown>; created_at: string; }

export default function BulkOpsPage() {
    const toast = useToast();
    const [logs, setLogs] = useState<BulkLog[]>([]);
    const [siteId, setSiteId] = useState('');
    const [activeOp, setActiveOp] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [tags, setTags] = useState('');
    const [tagOp, setTagOp] = useState('add');

    useEffect(() => { loadLogs(); }, []);

    const loadLogs = async () => {
        const res = await fetch('/api/bulk-ops');
        const data = await res.json();
        setLogs(data.logs || []);
    };

    const run = async (action: string, extra?: Record<string, unknown>) => {
        if (!siteId && action !== 'bulk_tag') { toast.warning('Enter site ID'); return; }
        setRunning(true);
        setActiveOp(action);
        const res = await fetch('/api/bulk-ops', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, site_id: siteId || undefined, ...extra }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); }
        else {
            const msg = action === 'bulk_meta' ? `Updated ${data.updated} meta descriptions`
                : action === 'bulk_publish' ? `Published ${data.updated} posts`
                : `Done: ${JSON.stringify(data)}`;
            toast.success(msg);
            loadLogs();
        }
        setRunning(false);
        setActiveOp(null);
    };

    const OPS = [
        { id: 'bulk_meta', label: '🏷️ Bulk Generate Meta Descriptions', desc: 'AI writes missing meta descriptions for up to 20 posts. Uses focus keyword + title.', needsSite: true },
        { id: 'bulk_publish_draft', label: '📤 Bulk Save as Draft', desc: 'Mark selected posts as draft status.', needsSite: false, disabled: true },
        { id: 'bulk_update_schema', label: '📋 Bulk Add Schema Markup', desc: 'Add FAQ/Article schema to posts missing it.', needsSite: true, disabled: true },
        { id: 'bulk_recheck_links', label: '🔗 Bulk Check Links', desc: 'Scan all posts for broken affiliate links.', needsSite: true, disabled: true },
    ];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Bulk Operations</h1>
                        <p className="page-description">Mass update meta descriptions, publish posts, add tags, fix schema — across entire sites</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                    <label className="form-label">Site ID <span className="text-muted text-sm">(required for site-wide ops)</span></label>
                    <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="UUID from Sites page" style={{ maxWidth: 400 }} />
                </div>

                <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
                    {OPS.map((op, i) => (
                        <div key={i} className="card" style={{ opacity: op.disabled ? 0.5 : 1 }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{op.label}</div>
                            <div className="text-sm text-muted" style={{ marginBottom: 10 }}>{op.desc}</div>
                            <button className="btn btn-sm btn-primary" onClick={() => !op.disabled && run(op.id)} disabled={running || op.disabled}>
                                {running && activeOp === op.id ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Running...</> : op.disabled ? 'Coming soon' : 'Run'}
                            </button>
                        </div>
                    ))}
                </div>

                {logs.length > 0 ? (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 12 }}>Operation History</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {logs.map((log, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                                    <div>
                                        <span style={{ fontWeight: 600 }}>{log.operation.replace(/_/g, ' ')}</span>
                                        <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{log.items_succeeded}/{log.items_processed} items</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <Badge variant={log.items_succeeded === log.items_processed ? 'success' : 'warning'}>
                                            {log.items_succeeded === log.items_processed ? 'Complete' : 'Partial'}
                                        </Badge>
                                        <span className="text-sm text-muted">{new Date(log.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <EmptyState icon="⚡" title="No bulk operations run yet" description="Enter a site ID and select an operation to bulk-update your content" />
                )}
            </main>
        </div>
    );
}
