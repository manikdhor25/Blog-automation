'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Redirect { id: string; from_path: string; to_url: string; redirect_type: string; notes: string; is_active: boolean; hit_count: number; created_at: string; }

export default function RedirectsPage() {
    const toast = useToast();
    const [redirects, setRedirects] = useState<Redirect[]>([]);
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [showBulk, setShowBulk] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [htaccess, setHtaccess] = useState('');
    const [form, setForm] = useState({ from_path: '', to_url: '', redirect_type: '301', notes: '' });
    const [bulkCsv, setBulkCsv] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchAll(); }, [siteId]);

    const fetchAll = async () => {
        setLoading(true);
        const [rRes, sRes] = await Promise.all([fetch(`/api/redirects${siteId ? `?site_id=${siteId}` : ''}`), fetch('/api/redirects')]);
        const [rData, sData] = await Promise.all([rRes.json(), sRes.json()]);
        setRedirects(rData.redirects || []);
        setSites(sData.sites || []);
        setLoading(false);
    };

    const create = async () => {
        if (!form.from_path || !form.to_url) { toast.warning('From and To paths required'); return; }
        const res = await fetch('/api/redirects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...form, site_id: siteId || undefined }) });
        if (res.ok) { toast.success('Redirect created'); setShowAdd(false); fetchAll(); }
        else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    };

    const bulkCreate = async () => {
        const lines = bulkCsv.trim().split('\n').filter(Boolean);
        const redirectsList = lines.map(line => {
            const [from_path, to_url, redirect_type] = line.split(',').map(s => s.trim());
            return { from_path, to_url, redirect_type: redirect_type || '301' };
        }).filter(r => r.from_path && r.to_url);

        if (!redirectsList.length) { toast.warning('No valid rows. Format: /old-path, https://new-url, 301'); return; }
        const res = await fetch('/api/redirects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_create', redirects: redirectsList, site_id: siteId || undefined }) });
        const data = await res.json();
        if (res.ok) { toast.success(`Created ${data.created} redirects`); setShowBulk(false); setBulkCsv(''); fetchAll(); }
    };

    const generateConfig = async () => {
        if (!siteId) { toast.warning('Select a site first'); return; }
        const res = await fetch('/api/redirects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push_to_wp', site_id: siteId }) });
        const data = await res.json();
        setHtaccess(data.htaccess || '');
        setShowConfig(true);
        toast.success(data.message || 'Config generated');
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Redirect Manager</h1>
                        <p className="page-description">301/302 redirects — create, bulk import, export .htaccess</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => setShowBulk(true)}>Bulk Import</button>
                        <button className="btn btn-sm" onClick={generateConfig}>Export .htaccess</button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Redirect</button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                    <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)} style={{ maxWidth: 250 }}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <span className="text-sm text-muted">{redirects.length} redirects</span>
                </div>

                {showAdd && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Add Redirect</h3><button className="btn btn-sm" onClick={() => setShowAdd(false)}>✕</button></div>
                        <div className="grid-2" style={{ gap: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">From Path</label>
                                <input className="form-input" placeholder="/old-page-slug" value={form.from_path} onChange={e => setForm(f => ({ ...f, from_path: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">To URL</label>
                                <input className="form-input" placeholder="https://site.com/new-page" value={form.to_url} onChange={e => setForm(f => ({ ...f, to_url: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Type</label>
                                <select className="form-select" value={form.redirect_type} onChange={e => setForm(f => ({ ...f, redirect_type: e.target.value }))}>
                                    <option value="301">301 Permanent</option>
                                    <option value="302">302 Temporary</option>
                                    <option value="307">307 Temporary</option>
                                    <option value="410">410 Gone</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Notes</label>
                                <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reason for redirect" />
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={create}>Create Redirect</button>
                    </div>
                )}

                {showBulk && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">Bulk Import (CSV)</h3><button className="btn btn-sm" onClick={() => setShowBulk(false)}>✕</button></div>
                        <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Format: from_path, to_url, type (one per line)</div>
                        <textarea className="form-input" rows={8} value={bulkCsv} onChange={e => setBulkCsv(e.target.value)} placeholder="/old-blog/, https://site.com/blog/, 301&#10;/old-page/, https://site.com/page/, 301" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                        <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={bulkCreate}>Import</button>
                    </div>
                )}

                {showConfig && htaccess && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h3 className="card-title">.htaccess Config</h3><button className="btn btn-sm" onClick={() => setShowConfig(false)}>✕</button></div>
                        <textarea className="form-input" rows={12} readOnly value={htaccess} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
                        <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard.writeText(htaccess); toast.success('Copied'); }}>Copy .htaccess</button>
                    </div>
                )}

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : redirects.length === 0 ? <EmptyState icon="🔀" title="No Redirects" description="Add redirects to preserve SEO equity during site restructuring" />
                        : <DataTable data={redirects as unknown as Record<string, unknown>[]} searchKeys={['from_path', 'to_url', 'notes']} pageSize={25} columns={[
                            { key: 'from_path', label: 'From', render: (r) => <code style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>{String(r.from_path)}</code> },
                            { key: 'to_url', label: 'To', render: (r) => <span className="text-sm text-muted" style={{ maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r.to_url)}</span> },
                            { key: 'redirect_type', label: 'Type', render: (r) => <Badge variant={String(r.redirect_type) === '301' ? 'success' : String(r.redirect_type) === '410' ? 'danger' : 'info'}>{String(r.redirect_type)}</Badge> },
                            { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'success' : 'warning'}>{r.is_active ? 'Active' : 'Paused'}</Badge> },
                            { key: 'notes', label: 'Notes', render: (r) => <span className="text-sm text-muted">{String(r.notes || '—').substring(0, 40)}</span> },
                            { key: 'actions', label: '', render: (r) => <button className="btn btn-sm btn-danger" onClick={async () => { await fetch('/api/redirects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) }); fetchAll(); }}>Del</button> },
                        ]} />
                    }
                </div>
            </main>
        </div>
    );
}
