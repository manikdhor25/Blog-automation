'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface QueueItem {
    id: string;
    title: string;
    keyword: string;
    status: 'draft' | 'review' | 'scheduled' | 'published' | 'failed';
    score: number;
    site_name: string;
    site_id: string;
    scheduled_at: string | null;
    created_at: string;
    updated_at: string;
}

export default function QueuePage() {
    const [items, setItems] = useState<QueueItem[]>([]);
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const fetchQueue = async () => {
        setLoading(true);
        try {
            const url = filter === 'all' ? '/api/queue' : `/api/queue?status=${filter}`;
            const res = await fetch(url);
            const data = await res.json();
            setItems(data.items || []);
        } catch { /* keep empty */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchQueue(); }, [filter]);

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === items.length) setSelected(new Set());
        else setSelected(new Set(items.map(i => i.id)));
    };

    const handleBulkAction = async (action: 'schedule' | 'delete') => {
        if (selected.size === 0) return;
        if (action === 'delete') {
            if (!confirm(`Delete ${selected.size} items?`)) return;
            try {
                await fetch(`/api/queue?ids=${Array.from(selected).join(',')}`, { method: 'DELETE' });
                setSelected(new Set());
                fetchQueue();
            } catch { toast.error('Failed to delete item'); }
        } else {
            for (const id of selected) {
                await fetch('/api/queue', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, status: 'scheduled', scheduled_at: new Date(Date.now() + 86400000).toISOString() }),
                });
            }
            setSelected(new Set());
            fetchQueue();
        }
    };

    const handleStatusChange = async (id: string, status: string) => {
        await fetch('/api/queue', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        fetchQueue();
    };

    const getStatusVariant = (s: string): 'success' | 'warning' | 'info' | 'danger' | 'neutral' => {
        switch (s) {
            case 'published': return 'success';
            case 'scheduled': return 'info';
            case 'review': return 'warning';
            case 'failed': return 'danger';
            default: return 'neutral';
        }
    };

    const counts = {
        all: items.length,
        draft: items.filter(i => i.status === 'draft').length,
        review: items.filter(i => i.status === 'review').length,
        scheduled: items.filter(i => i.status === 'scheduled').length,
        published: items.filter(i => i.status === 'published').length,
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Publish Queue</h1>
                        <p className="page-description">Manage your content pipeline — review, schedule, and publish</p>
                    </div>
                    {selected.size > 0 && (
                        <div className="flex gap-2">
                            <button className="btn btn-primary btn-sm" onClick={() => handleBulkAction('schedule')}>
                                📅 Schedule {selected.size}
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleBulkAction('delete')}>
                                🗑️ Delete {selected.size}
                            </button>
                        </div>
                    )}
                </div>

                <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard label="Total" value={counts.all} icon="📋" />
                    <StatCard label="Drafts" value={counts.draft} icon="📝" />
                    <StatCard label="In Review" value={counts.review} icon="👀" />
                    <StatCard label="Scheduled" value={counts.scheduled} icon="📅" />
                    <StatCard label="Published" value={counts.published} icon="✅" />
                </div>

                {/* Filters */}
                <div className="flex gap-2" style={{ marginBottom: 20 }}>
                    {['all', 'draft', 'review', 'scheduled', 'published'].map(f => (
                        <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                            onClick={() => setFilter(f)}>
                            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                        <div className="spinner" style={{ margin: '0 auto 16px' }} />
                        <p className="text-sm text-muted">Loading queue...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="card">
                        <EmptyState icon="📋" title="Queue is Empty"
                            description="Create content through the Content Writer to add items to your publishing queue."
                            action={<a href="/create" className="btn btn-primary">✍️ Create Content</a>} />
                    </div>
                ) : (
                    <div className="card">
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" checked={selected.size === items.length && items.length > 0}
                                            onChange={toggleAll} /></th>
                                        <th>Title</th>
                                        <th>Keyword</th>
                                        <th>Status</th>
                                        <th>Score</th>
                                        <th>Site</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={item.id}>
                                            <td><input type="checkbox" checked={selected.has(item.id)}
                                                onChange={() => toggleSelect(item.id)} /></td>
                                            <td style={{ fontWeight: 600, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.title}
                                            </td>
                                            <td className="text-sm text-muted">{item.keyword || '—'}</td>
                                            <td><Badge variant={getStatusVariant(item.status)}>{item.status}</Badge></td>
                                            <td>
                                                <span style={{
                                                    fontWeight: 700,
                                                    color: item.score >= 70 ? 'var(--accent-success)' :
                                                        item.score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)'
                                                }}>{item.score || '—'}</span>
                                            </td>
                                            <td className="text-sm">{item.site_name || '—'}</td>
                                            <td className="text-sm text-muted">{new Date(item.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <select className="form-select" style={{ fontSize: '0.75rem', padding: '4px 8px', minWidth: 100 }}
                                                        value={item.status} onChange={e => handleStatusChange(item.id, e.target.value)}>
                                                        <option value="draft">Draft</option>
                                                        <option value="review">Review</option>
                                                        <option value="scheduled">Scheduled</option>
                                                        <option value="published">Published</option>
                                                    </select>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
