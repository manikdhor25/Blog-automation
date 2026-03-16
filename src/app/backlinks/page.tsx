'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Backlink {
    id: string; source_url: string; source_domain: string; target_url: string;
    anchor_text: string; link_type: string; status: string;
    domain_authority: number | null; page_authority?: number | null;
    spam_score?: number | null; data_source?: string; first_seen: string;
}
interface BacklinkOpp {
    source_url: string; source_domain: string; anchor_text: string;
    link_type: string; domain_authority: number; strategy: string;
}
interface DomainMetrics {
    domain: string; domainAuthority: number; pageAuthority: number;
    linkingDomains: number; totalBacklinks: number; spamScore: number;
}
interface Site { id: string; name: string; url: string; niche: string; }

export default function BacklinksPage() {
    const toast = useToast();
    const [backlinks, setBacklinks] = useState<Backlink[]>([]);
    const [stats, setStats] = useState({ total: 0, active: 0, lost: 0, new: 0, dofollow: 0, nofollow: 0, uniqueDomains: 0 });
    const [opportunities, setOpportunities] = useState<BacklinkOpp[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [loading, setLoading] = useState(false);
    const [discovering, setDiscovering] = useState(false);
    const [tab, setTab] = useState<'monitor' | 'discover' | 'gap'>('monitor');

    // Gap analysis
    const [competitorDomain, setCompetitorDomain] = useState('');
    const [gapLoading, setGapLoading] = useState(false);
    const [gapData, setGapData] = useState<{
        yourMetrics: DomainMetrics | null;
        competitorMetrics: DomainMetrics | null;
        opportunities: Backlink[];
    } | null>(null);

    // Domain authority lookup
    const [daLookupDomain, setDaLookupDomain] = useState('');
    const [daMetrics, setDaMetrics] = useState<DomainMetrics | null>(null);
    const [daLoading, setDaLoading] = useState(false);

    useEffect(() => { fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { }); }, []);

    const fetchBacklinks = async (siteId: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/backlinks?site_id=${siteId}`);
            const data = await res.json();
            setBacklinks(data.backlinks || []);
            setStats(data.stats || stats);
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    useEffect(() => { if (selectedSite) fetchBacklinks(selectedSite); }, [selectedSite]);

    const handleDiscover = async () => {
        if (!selectedSite) { toast.warning('Select a site first'); return; }
        setDiscovering(true);
        try {
            const res = await fetch('/api/backlinks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'discover', site_id: selectedSite }),
            });
            const data = await res.json();
            if (data.backlinks) {
                toast.success(`Discovered ${data.saved || data.backlinks.length} real backlinks via Moz!`);
                fetchBacklinks(selectedSite);
                setTab('monitor');
            } else if (data.opportunities) {
                setOpportunities(data.opportunities || []);
                setTab('discover');
                toast.info('Showing AI-suggested opportunities (configure Moz API for real data)');
            }
        } catch { toast.error('Discovery failed'); } finally { setDiscovering(false); }
    };

    const handleGapAnalysis = async () => {
        if (!competitorDomain) { toast.warning('Enter competitor domain'); return; }
        const yourSite = sites.find(s => s.id === selectedSite);
        if (!yourSite) { toast.warning('Select your site first'); return; }

        setGapLoading(true);
        try {
            const yourDomain = new URL(yourSite.url).hostname;
            const res = await fetch('/api/backlinks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'gap', your_domain: yourDomain, competitor_domain: competitorDomain }),
            });
            const data = await res.json();
            setGapData(data);
            toast.success('Gap analysis complete!');
        } catch { toast.error('Gap analysis failed'); } finally { setGapLoading(false); }
    };

    const handleDALookup = async () => {
        if (!daLookupDomain) { toast.warning('Enter a domain'); return; }
        setDaLoading(true);
        try {
            const res = await fetch('/api/backlinks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'authority', domain: daLookupDomain }),
            });
            const data = await res.json();
            setDaMetrics(data.metrics);
            if (!data.metrics) toast.warning('No metrics found (check Moz API config)');
        } catch { toast.error('DA lookup failed'); } finally { setDaLoading(false); }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Backlink Intelligence</h1>
                        <p className="page-description">Real backlink data via Moz + AI opportunity discovery</p>
                    </div>
                    <div className="flex gap-2">
                        <button className={`btn ${tab === 'monitor' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab('monitor')}>🔗 Monitor</button>
                        <button className={`btn ${tab === 'discover' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab('discover')}>🔍 Discover</button>
                        <button className={`btn ${tab === 'gap' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab('gap')}>📊 Gap Analysis</button>
                    </div>
                </div>

                <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard label="Total Backlinks" value={stats.total} icon="🔗" />
                    <StatCard label="Active" value={stats.active} icon="✅" />
                    <StatCard label="Dofollow" value={stats.dofollow} icon="👍" />
                    <StatCard label="Unique Domains" value={stats.uniqueDomains} icon="🌐" />
                </div>

                {/* Site selector + actions */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ margin: 0, minWidth: 250 }}>
                            <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={handleDiscover} disabled={discovering || !selectedSite}>
                            {discovering ? '⏳ Discovering...' : '🔍 Discover Backlinks (Moz)'}
                        </button>
                        {/* DA Lookup */}
                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                            <input className="form-input" style={{ width: 180, fontSize: '0.85rem' }} placeholder="Check DA: example.com"
                                value={daLookupDomain} onChange={e => setDaLookupDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDALookup()} />
                            <button className="btn btn-secondary btn-sm" onClick={handleDALookup} disabled={daLoading}>
                                {daLoading ? '...' : '📊'}
                            </button>
                        </div>
                    </div>
                    {daMetrics && (
                        <div className="grid-4" style={{ gap: 12, marginTop: 12 }}>
                            <div style={{ textAlign: 'center', padding: 8, background: 'rgba(99,102,241,0.08)', borderRadius: 8 }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-primary-light)' }}>{daMetrics.domainAuthority}</div>
                                <div className="text-xs text-muted">Domain Authority</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: 8, background: 'rgba(34,197,94,0.08)', borderRadius: 8 }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-success)' }}>{daMetrics.pageAuthority}</div>
                                <div className="text-xs text-muted">Page Authority</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: 8, background: 'rgba(245,158,11,0.08)', borderRadius: 8 }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{daMetrics.linkingDomains.toLocaleString()}</div>
                                <div className="text-xs text-muted">Linking Domains</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: 8, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: daMetrics.spamScore > 30 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>{daMetrics.spamScore}%</div>
                                <div className="text-xs text-muted">Spam Score</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Gap Analysis Tab */}
                {tab === 'gap' && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div className="card-header">
                            <h2 className="card-title">📊 Competitor Backlink Gap</h2>
                        </div>
                        <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                            <input className="form-input" style={{ maxWidth: 300 }} placeholder="Competitor domain (e.g., competitor.com)"
                                value={competitorDomain} onChange={e => setCompetitorDomain(e.target.value)} />
                            <button className="btn btn-primary btn-sm" onClick={handleGapAnalysis} disabled={gapLoading || !selectedSite}>
                                {gapLoading ? '⏳ Analyzing...' : '🔍 Analyze Gap'}
                            </button>
                        </div>
                        {gapData && (
                            <>
                                <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                                    <div style={{ padding: 16, background: 'rgba(99,102,241,0.06)', borderRadius: 8, borderLeft: '3px solid var(--accent-primary)' }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Your Domain</div>
                                        <div className="text-sm">DA: <strong>{gapData.yourMetrics?.domainAuthority || '—'}</strong> | Links: <strong>{gapData.yourMetrics?.totalBacklinks?.toLocaleString() || '—'}</strong></div>
                                    </div>
                                    <div style={{ padding: 16, background: 'rgba(239,68,68,0.06)', borderRadius: 8, borderLeft: '3px solid var(--accent-danger)' }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Competitor</div>
                                        <div className="text-sm">DA: <strong>{gapData.competitorMetrics?.domainAuthority || '—'}</strong> | Links: <strong>{gapData.competitorMetrics?.totalBacklinks?.toLocaleString() || '—'}</strong></div>
                                    </div>
                                </div>
                                {gapData.opportunities.length > 0 && (
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>🎯 Opportunities ({gapData.opportunities.length} sites link to competitor but not you)</div>
                                        <div className="table-wrapper">
                                            <table className="data-table">
                                                <thead><tr><th>Domain</th><th>DA</th><th>Link Type</th></tr></thead>
                                                <tbody>
                                                    {gapData.opportunities.slice(0, 20).map((opp, i) => (
                                                        <tr key={i}>
                                                            <td style={{ fontWeight: 500 }}>{opp.source_domain}</td>
                                                            <td>{opp.domain_authority || '—'}</td>
                                                            <td><Badge variant={opp.link_type === 'dofollow' ? 'success' : 'neutral'}>{opp.link_type}</Badge></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Monitor Tab */}
                {tab === 'monitor' && (
                    !selectedSite ? (
                        <div className="card"><EmptyState icon="🔗" title="Select a Site" description="Choose a site to view and manage backlinks." /></div>
                    ) : loading ? (
                        <div className="card" style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto 16px' }} /><p className="text-sm text-muted">Loading backlinks...</p></div>
                    ) : backlinks.length === 0 ? (
                        <div className="card"><EmptyState icon="🔗" title="No Backlinks Tracked" description="Click 'Discover Backlinks (Moz)' to find real backlinks, or add them manually." /></div>
                    ) : (
                        <div className="card">
                            <div className="card-header"><h2 className="card-title">🔗 Backlinks ({backlinks.length})</h2></div>
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead><tr><th>Source Domain</th><th>Anchor Text</th><th>Type</th><th>Status</th><th>DA</th><th>PA</th><th>Spam</th><th>Source</th></tr></thead>
                                    <tbody>
                                        {backlinks.map(bl => (
                                            <tr key={bl.id}>
                                                <td style={{ fontWeight: 600 }}>
                                                    <a href={bl.source_url} target="_blank" rel="noopener" style={{ color: 'var(--accent-primary-light)', textDecoration: 'none' }}>{bl.source_domain}</a>
                                                </td>
                                                <td className="text-sm">{bl.anchor_text || '—'}</td>
                                                <td><Badge variant={bl.link_type === 'dofollow' ? 'success' : 'neutral'}>{bl.link_type}</Badge></td>
                                                <td><Badge variant={bl.status === 'active' ? 'success' : bl.status === 'new' ? 'info' : 'danger'}>{bl.status}</Badge></td>
                                                <td className="font-mono">{bl.domain_authority || '—'}</td>
                                                <td className="font-mono">{bl.page_authority || '—'}</td>
                                                <td className="font-mono" style={{ color: (bl.spam_score || 0) > 30 ? 'var(--accent-danger)' : 'inherit' }}>{bl.spam_score != null ? `${bl.spam_score}%` : '—'}</td>
                                                <td><Badge variant={bl.data_source === 'moz' ? 'info' : 'neutral'}>{bl.data_source || 'manual'}</Badge></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                )}

                {/* Discover Tab */}
                {tab === 'discover' && (
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">🔍 Link Building Opportunities ({opportunities.length})</h2>
                            <p className="card-subtitle">AI-discovered backlink prospects</p>
                        </div>
                        {opportunities.length === 0 ? (
                            <EmptyState icon="🔍" title="No Opportunities Yet" description="Click 'Discover Backlinks' to find link building prospects." />
                        ) : (
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead><tr><th>Source</th><th>Anchor Text</th><th>Type</th><th>DA</th><th>Strategy</th></tr></thead>
                                    <tbody>
                                        {opportunities.map((opp, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 600 }}>{opp.source_domain}</td>
                                                <td className="text-sm">{opp.anchor_text}</td>
                                                <td><Badge variant={opp.link_type === 'dofollow' ? 'success' : 'neutral'}>{opp.link_type}</Badge></td>
                                                <td>{opp.domain_authority}</td>
                                                <td className="text-sm">{opp.strategy}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
