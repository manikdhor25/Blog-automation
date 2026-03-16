'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Site {
    id: string;
    name: string;
    url: string;
    username: string;
    niche: string;
    created_at: string;
}

export default function SitesPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [testing, setTesting] = useState(false);
    const [formData, setFormData] = useState({
        name: '', url: '', username: '', app_password: '', niche: '',
    });
    const [message, setMessage] = useState({ type: '', text: '' });
    const [syncingId, setSyncingId] = useState<string | null>(null);

    useEffect(() => {
        fetchSites();
    }, []);

    const fetchSites = async () => {
        try {
            const res = await fetch('/api/sites');
            const data = await res.json();
            setSites(data.sites || []);
        } catch {
            console.error('Failed to fetch sites');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTesting(true);
        setMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/sites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Failed to add site' });
                return;
            }

            setSites(prev => [data.site, ...prev]);
            setShowModal(false);
            setFormData({ name: '', url: '', username: '', app_password: '', niche: '' });
            setMessage({ type: 'success', text: `"${data.site.name}" connected successfully!` });
        } catch {
            setMessage({ type: 'error', text: 'Failed to connect site' });
        } finally {
            setTesting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this site?')) return;

        try {
            await fetch(`/api/sites?id=${id}`, { method: 'DELETE' });
            setSites(prev => prev.filter(s => s.id !== id));
        } catch {
            toast.error('Failed to delete site');
        }
    };

    const handleSync = async (siteId: string) => {
        setSyncingId(siteId);
        setMessage({ type: '', text: '' });
        try {
            const res = await fetch('/api/sites/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId }),
            });
            const data = await res.json();
            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Sync failed' });
            } else {
                setMessage({ type: 'success', text: data.message || `Synced ${data.totalWpPosts} posts` });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to sync posts' });
        } finally {
            setSyncingId(null);
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Site Manager</h1>
                        <p className="page-description">Manage your WordPress sites</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        + Add WordPress Site
                    </button>
                </div>

                <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard label="Total Sites" value={sites.length} icon="🌐" delay={1} />
                    <StatCard label="Total Posts" value="—" icon="📄" delay={2} />
                    <StatCard label="Avg SEO Score" value="—" icon="📊" delay={3} />
                </div>

                {message.text && (
                    <div style={{
                        padding: '12px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16,
                        background: message.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                        border: `1px solid ${message.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                        color: message.type === 'error' ? '#f87171' : '#4ade80',
                        fontSize: '0.875rem',
                    }}>
                        {message.text}
                    </div>
                )}

                {loading ? (
                    <div className="card"><div className="loading-skeleton" style={{ height: 200 }} /></div>
                ) : sites.length === 0 ? (
                    <div className="card">
                        <EmptyState
                            icon="🌐"
                            title="No WordPress Sites"
                            description="Connect your WordPress sites to start managing content."
                            action={<button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Your First Site</button>}
                        />
                    </div>
                ) : (
                    <div className="card">
                        <div className="table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Site</th>
                                        <th>URL</th>
                                        <th>Niche</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sites.map((site) => (
                                        <tr key={site.id}>
                                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{site.name}</td>
                                            <td>
                                                <a href={site.url} target="_blank" rel="noopener" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none' }}>
                                                    {site.url.replace(/https?:\/\//, '')}
                                                </a>
                                            </td>
                                            <td><Badge variant="info">{site.niche || 'Not set'}</Badge></td>
                                            <td><Badge variant="success">Connected</Badge></td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="btn btn-secondary btn-sm" disabled={syncingId === site.id} onClick={() => handleSync(site.id)}>
                                                        {syncingId === site.id ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Syncing...</> : '🔄 Sync Posts'}
                                                    </button>
                                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(site.id)}>Remove</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Add Site Modal */}
                {showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h2 className="modal-title">Add WordPress Site</h2>
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label className="form-label">Site Name</label>
                                    <input className="form-input" placeholder="My Blog" value={formData.name}
                                        onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">WordPress URL</label>
                                    <input className="form-input" placeholder="https://yourblog.com" value={formData.url}
                                        onChange={e => setFormData(p => ({ ...p, url: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Username</label>
                                    <input className="form-input" placeholder="admin" value={formData.username}
                                        onChange={e => setFormData(p => ({ ...p, username: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Application Password</label>
                                    <input className="form-input" type="password" placeholder="xxxx xxxx xxxx xxxx" value={formData.app_password}
                                        onChange={e => setFormData(p => ({ ...p, app_password: e.target.value }))} required />
                                    <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                                        Generate in WP Admin → Users → Profile → Application Passwords
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Niche</label>
                                    <input className="form-input" placeholder="e.g., Tech, Health, Finance" value={formData.niche}
                                        onChange={e => setFormData(p => ({ ...p, niche: e.target.value }))} />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={testing}>
                                        {testing ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Testing & Adding...</> : 'Test Connection & Add'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
