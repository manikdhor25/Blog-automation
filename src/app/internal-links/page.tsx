'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

// === Interfaces for Analysis tab (original internal-links) ===
interface Site { id: string; name: string; url: string; }

interface LinkSuggestion {
    id: string;
    anchorText: string;
    targetUrl: string;
    targetTitle: string;
    relevanceScore: number;
    type: 'internal' | 'external';
}

interface PostAnalysis {
    postId: string;
    wpPostId: number;
    title: string;
    slug: string;
    currentInternalLinks: number;
    suggestions: LinkSuggestion[];
}

interface Stats {
    totalPosts: number;
    totalSuggestions: number;
    postsWithNoLinks: number;
    avgLinksPerPost: number;
}

// === Interfaces for Builder tab (from link-builder) ===
interface Opportunity { id: string; from_post_id: string; from_title: string; to_post_id: string; to_title: string; to_slug: string; anchor_text: string; insertion_context: string; relevance: number; reason: string; status: string; }
interface Orphan { id: string; title: string; slug: string; overall_score: number; }

// === Interfaces for Auto-Inject tab (from internal-link-injector) ===
interface InjectorOpportunity { id: string; from_post_id: string; from_post_title: string; to_post_id: string; to_post_title: string; anchor_text: string; context_hint: string; relevance_score: number; reason: string; status: string; }

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'neutral'> = { pending: 'warning', injected: 'success', dismissed: 'neutral' };

export default function InternalLinksPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('analysis');

    // === Analysis tab state ===
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [applying, setApplying] = useState(false);
    const [results, setResults] = useState<PostAnalysis[]>([]);
    const [stats, setStats] = useState<Stats>({ totalPosts: 0, totalSuggestions: 0, postsWithNoLinks: 0, avgLinksPerPost: 0 });
    const [expandedPost, setExpandedPost] = useState<string | null>(null);
    const [selectedLinks, setSelectedLinks] = useState<Record<string, boolean>>({});
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    // === Builder tab state ===
    const [builderSiteId, setBuilderSiteId] = useState('');
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [orphans, setOrphans] = useState<Orphan[]>([]);
    const [builderSelected, setBuilderSelected] = useState<Set<string>>(new Set());
    const [finding, setFinding] = useState(false);
    const [builderInjecting, setBuilderInjecting] = useState(false);
    const [builderLoading, setBuilderLoading] = useState(false);
    const [builderSubTab, setBuilderSubTab] = useState<'opportunities' | 'orphans'>('opportunities');

    // === Auto-Inject tab state ===
    const [injectorOpportunities, setInjectorOpportunities] = useState<InjectorOpportunity[]>([]);
    const [injectorSiteId, setInjectorSiteId] = useState('');
    const [injectorFilter, setInjectorFilter] = useState('pending');
    const [scanning, setScanning] = useState(false);
    const [injecting, setInjecting] = useState<string | null>(null);
    const [pendingCount, setPendingCount] = useState(0);

    // === Shared: load sites ===
    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { });
    }, []);

    // =============================================
    // ANALYSIS TAB FUNCTIONS
    // =============================================
    const handleAnalyze = async () => {
        if (!selectedSite) { toast.warning('Select a site first'); return; }
        setAnalyzing(true);
        setResults([]);
        setSelectedLinks({});
        setProgress({ current: 0, total: 0 });

        try {
            let allResults: PostAnalysis[] = [];
            let offset = 0;
            let hasMore = true;
            const limit = 10;

            while (hasMore) {
                const res = await fetch('/api/internal-links/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ site_id: selectedSite, offset, limit }),
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Analysis failed');
                }

                const data = await res.json();
                allResults = [...allResults, ...data.results];
                hasMore = data.hasMore;
                offset += limit;

                setProgress({ current: allResults.length, total: data.total });
                setResults([...allResults]);
                setStats(data.stats);

                const autoSelect: Record<string, boolean> = {};
                for (const post of data.results) {
                    for (const s of post.suggestions) {
                        if (s.relevanceScore >= 0.7) {
                            autoSelect[s.id] = true;
                        }
                    }
                }
                setSelectedLinks(prev => ({ ...prev, ...autoSelect }));
            }

            const totalSuggestions = allResults.reduce((sum, r) => sum + r.suggestions.length, 0);
            toast.success(`Found ${totalSuggestions} link opportunities across ${allResults.length} posts`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Analysis failed');
        } finally {
            setAnalyzing(false);
        }
    };

    const handleApply = async () => {
        const changes = results
            .filter(post => post.suggestions.some(s => selectedLinks[s.id]))
            .map(post => ({
                postId: post.postId,
                wpPostId: post.wpPostId,
                links: post.suggestions.filter(s => selectedLinks[s.id]),
            }));

        if (changes.length === 0) {
            toast.warning('No links selected. Check some suggestions first.');
            return;
        }

        setApplying(true);
        try {
            const res = await fetch('/api/internal-links/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_id: selectedSite, changes }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Apply failed');
            }

            const data = await res.json();
            toast.success(`Updated ${data.summary.postsUpdated} posts with ${data.summary.totalLinksAdded} new internal links!`);

            if (data.summary.failures > 0) {
                toast.warning(`${data.summary.failures} posts failed to update`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to apply links');
        } finally {
            setApplying(false);
        }
    };

    const toggleLink = (linkId: string) => {
        setSelectedLinks(prev => ({ ...prev, [linkId]: !prev[linkId] }));
    };

    const toggleAllForPost = (post: PostAnalysis) => {
        const allSelected = post.suggestions.every(s => selectedLinks[s.id]);
        const updates: Record<string, boolean> = {};
        post.suggestions.forEach(s => { updates[s.id] = !allSelected; });
        setSelectedLinks(prev => ({ ...prev, ...updates }));
    };

    const selectedCount = Object.values(selectedLinks).filter(Boolean).length;
    const postsWithSelections = results.filter(p => p.suggestions.some(s => selectedLinks[s.id])).length;

    // =============================================
    // BUILDER TAB FUNCTIONS
    // =============================================
    useEffect(() => {
        if (builderSiteId) {
            loadOpportunities();
            loadOrphans();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [builderSiteId]);

    const loadOpportunities = async () => {
        setBuilderLoading(true);
        const res = await fetch(`/api/link-builder${builderSiteId ? `?site_id=${builderSiteId}` : ''}`);
        const data = await res.json();
        setOpportunities(data.opportunities || []);
        setBuilderLoading(false);
    };

    const loadOrphans = async () => {
        const res = await fetch('/api/link-builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_orphans', site_id: builderSiteId }) });
        const data = await res.json();
        setOrphans(data.orphans || []);
    };

    const findOpportunities = async () => {
        if (!builderSiteId) { toast.warning('Select a site'); return; }
        setFinding(true);
        const res = await fetch('/api/link-builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'find_opportunities', site_id: builderSiteId, max_links_per_post: 5 }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setFinding(false); return; }
        toast.success(`Found ${data.count} link opportunities`);
        loadOpportunities();
        setFinding(false);
    };

    const injectSelected = async () => {
        if (builderSelected.size === 0) { toast.warning('Select opportunities to inject'); return; }
        setBuilderInjecting(true);
        const injections = opportunities.filter(o => builderSelected.has(o.id)).map(o => ({ from_post_id: o.from_post_id, to_post_id: o.to_post_id, anchor_text: o.anchor_text, insertion_context: o.insertion_context }));
        const res = await fetch('/api/link-builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'inject_links', injections }) });
        const data = await res.json();
        toast.success(`Injected ${data.injected} links${data.failed > 0 ? `, ${data.failed} need manual placement` : ''}`);
        setBuilderSelected(new Set());
        loadOpportunities();
        setBuilderInjecting(false);
    };

    const relevanceColor = (r: number) => r >= 0.85 ? '#16a34a' : r >= 0.70 ? '#d97706' : '#6b7280';

    // =============================================
    // AUTO-INJECT TAB FUNCTIONS
    // =============================================
    useEffect(() => { if (injectorSiteId) loadInjectorOpportunities(); }, [injectorFilter, injectorSiteId]);

    const loadInjectorOpportunities = async () => {
        const res = await fetch(`/api/internal-link-injector?site_id=${injectorSiteId}&status=${injectorFilter}`);
        const data = await res.json();
        setInjectorOpportunities(data.opportunities || []);
        setPendingCount(data.pending_count || 0);
    };

    const scanForOpportunities = async () => {
        if (!injectorSiteId) { toast.warning('Enter site ID'); return; }
        setScanning(true);
        const res = await fetch('/api/internal-link-injector', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scan', site_id: injectorSiteId, max_links_per_post: 3 }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setScanning(false); return; }
        toast.success(`Found ${data.count} link opportunities via ${data.provider}`);
        loadInjectorOpportunities();
        setScanning(false);
    };

    const injectSingle = async (id: string) => {
        setInjecting(id);
        const res = await fetch('/api/internal-link-injector', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'inject', opportunity_id: id }),
        });
        const data = await res.json();
        if (res.ok && data.injected) { toast.success(`Injected: "${data.anchor}"`); loadInjectorOpportunities(); }
        else toast.warning(data.reason || 'Could not inject');
        setInjecting(null);
    };

    const dismissOpportunity = async (id: string) => {
        await fetch('/api/internal-link-injector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss', opportunity_id: id }) });
        loadInjectorOpportunities();
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Internal Links</h1>
                        <p className="page-description">
                            Analyze, build, and auto-inject internal links across your WordPress posts
                        </p>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'analysis' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('analysis')}>📊 Analysis</button>
                    <button className={`btn ${activeTab === 'builder' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('builder')}>🔨 Builder</button>
                    <button className={`btn ${activeTab === 'auto-inject' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('auto-inject')}>⚡ Auto-Inject</button>
                </div>

                {/* ===== ANALYSIS TAB ===== */}
                {activeTab === 'analysis' && (
                    <>
                        {/* Step 1: Site selector + Analyze */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="card-header">
                                <h2 className="card-title">1️⃣ Select Site & Analyze</h2>
                            </div>
                            <div className="grid-3" style={{ gap: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">WordPress Site</label>
                                    <select
                                        className="form-select"
                                        value={selectedSite}
                                        onChange={e => { setSelectedSite(e.target.value); setResults([]); }}
                                    >
                                        <option value="">Select a site...</option>
                                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleAnalyze}
                                        disabled={!selectedSite || analyzing}
                                        style={{ width: '100%' }}
                                    >
                                        {analyzing ? (
                                            <>
                                                <span className="spinner" style={{ width: 16, height: 16 }} />
                                                {' '}Analyzing {progress.current}/{progress.total}...
                                            </>
                                        ) : '🔍 Analyze Internal Links'}
                                    </button>
                                </div>
                                {results.length > 0 && (
                                    <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                        <button
                                            className="btn btn-success"
                                            onClick={handleApply}
                                            disabled={applying || selectedCount === 0}
                                            style={{ width: '100%' }}
                                        >
                                            {applying ? (
                                                <><span className="spinner" style={{ width: 16, height: 16 }} /> Applying...</>
                                            ) : `✅ Apply ${selectedCount} Links to ${postsWithSelections} Posts`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Stats */}
                        {stats.totalPosts > 0 && (
                            <div className="grid-4" style={{ marginBottom: 24 }}>
                                <StatCard label="Total Posts" value={stats.totalPosts} icon="📄" />
                                <StatCard label="Link Opportunities" value={stats.totalSuggestions} icon="🔗" />
                                <StatCard label="Posts Without Links" value={stats.postsWithNoLinks} icon="⚠️" />
                                <StatCard label="Avg Links/Post" value={stats.avgLinksPerPost} icon="📊" />
                            </div>
                        )}

                        {/* Results */}
                        <div className="card">
                            {results.length === 0 && !analyzing ? (
                                <EmptyState
                                    icon="🔗"
                                    title="No Analysis Yet"
                                    description="Select a WordPress site and click 'Analyze Internal Links' to discover linking opportunities across all your posts."
                                />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {results.map(post => (
                                        <div
                                            key={post.postId}
                                            className="card"
                                            style={{
                                                border: expandedPost === post.postId
                                                    ? '1px solid var(--accent-primary)'
                                                    : '1px solid var(--border-subtle)',
                                                transition: 'border-color 0.2s ease',
                                            }}
                                        >
                                            {/* Post header row */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    cursor: 'pointer',
                                                    flexWrap: 'wrap',
                                                }}
                                                onClick={() => setExpandedPost(expandedPost === post.postId ? null : post.postId)}
                                            >
                                                <span style={{ fontSize: '1.1rem' }}>
                                                    {post.currentInternalLinks === 0 ? '⚠️' : post.suggestions.length > 0 ? '💡' : '✅'}
                                                </span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{post.title}</div>
                                                    <div className="text-sm text-muted">/{post.slug}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Badge variant={post.currentInternalLinks > 0 ? 'info' : 'danger'}>
                                                        🔗 {post.currentInternalLinks} existing
                                                    </Badge>
                                                    <Badge variant={post.suggestions.length > 0 ? 'success' : 'neutral'}>
                                                        💡 {post.suggestions.length} suggested
                                                    </Badge>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        {expandedPost === post.postId ? '▲' : '▼'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Expanded suggestions */}
                                            {expandedPost === post.postId && (
                                                <div style={{
                                                    marginTop: 12,
                                                    paddingTop: 12,
                                                    borderTop: '1px solid var(--border-subtle)',
                                                }}>
                                                    {post.suggestions.length === 0 ? (
                                                        <div className="text-sm text-muted" style={{ padding: '8px 0' }}>
                                                            No additional internal link opportunities found for this post.
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                marginBottom: 8,
                                                            }}>
                                                                <span className="text-sm" style={{ fontWeight: 600 }}>
                                                                    Suggested Internal Links
                                                                </span>
                                                                <button
                                                                    className="btn btn-sm btn-secondary"
                                                                    onClick={(e) => { e.stopPropagation(); toggleAllForPost(post); }}
                                                                >
                                                                    {post.suggestions.every(s => selectedLinks[s.id])
                                                                        ? 'Deselect All' : 'Select All'}
                                                                </button>
                                                            </div>
                                                            {post.suggestions.map(s => (
                                                                <div
                                                                    key={s.id}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 12,
                                                                        padding: '10px 12px',
                                                                        marginBottom: 4,
                                                                        borderRadius: 'var(--radius-sm)',
                                                                        background: selectedLinks[s.id]
                                                                            ? 'rgba(34, 197, 94, 0.08)'
                                                                            : 'var(--bg-glass)',
                                                                        border: `1px solid ${selectedLinks[s.id]
                                                                            ? 'rgba(34, 197, 94, 0.3)'
                                                                            : 'transparent'}`,
                                                                        transition: 'all 0.2s ease',
                                                                        cursor: 'pointer',
                                                                    }}
                                                                    onClick={(e) => { e.stopPropagation(); toggleLink(s.id); }}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!selectedLinks[s.id]}
                                                                        onChange={() => toggleLink(s.id)}
                                                                        onClick={e => e.stopPropagation()}
                                                                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                                                                    />
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                                            <span className="text-sm" style={{
                                                                                fontWeight: 600,
                                                                                color: 'var(--accent-primary)',
                                                                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                                                padding: '2px 8px',
                                                                                borderRadius: 'var(--radius-sm)',
                                                                            }}>
                                                                                &quot;{s.anchorText}&quot;
                                                                            </span>
                                                                            <span className="text-sm text-muted">→</span>
                                                                            <span className="text-sm" style={{ fontWeight: 500 }}>
                                                                                {s.targetTitle}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                                                                            {s.targetUrl}
                                                                        </div>
                                                                    </div>
                                                                    <Badge variant={
                                                                        s.relevanceScore >= 0.8 ? 'success' :
                                                                            s.relevanceScore >= 0.6 ? 'warning' : 'neutral'
                                                                    }>
                                                                        {Math.round(s.relevanceScore * 100)}%
                                                                    </Badge>
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ===== BUILDER TAB ===== */}
                {activeTab === 'builder' && (
                    <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                            {builderSelected.size > 0 && <button className="btn btn-success btn-sm" onClick={injectSelected} disabled={builderInjecting}>{builderInjecting ? 'Injecting...' : `Inject ${builderSelected.size} Links`}</button>}
                            <button className="btn btn-primary btn-sm" onClick={findOpportunities} disabled={!builderSiteId || finding}>{finding ? <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Finding...</> : '🔍 Find Opportunities'}</button>
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                            <select className="form-select" value={builderSiteId} onChange={e => setBuilderSiteId(e.target.value)} style={{ maxWidth: 280 }}>
                                <option value="">Select site...</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            {opportunities.length > 0 && <span className="text-sm text-muted">{opportunities.length} opportunities · {orphans.length} orphan pages</span>}
                        </div>

                        <div className="tabs" style={{ marginBottom: 12 }}>
                            <button className={`tab ${builderSubTab === 'opportunities' ? 'active' : ''}`} onClick={() => setBuilderSubTab('opportunities')}>Opportunities ({opportunities.length})</button>
                            <button className={`tab ${builderSubTab === 'orphans' ? 'active' : ''}`} onClick={() => setBuilderSubTab('orphans')}>Orphan Pages ({orphans.length})</button>
                        </div>

                        <div className="card">
                            {builderLoading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                                : builderSubTab === 'orphans' ? (
                                    orphans.length === 0 ? <EmptyState icon="🎉" title="No Orphan Pages" description="All published posts have at least one inbound internal link" />
                                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: 6, marginBottom: 8 }}>
                                                <span className="text-sm" style={{ color: '#92400e' }}>⚠️ These pages have no inbound internal links — add them to topic clusters or link from related posts</span>
                                            </div>
                                            {orphans.map(o => (
                                                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                                    <div><div style={{ fontWeight: 600 }}>{o.title}</div><div className="text-sm text-muted">/{o.slug}/</div></div>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <span className="font-mono text-sm">{o.overall_score}/100</span>
                                                        <a href={`/optimize?post_id=${o.id}`} className="btn btn-sm">Optimize →</a>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                ) : opportunities.length === 0 ? (
                                    <EmptyState icon="🔗" title="No Opportunities" description="Select a site and click Find Opportunities to discover internal linking gaps" />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {builderSelected.size > 0 && (
                                            <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                                                <span className="text-sm">{builderSelected.size} selected for injection</span>
                                                <button className="btn btn-sm" onClick={() => setBuilderSelected(new Set())}>Clear</button>
                                            </div>
                                        )}
                                        {opportunities.map(opp => (
                                            <div key={opp.id} className="card" style={{ padding: 12, borderLeft: `3px solid ${relevanceColor(opp.relevance)}`, opacity: opp.status === 'injected' ? 0.6 : 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                    <input type="checkbox" checked={builderSelected.has(opp.id)} disabled={opp.status === 'injected'} onChange={() => {
                                                        setBuilderSelected(prev => { const n = new Set(prev); n.has(opp.id) ? n.delete(opp.id) : n.add(opp.id); return n; });
                                                    }} style={{ marginTop: 3 }} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                                            <span className="text-sm text-muted">From: <strong>{opp.from_title.substring(0, 40)}</strong></span>
                                                            <span className="text-sm">→</span>
                                                            <span className="text-sm text-muted">To: <strong>{opp.to_title.substring(0, 40)}</strong></span>
                                                        </div>
                                                        <div style={{ marginBottom: 4 }}>
                                                            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>&quot;{opp.anchor_text}&quot;</span>
                                                            <span style={{ fontSize: '0.75rem', marginLeft: 8, color: relevanceColor(opp.relevance) }}>{Math.round(opp.relevance * 100)}% relevance</span>
                                                        </div>
                                                        <div className="text-sm text-muted" style={{ fontStyle: 'italic' }}>Context: &quot;...{opp.insertion_context.substring(0, 100)}...&quot;</div>
                                                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>💡 {opp.reason}</div>
                                                    </div>
                                                    {opp.status === 'injected' && <Badge variant="success">Injected</Badge>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            }
                        </div>
                    </>
                )}

                {/* ===== AUTO-INJECT TAB ===== */}
                {activeTab === 'auto-inject' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div />
                            {pendingCount > 0 && <Badge variant="warning">{pendingCount} pending</Badge>}
                        </div>

                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <input className="form-input" value={injectorSiteId} onChange={e => setInjectorSiteId(e.target.value)} placeholder="Site ID (UUID from Sites page)" style={{ flex: 1, minWidth: 200 }} />
                                <button className="btn btn-primary" onClick={scanForOpportunities} disabled={scanning || !injectorSiteId}>
                                    {scanning ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Scanning...</> : '🔗 Scan for Opportunities'}
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                            {['pending', 'injected', 'dismissed', 'all'].map(s => (
                                <button key={s} className={`btn btn-sm ${injectorFilter === s ? 'btn-primary' : ''}`} onClick={() => setInjectorFilter(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
                            ))}
                        </div>

                        {injectorOpportunities.length === 0 ? (
                            <EmptyState icon="🔗" title="No opportunities found" description="Enter your site ID and scan to find internal link opportunities" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {injectorOpportunities.map((opp, i) => (
                                    <div key={i} className="card" style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                    <Badge variant={STATUS_VARIANT[opp.status]}>{opp.status}</Badge>
                                                    <span style={{ fontWeight: 700, color: '#16a34a' }}>Score: {(opp.relevance_score * 100).toFixed(0)}%</span>
                                                </div>
                                                <div className="text-sm" style={{ marginBottom: 4 }}>
                                                    <strong>{opp.from_post_title}</strong>
                                                    <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>→</span>
                                                    <strong>{opp.to_post_title}</strong>
                                                </div>
                                                <div style={{ padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 4, display: 'inline-block' }}>
                                                    <span className="text-sm">Anchor: </span>
                                                    <strong className="text-sm">&quot;{opp.anchor_text}&quot;</strong>
                                                </div>
                                                <div className="text-sm text-muted">{opp.reason}</div>
                                                {opp.context_hint && <div className="text-sm text-muted">📍 {opp.context_hint}</div>}
                                            </div>
                                            {opp.status === 'pending' && (
                                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                    <button className="btn btn-sm btn-primary" onClick={() => injectSingle(opp.id)} disabled={injecting === opp.id}>
                                                        {injecting === opp.id ? '...' : '⚡ Inject'}
                                                    </button>
                                                    <button className="btn btn-sm" onClick={() => dismissOpportunity(opp.id)}>✕</button>
                                                </div>
                                            )}
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
