'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

interface Program {
    id: string;
    name: string;
    network: string;
    commission_rate: number;
    commission_type: string;
    cookie_duration: number;
}

interface AffLink {
    id: string;
    original_url: string;
    affiliate_url: string;
    anchor_text: string;
    clicks: number;
    conversions: number;
    page_type: string;
    status: string;
    affiliate_programs?: { name: string; network: string };
}

interface DashboardStats {
    totalPrograms: number;
    totalLinks: number;
    activeLinks: number;
    totalClicks: number;
    monthlyRevenue: number;
    avgRevenuePerClick: string;
}

export default function AffiliatesPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'programs' | 'links'>('dashboard');
    const [programs, setPrograms] = useState<Program[]>([]);
    const [links, setLinks] = useState<AffLink[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAddProgram, setShowAddProgram] = useState(false);
    const [showAddLink, setShowAddLink] = useState(false);
    const [newProgram, setNewProgram] = useState({ name: '', network: 'amazon', commission_rate: 0, commission_type: 'percentage', cookie_duration: 30 });
    const [newLink, setNewLink] = useState({ program_id: '', original_url: '', affiliate_url: '', anchor_text: '', page_type: 'info' });

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [progRes, linkRes, dashRes] = await Promise.all([
                fetch('/api/affiliates?type=programs'),
                fetch('/api/affiliates?type=links'),
                fetch('/api/affiliates?type=dashboard'),
            ]);
            const [progData, linkData, dashData] = await Promise.all([progRes.json(), linkRes.json(), dashRes.json()]);
            setPrograms(progData.programs || []);
            setLinks(linkData.links || []);
            setStats(dashData.dashboard || null);
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    const handleAddProgram = async () => {
        if (!newProgram.name) { toast.warning('Program name required'); return; }
        try {
            const res = await fetch('/api/affiliates', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_program', ...newProgram }),
            });
            if (res.ok) {
                toast.success('Program added!');
                setShowAddProgram(false);
                setNewProgram({ name: '', network: 'amazon', commission_rate: 0, commission_type: 'percentage', cookie_duration: 30 });
                fetchAll();
            }
        } catch { toast.error('Failed to add program'); }
    };

    const handleAddLink = async () => {
        if (!newLink.affiliate_url) { toast.warning('Affiliate URL required'); return; }
        try {
            const res = await fetch('/api/affiliates', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_link', ...newLink }),
            });
            if (res.ok) {
                toast.success('Affiliate link added!');
                setShowAddLink(false);
                setNewLink({ program_id: '', original_url: '', affiliate_url: '', anchor_text: '', page_type: 'info' });
                fetchAll();
            }
        } catch { toast.error('Failed to add link'); }
    };

    const networkBadge = (n: string) => {
        const colors: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
            amazon: 'warning', shareasale: 'info', cj: 'success', impact: 'danger', direct: 'neutral' as 'info',
        };
        return colors[n] || 'info';
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Affiliate Revenue</h1>
                        <p className="page-description">Manage programs, track clicks, and monitor revenue</p>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddProgram(true)}>+ Program</button>
                        <button className="btn btn-success btn-sm" onClick={() => setShowAddLink(true)}>+ Link</button>
                    </div>
                </div>

                {/* Dashboard Stats */}
                {stats && (
                    <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                        {[
                            { label: 'Monthly Revenue', value: `$${stats.monthlyRevenue.toFixed(2)}`, icon: '💰' },
                            { label: 'Total Clicks', value: stats.totalClicks.toLocaleString(), icon: '🖱️' },
                            { label: 'Active Links', value: `${stats.activeLinks}/${stats.totalLinks}`, icon: '🔗' },
                            { label: 'Revenue/Click', value: `$${stats.avgRevenuePerClick}`, icon: '📊' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tabs */}
                <div className="tabs" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Overview</button>
                    <button className={`tab ${activeTab === 'programs' ? 'active' : ''}`} onClick={() => setActiveTab('programs')}>🏢 Programs ({programs.length})</button>
                    <button className={`tab ${activeTab === 'links' ? 'active' : ''}`} onClick={() => setActiveTab('links')}>🔗 Links ({links.length})</button>
                </div>

                {/* Add Program Modal */}
                {showAddProgram && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header">
                            <h3 className="card-title">Add Affiliate Program</h3>
                            <button className="btn btn-sm" onClick={() => setShowAddProgram(false)}>✕</button>
                        </div>
                        <div className="grid-2" style={{ gap: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Program Name</label>
                                <input className="form-input" placeholder="e.g., Amazon Associates"
                                    value={newProgram.name} onChange={e => setNewProgram(p => ({ ...p, name: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Network</label>
                                <select className="form-select" value={newProgram.network}
                                    onChange={e => setNewProgram(p => ({ ...p, network: e.target.value }))}>
                                    <option value="amazon">Amazon</option>
                                    <option value="shareasale">ShareASale</option>
                                    <option value="cj">CJ Affiliate</option>
                                    <option value="impact">Impact</option>
                                    <option value="direct">Direct</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Commission Rate (%)</label>
                                <input className="form-input" type="number" step="0.1"
                                    value={newProgram.commission_rate} onChange={e => setNewProgram(p => ({ ...p, commission_rate: parseFloat(e.target.value) || 0 }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Cookie Duration (days)</label>
                                <input className="form-input" type="number"
                                    value={newProgram.cookie_duration} onChange={e => setNewProgram(p => ({ ...p, cookie_duration: parseInt(e.target.value) || 30 }))} />
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleAddProgram}>Save Program</button>
                    </div>
                )}

                {/* Add Link Modal */}
                {showAddLink && (
                    <div className="card animate-in" style={{ marginBottom: 16 }}>
                        <div className="card-header">
                            <h3 className="card-title">Add Affiliate Link</h3>
                            <button className="btn btn-sm" onClick={() => setShowAddLink(false)}>✕</button>
                        </div>
                        <div className="grid-2" style={{ gap: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Program</label>
                                <select className="form-select" value={newLink.program_id}
                                    onChange={e => setNewLink(p => ({ ...p, program_id: e.target.value }))}>
                                    <option value="">Select program...</option>
                                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Page Type</label>
                                <select className="form-select" value={newLink.page_type}
                                    onChange={e => setNewLink(p => ({ ...p, page_type: e.target.value }))}>
                                    <option value="money">💰 Money Page</option>
                                    <option value="review">⭐ Review</option>
                                    <option value="comparison">📊 Comparison</option>
                                    <option value="info">📝 Info Page</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Product URL</label>
                                <input className="form-input" placeholder="https://example.com/product"
                                    value={newLink.original_url} onChange={e => setNewLink(p => ({ ...p, original_url: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Affiliate URL</label>
                                <input className="form-input" placeholder="https://affiliate.link/..."
                                    value={newLink.affiliate_url} onChange={e => setNewLink(p => ({ ...p, affiliate_url: e.target.value }))} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Anchor Text</label>
                            <input className="form-input" placeholder="Click here for best price"
                                value={newLink.anchor_text} onChange={e => setNewLink(p => ({ ...p, anchor_text: e.target.value }))} />
                        </div>
                        <button className="btn btn-success" onClick={handleAddLink}>Save Link</button>
                    </div>
                )}

                {/* Content */}
                <div className="card">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                            <p className="text-sm text-muted">Loading affiliate data...</p>
                        </div>
                    ) : activeTab === 'programs' ? (
                        programs.length === 0 ? (
                            <EmptyState icon="🏢" title="No Programs Yet" description="Add your first affiliate program to start tracking revenue" />
                        ) : (
                            <DataTable
                                data={programs as unknown as Record<string, unknown>[]}
                                searchKeys={['name', 'network']}
                                pageSize={10}
                                columns={[
                                    { key: 'name', label: 'Program', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.name)}</span> },
                                    { key: 'network', label: 'Network', render: (r) => <Badge variant={networkBadge(String(r.network))}>{String(r.network)}</Badge> },
                                    { key: 'commission_rate', label: 'Commission', render: (r) => <span className="font-mono">{Number(r.commission_rate)}%</span> },
                                    { key: 'cookie_duration', label: 'Cookie', render: (r) => <span>{Number(r.cookie_duration)} days</span> },
                                ]}
                            />
                        )
                    ) : activeTab === 'links' ? (
                        links.length === 0 ? (
                            <EmptyState icon="🔗" title="No Links Yet" description="Add affiliate links to track clicks and conversions" />
                        ) : (
                            <DataTable
                                data={links as unknown as Record<string, unknown>[]}
                                searchKeys={['anchor_text', 'affiliate_url']}
                                pageSize={10}
                                columns={[
                                    { key: 'anchor_text', label: 'Anchor', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.anchor_text || r.affiliate_url).substring(0, 40)}</span> },
                                    {
                                        key: 'page_type', label: 'Type', render: (r) => {
                                            const icons: Record<string, string> = { money: '💰', review: '⭐', comparison: '📊', info: '📝' };
                                            return <Badge variant="neutral">{icons[String(r.page_type)] || '📝'} {String(r.page_type)}</Badge>;
                                        }
                                    },
                                    { key: 'clicks', label: 'Clicks', render: (r) => <span className="font-mono">{Number(r.clicks).toLocaleString()}</span> },
                                    { key: 'conversions', label: 'Conv.', render: (r) => <span className="font-mono">{Number(r.conversions)}</span> },
                                    {
                                        key: 'status', label: 'Status', render: (r) => (
                                            <Badge variant={String(r.status) === 'active' ? 'success' : 'warning'}>{String(r.status)}</Badge>
                                        )
                                    },
                                ]}
                            />
                        )
                    ) : (
                        <EmptyState icon="📊" title="Revenue Dashboard" description="Your affiliate revenue overview appears here. Add programs and links to get started." />
                    )}
                </div>
            </main>
        </div>
    );
}
