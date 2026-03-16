'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface GraphNode {
    id: string; title: string; slug: string; keyword: string; score: number;
    incoming: number; outgoing: number; isOrphan: boolean; isHub: boolean;
}
interface GraphEdge { source: string; target: string; }
interface Site { id: string; name: string; }

export default function LinkGraphPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [edges, setEdges] = useState<GraphEdge[]>([]);
    const [stats, setStats] = useState({ totalPages: 0, totalLinks: 0, orphans: 0, hubs: 0, avgLinksPerPage: '0' });
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<'all' | 'orphans' | 'hubs'>('all');

    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    const handleScan = async () => {
        if (!selectedSite) { toast.warning('Select a site first'); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/link-graph?site_id=${selectedSite}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setNodes(data.nodes || []);
            setEdges(data.edges || []);
            setStats(data.stats || { totalPages: 0, totalLinks: 0, orphans: 0, hubs: 0, avgLinksPerPage: '0' });
            toast.success(`Mapped ${data.nodes?.length || 0} pages with ${data.edges?.length || 0} links`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Scan failed');
        } finally {
            setLoading(false);
        }
    };

    const filtered = view === 'orphans' ? nodes.filter(n => n.isOrphan) :
        view === 'hubs' ? nodes.filter(n => n.isHub) : nodes;

    const getLinkedTo = (nodeId: string) => {
        const targetIds = edges.filter(e => e.source === nodeId).map(e => e.target);
        return nodes.filter(n => targetIds.includes(n.id));
    };

    const getLinkedFrom = (nodeId: string) => {
        const sourceIds = edges.filter(e => e.target === nodeId).map(e => e.source);
        return nodes.filter(n => sourceIds.includes(n.id));
    };

    const [expandedId, setExpandedId] = useState<string | null>(null);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Link Graph</h1>
                        <p className="page-description">Visualize internal link structure, find orphan pages and link hubs</p>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="grid-3" style={{ gap: 16 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Site</label>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleScan} disabled={loading} style={{ width: '100%' }}>
                                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Scanning...</> : '🕸️ Map Link Graph'}
                            </button>
                        </div>
                    </div>
                </div>

                {stats.totalPages > 0 && (
                    <>
                        <div className="grid-4" style={{ marginBottom: 24 }}>
                            <StatCard label="Total Pages" value={stats.totalPages} icon="📄" />
                            <StatCard label="Internal Links" value={stats.totalLinks} icon="🔗" />
                            <StatCard label="Orphan Pages" value={stats.orphans} icon="⚠️" />
                            <StatCard label="Link Hubs" value={stats.hubs} icon="🌟" />
                        </div>

                        {/* Filter tabs */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            {(['all', 'orphans', 'hubs'] as const).map(v => (
                                <button key={v} className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(v)}>
                                    {v === 'all' ? `📄 All (${nodes.length})` : v === 'orphans' ? `⚠️ Orphans (${stats.orphans})` : `🌟 Hubs (${stats.hubs})`}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <div className="card">
                    {filtered.length === 0 && stats.totalPages === 0 ? (
                        <EmptyState icon="🕸️" title="No Link Data" description="Select a site and scan to map your internal link structure." />
                    ) : filtered.length === 0 ? (
                        <EmptyState icon="✅" title={view === 'orphans' ? 'No Orphan Pages!' : 'No Link Hubs'} description="Great — your link structure is balanced." />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {filtered.map(node => (
                                <div key={node.id} className="card" style={{
                                    cursor: 'pointer',
                                    border: expandedId === node.id ? '1px solid var(--accent-primary)' : undefined,
                                }}
                                    onClick={() => setExpandedId(expandedId === node.id ? null : node.id)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '1.1rem' }}>{node.isOrphan ? '⚠️' : node.isHub ? '🌟' : '📄'}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{node.title}</div>
                                            <div className="text-sm text-muted">/{node.slug} • {node.keyword || 'no keyword'}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <Badge variant="info">↙ {node.incoming} in</Badge>
                                            <Badge variant="neutral">↗ {node.outgoing} out</Badge>
                                            <Badge variant={node.score >= 70 ? 'success' : node.score >= 40 ? 'warning' : 'danger'}>
                                                {node.score}/100
                                            </Badge>
                                        </div>
                                    </div>

                                    {expandedId === node.id && (
                                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                                            <div className="grid-2" style={{ gap: 16 }}>
                                                <div>
                                                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>Links To ({getLinkedTo(node.id).length})</div>
                                                    {getLinkedTo(node.id).length === 0 ? (
                                                        <div className="text-sm text-muted">No outgoing links</div>
                                                    ) : getLinkedTo(node.id).map(t => (
                                                        <div key={t.id} className="text-sm" style={{ marginBottom: 2 }}>→ {t.title}</div>
                                                    ))}
                                                </div>
                                                <div>
                                                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>Linked From ({getLinkedFrom(node.id).length})</div>
                                                    {getLinkedFrom(node.id).length === 0 ? (
                                                        <div className="text-sm text-muted" style={{ color: 'var(--accent-danger)' }}>⚠️ No incoming links (orphan)</div>
                                                    ) : getLinkedFrom(node.id).map(s => (
                                                        <div key={s.id} className="text-sm" style={{ marginBottom: 2 }}>← {s.title}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
