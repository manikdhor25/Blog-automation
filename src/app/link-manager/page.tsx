'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import DataTable from '@/components/DataTable';

// === Interfaces for Manager tab (original link-manager) ===
interface CloakedLink {
    id: string;
    slug: string;
    destination_url: string;
    label: string;
    clicks: number;
    redirect_type: string;
    nofollow: boolean;
    sponsored: boolean;
    is_active: boolean;
    created_at: string;
    affiliate_programs?: { name: string; network: string };
}

// === Interfaces for Auto-Replace tab (from link-replacer) ===
interface SiteResult { post_id: string; post_title: string; raw_count: number; links: Array<{ url: string; count: number }>; }
interface RawLink { url: string; count: number; already_cloaked: boolean; existing_slug: string | null; suggested_slug: string; }
interface PostScan { post_id: string; post_title: string; raw_links: RawLink[]; total: number; uncloaked: number; }

// === Interfaces for Placement tab (from link-placement) ===
interface PlacementResult {
    url: string;
    title: string;
    word_count: number;
    current_links: number;
    optimal_link_count: number;
    placements: Array<{
        position: 'intro' | 'body' | 'conclusion' | 'cta_block';
        paragraph_index: number;
        anchor_text: string;
        context_snippet: string;
        ctr_boost_pct: number;
        reasoning: string;
        priority: 'high' | 'medium' | 'low';
    }>;
    missed_opportunities: string[];
    over_linked_sections: string[];
    revenue_impact_estimate: string;
}

const PRIORITY_VARIANT: Record<string, 'success' | 'warning' | 'info'> = { high: 'success', medium: 'warning', low: 'info' };
const POSITION_ICON: Record<string, string> = { intro: '🎯', body: '📄', conclusion: '✅', cta_block: '💰' };
const BASE = typeof window !== 'undefined' ? window.location.origin : '';

export default function LinkManagerPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('manager');

    // === Manager tab state ===
    const [links, setLinks] = useState<CloakedLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editLink, setEditLink] = useState<CloakedLink | null>(null);
    const [form, setForm] = useState({
        slug: '', destination_url: '', label: '', redirect_type: 'permanent',
        nofollow: true, sponsored: true, notes: '',
    });

    // === Auto-Replace tab state ===
    const [replacerSites, setReplacerSites] = useState<Array<{ id: string; name: string }>>([]);
    const [replacerSiteId, setReplacerSiteId] = useState('');
    const [siteResults, setSiteResults] = useState<SiteResult[]>([]);
    const [selectedPost, setSelectedPost] = useState<PostScan | null>(null);
    const [slugMap, setSlugMap] = useState<Record<string, string>>({});
    const [scanningReplacer, setScanningReplacer] = useState(false);
    const [replacing, setReplacing] = useState(false);
    const [replacerSelected, setReplacerSelected] = useState<Set<string>>(new Set());

    // === Placement tab state ===
    const [placementUrl, setPlacementUrl] = useState('');
    const [placementContent, setPlacementContent] = useState('');
    const [affiliateProduct, setAffiliateProduct] = useState('');
    const [affiliateUrl, setAffiliateUrl] = useState('');
    const [placementResult, setPlacementResult] = useState<PlacementResult | null>(null);
    const [analyzingPlacement, setAnalyzingPlacement] = useState(false);

    // === Manager tab: load links ===
    useEffect(() => { fetchLinks(); }, []);

    // === Auto-Replace tab: load sites ===
    useEffect(() => { fetch('/api/link-replacer').then(r => r.json()).then(d => setReplacerSites(d.sites || [])); }, []);

    // =============================================
    // MANAGER TAB FUNCTIONS
    // =============================================
    const fetchLinks = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/link-cloak');
            const data = await res.json();
            setLinks(data.links || []);
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    const totalClicks = links.reduce((s, l) => s + (l.clicks || 0), 0);
    const activeLinks = links.filter(l => l.is_active).length;

    const handleSubmit = async () => {
        if (!form.slug || !form.destination_url) {
            toast.warning('Slug and destination URL required');
            return;
        }
        try {
            const method = editLink ? 'PATCH' : 'POST';
            const body = editLink ? { ...form, id: editLink.id } : form;
            const res = await fetch('/api/link-cloak', {
                method, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Failed'); return; }
            toast.success(editLink ? 'Link updated' : 'Link created');
            setShowForm(false);
            setEditLink(null);
            setForm({ slug: '', destination_url: '', label: '', redirect_type: 'permanent', nofollow: true, sponsored: true, notes: '' });
            fetchLinks();
        } catch { toast.error('Failed to save link'); }
    };

    const toggleActive = async (link: CloakedLink) => {
        await fetch('/api/link-cloak', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: link.id, is_active: !link.is_active }),
        });
        fetchLinks();
    };

    const deleteLink = async (id: string) => {
        if (!confirm('Delete this cloaked link? Existing /go/ URLs will stop working.')) return;
        await fetch(`/api/link-cloak?id=${id}`, { method: 'DELETE' });
        toast.success('Link deleted');
        fetchLinks();
    };

    const copySlug = (slug: string) => {
        navigator.clipboard.writeText(`${BASE}/go/${slug}`);
        toast.success('Copied to clipboard');
    };

    const openEdit = (link: CloakedLink) => {
        setEditLink(link);
        setForm({
            slug: link.slug, destination_url: link.destination_url, label: link.label || '',
            redirect_type: link.redirect_type, nofollow: link.nofollow, sponsored: link.sponsored, notes: '',
        });
        setShowForm(true);
    };

    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // =============================================
    // AUTO-REPLACE TAB FUNCTIONS
    // =============================================
    const scanSite = async () => {
        if (!replacerSiteId) { toast.warning('Select a site'); return; }
        setScanningReplacer(true);
        const res = await fetch('/api/link-replacer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan_site', site_id: replacerSiteId }) });
        const data = await res.json();
        setSiteResults(data.posts || []);
        toast.success(`Found ${data.total_raw_links} raw affiliate links in ${data.posts_with_raw_links} posts`);
        setScanningReplacer(false);
    };

    const scanPost = async (postId: string) => {
        const res = await fetch('/api/link-replacer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan_post', post_id: postId }) });
        const data = await res.json();
        setSelectedPost(data);
        const initialSlugs: Record<string, string> = {};
        (data.raw_links || []).forEach((l: RawLink) => { initialSlugs[l.url] = l.existing_slug || l.suggested_slug || ''; });
        setSlugMap(initialSlugs);
        setReplacerSelected(new Set((data.raw_links || []).filter((l: RawLink) => !l.already_cloaked).map((l: RawLink) => l.url)));
    };

    const replaceSelectedLinks = async () => {
        if (!selectedPost || replacerSelected.size === 0) { toast.warning('Select links to replace'); return; }
        setReplacing(true);
        const replacements = [...replacerSelected].map(url => ({
            post_id: selectedPost.post_id,
            original_url: url,
            cloaked_slug: slugMap[url] || `aff-${Date.now().toString(36)}`,
        }));

        const res = await fetch('/api/link-replacer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'replace', replacements }) });
        const data = await res.json();
        toast.success(`Replaced ${data.replaced} links`);
        setSelectedPost(null);
        scanSite();
        setReplacing(false);
    };

    const toggleReplacerSelect = (url: string) => {
        setReplacerSelected(prev => {
            const n = new Set(prev);
            n.has(url) ? n.delete(url) : n.add(url);
            return n;
        });
    };

    // =============================================
    // PLACEMENT TAB FUNCTIONS
    // =============================================
    const analyzePlacement = async () => {
        if (!placementContent && !placementUrl) { toast.warning('Enter content or URL'); return; }
        if (!affiliateProduct) { toast.warning('Enter affiliate product name'); return; }
        setAnalyzingPlacement(true);
        const res = await fetch('/api/link-placement', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: placementUrl || undefined, content: placementContent || undefined, affiliate_product: affiliateProduct, affiliate_url: affiliateUrl || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setAnalyzingPlacement(false); return; }
        setPlacementResult(data.result);
        toast.success(`Found ${data.result.placements.length} placement opportunities`);
        setAnalyzingPlacement(false);
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Link Manager</h1>
                        <p className="page-description">Cloak, replace, and optimize affiliate link placement across your content</p>
                    </div>
                    {activeTab === 'manager' && (
                        <button className="btn btn-primary" onClick={() => { setEditLink(null); setShowForm(true); }}>
                            + Cloak Link
                        </button>
                    )}
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'manager' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('manager')}>🔗 Manager</button>
                    <button className={`btn ${activeTab === 'auto-replace' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('auto-replace')}>🔄 Auto-Replace</button>
                    <button className={`btn ${activeTab === 'placement' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('placement')}>🎯 Placement</button>
                </div>

                {/* ===== MANAGER TAB ===== */}
                {activeTab === 'manager' && (
                    <>
                        {/* Stats */}
                        <div className="grid-4" style={{ gap: 16, marginBottom: 24 }}>
                            {[
                                { label: 'Total Links', value: links.length, icon: '🔗' },
                                { label: 'Active', value: activeLinks, icon: '✅' },
                                { label: 'Total Clicks', value: totalClicks.toLocaleString(), icon: '👆' },
                                { label: 'Avg Clicks/Link', value: links.length ? Math.round(totalClicks / links.length) : 0, icon: '📊' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                                    <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                                    <div className="text-sm text-muted">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Form */}
                        {showForm && (
                            <div className="card animate-in" style={{ marginBottom: 16 }}>
                                <div className="card-header">
                                    <h3 className="card-title">{editLink ? 'Edit Cloaked Link' : 'Create Cloaked Link'}</h3>
                                    <button className="btn btn-sm" onClick={() => { setShowForm(false); setEditLink(null); }}>✕</button>
                                </div>
                                <div className="grid-2" style={{ gap: 16 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Slug <span className="text-muted text-sm">(yoursite.com/go/<b>slug</b>)</span></label>
                                        <input className="form-input" placeholder="best-protein-powder"
                                            value={form.slug}
                                            onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Label</label>
                                        <input className="form-input" placeholder="Amazon - Best Protein Powder"
                                            value={form.label}
                                            onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                        <label className="form-label">Destination URL (Affiliate Link)</label>
                                        <input className="form-input" placeholder="https://amazon.com/dp/B000XXX?tag=your-tag-20"
                                            value={form.destination_url}
                                            onChange={e => setForm(f => ({ ...f, destination_url: e.target.value }))} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Redirect Type</label>
                                        <select className="form-select" value={form.redirect_type}
                                            onChange={e => setForm(f => ({ ...f, redirect_type: e.target.value }))}>
                                            <option value="permanent">301 Permanent</option>
                                            <option value="temporary">302 Temporary</option>
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Link Attributes</label>
                                        <div style={{ display: 'flex', gap: 16, paddingTop: 8 }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                                <input type="checkbox" checked={form.nofollow}
                                                    onChange={e => setForm(f => ({ ...f, nofollow: e.target.checked }))} />
                                                <span className="text-sm">nofollow</span>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                                <input type="checkbox" checked={form.sponsored}
                                                    onChange={e => setForm(f => ({ ...f, sponsored: e.target.checked }))} />
                                                <span className="text-sm">sponsored</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                    <button className="btn btn-primary" onClick={handleSubmit}>
                                        {editLink ? 'Update Link' : 'Create Link'}
                                    </button>
                                    <button className="btn btn-sm" onClick={() => { setShowForm(false); setEditLink(null); }}>Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* Table */}
                        <div className="card">
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                                    <p className="text-sm text-muted">Loading links...</p>
                                </div>
                            ) : links.length === 0 ? (
                                <EmptyState icon="🔗" title="No Cloaked Links"
                                    description="Create your first cloaked link to hide affiliate URLs and track clicks" />
                            ) : (
                                <DataTable
                                    data={links as unknown as Record<string, unknown>[]}
                                    searchKeys={['slug', 'label', 'destination_url']}
                                    pageSize={20}
                                    columns={[
                                        {
                                            key: 'slug', label: 'Short URL', render: (r) => (
                                                <div>
                                                    <code style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>/go/{String(r.slug)}</code>
                                                    <button className="btn btn-sm" style={{ marginLeft: 8, padding: '2px 6px', fontSize: '0.7rem' }}
                                                        onClick={() => copySlug(String(r.slug))}>Copy</button>
                                                </div>
                                            )
                                        },
                                        { key: 'label', label: 'Label', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.label || r.slug)}</span> },
                                        {
                                            key: 'destination_url', label: 'Destination', render: (r) => (
                                                <span className="text-sm text-muted" style={{ maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {String(r.destination_url)}
                                                </span>
                                            )
                                        },
                                        { key: 'clicks', label: 'Clicks', render: (r) => <span className="font-mono" style={{ fontWeight: 600 }}>{Number(r.clicks).toLocaleString()}</span> },
                                        {
                                            key: 'redirect_type', label: 'Type', render: (r) => (
                                                <Badge variant={String(r.redirect_type) === 'permanent' ? 'success' : 'info'}>
                                                    {String(r.redirect_type) === 'permanent' ? '301' : '302'}
                                                </Badge>
                                            )
                                        },
                                        {
                                            key: 'is_active', label: 'Status', render: (r) => (
                                                <Badge variant={r.is_active ? 'success' : 'warning'}>
                                                    {r.is_active ? 'Active' : 'Paused'}
                                                </Badge>
                                            )
                                        },
                                        {
                                            key: 'actions', label: '', render: (r) => (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-sm" onClick={() => openEdit(r as unknown as CloakedLink)}>Edit</button>
                                                    <button className="btn btn-sm" onClick={() => toggleActive(r as unknown as CloakedLink)}>
                                                        {r.is_active ? 'Pause' : 'Activate'}
                                                    </button>
                                                    <button className="btn btn-sm btn-danger" onClick={() => deleteLink(String(r.id))}>Del</button>
                                                </div>
                                            )
                                        },
                                    ]}
                                />
                            )}
                        </div>
                    </>
                )}

                {/* ===== AUTO-REPLACE TAB ===== */}
                {activeTab === 'auto-replace' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                                <div className="form-group" style={{ margin: 0, flex: '0 1 300px' }}>
                                    <label className="form-label">Site to Scan</label>
                                    <select className="form-select" value={replacerSiteId} onChange={e => setReplacerSiteId(e.target.value)}>
                                        <option value="">Select site...</option>
                                        {replacerSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <button className="btn btn-primary" onClick={scanSite} disabled={!replacerSiteId || scanningReplacer}>
                                    {scanningReplacer ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Scanning...</> : '🔍 Scan for Raw Links'}
                                </button>
                            </div>
                        </div>

                        {selectedPost && (
                            <div className="card animate-in" style={{ marginBottom: 16 }}>
                                <div className="card-header">
                                    <h3 className="card-title">Post: {selectedPost.post_title.substring(0, 60)}</h3>
                                    <button className="btn btn-sm" onClick={() => setSelectedPost(null)}>✕</button>
                                </div>
                                <div className="text-sm text-muted" style={{ marginBottom: 12 }}>{selectedPost.uncloaked} uncloaked links of {selectedPost.total} total</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                                    {selectedPost.raw_links.map(link => (
                                        <div key={link.url} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', background: link.already_cloaked ? '#f0fdf4' : 'var(--bg-secondary)', borderRadius: 6 }}>
                                            <input type="checkbox" checked={replacerSelected.has(link.url)} disabled={link.already_cloaked} onChange={() => toggleReplacerSelect(link.url)} />
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div className="text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.url}</div>
                                                <div className="text-sm text-muted">{link.count}x occurrence{link.count > 1 ? 's' : ''}</div>
                                            </div>
                                            {link.already_cloaked ? (
                                                <Badge variant="success">Already cloaked: /go/{link.existing_slug}</Badge>
                                            ) : (
                                                <input className="form-input" style={{ width: 180, padding: '4px 8px', fontSize: '0.8rem' }} placeholder="slug" value={slugMap[link.url] || ''} onChange={e => setSlugMap(m => ({ ...m, [link.url]: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button className="btn btn-success" onClick={replaceSelectedLinks} disabled={replacing || replacerSelected.size === 0}>
                                    {replacing ? 'Replacing...' : `Replace ${replacerSelected.size} Selected Link${replacerSelected.size !== 1 ? 's' : ''}`}
                                </button>
                            </div>
                        )}

                        <div className="card">
                            {siteResults.length === 0 && !scanningReplacer ? (
                                <EmptyState icon="🔗" title="No Scan Results" description="Select a site and click Scan to find raw affiliate links" />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {siteResults.map(r => (
                                        <div key={r.post_id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{r.post_title.substring(0, 60)}</div>
                                                <div className="text-sm text-muted">{r.raw_count} raw affiliate link{r.raw_count !== 1 ? 's' : ''}</div>
                                            </div>
                                            <button className="btn btn-sm btn-primary" onClick={() => scanPost(r.post_id)}>Review & Replace →</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ===== PLACEMENT TAB ===== */}
                {activeTab === 'placement' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Affiliate Product *</label>
                                    <input className="form-input" value={affiliateProduct} onChange={e => setAffiliateProduct(e.target.value)} placeholder="e.g. Bluehost hosting" />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Affiliate URL</label>
                                    <input className="form-input" value={affiliateUrl} onChange={e => setAffiliateUrl(e.target.value)} placeholder="https://affiliate.link/..." />
                                </div>
                                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                    <label className="form-label">Post URL <span className="text-muted text-sm">(or paste content below)</span></label>
                                    <input className="form-input" value={placementUrl} onChange={e => setPlacementUrl(e.target.value)} placeholder="https://yourblog.com/post-slug" />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Post Content <span className="text-muted text-sm">(paste if no URL)</span></label>
                                <textarea className="form-input" rows={6} value={placementContent} onChange={e => setPlacementContent(e.target.value)} placeholder="Paste your full post content here..." style={{ fontFamily: 'inherit' }} />
                            </div>
                            <button className="btn btn-primary" onClick={analyzePlacement} disabled={analyzingPlacement}>
                                {analyzingPlacement ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Analyzing...</> : '🎯 Find Best Placements'}
                            </button>
                        </div>

                        {placementResult && (
                            <>
                                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                                    {[
                                        { label: 'Current Links', value: placementResult.current_links, icon: '🔗' },
                                        { label: 'Optimal Links', value: placementResult.optimal_link_count, icon: '✅' },
                                        { label: 'Opportunities', value: placementResult.placements.length, icon: '🎯' },
                                        { label: 'Revenue Impact', value: placementResult.revenue_impact_estimate, icon: '💰' },
                                    ].map((s, i) => (
                                        <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.value}</div>
                                            <div className="text-sm text-muted">{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="card" style={{ marginBottom: 16 }}>
                                    <h3 className="card-title" style={{ marginBottom: 12 }}>Placement Recommendations</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {placementResult.placements.map((p, i) => (
                                            <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8, borderLeft: `3px solid ${p.priority === 'high' ? '#16a34a' : p.priority === 'medium' ? '#d97706' : '#6b7280'}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <span>{POSITION_ICON[p.position]}</span>
                                                        <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{p.position.replace('_', ' ')}</span>
                                                        <Badge variant={PRIORITY_VARIANT[p.priority]}>{p.priority}</Badge>
                                                        <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>+{p.ctr_boost_pct}% CTR</span>
                                                    </div>
                                                    <span className="text-sm text-muted">Para #{p.paragraph_index}</span>
                                                </div>
                                                <div className="text-sm" style={{ marginBottom: 4 }}>
                                                    Anchor: <strong>&quot;{p.anchor_text}&quot;</strong>
                                                </div>
                                                <div className="text-sm text-muted" style={{ fontStyle: 'italic', marginBottom: 4 }}>...{p.context_snippet}...</div>
                                                <div className="text-sm text-muted">💡 {p.reasoning}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {(placementResult.missed_opportunities.length > 0 || placementResult.over_linked_sections.length > 0) && (
                                    <div className="card">
                                        <h3 className="card-title" style={{ marginBottom: 12 }}>Action Items</h3>
                                        {placementResult.missed_opportunities.length > 0 && (
                                            <div style={{ marginBottom: 10 }}>
                                                <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: 6 }}>💡 Missed Opportunities</div>
                                                {placementResult.missed_opportunities.map((m, i) => <div key={i} className="text-sm text-muted">• {m}</div>)}
                                            </div>
                                        )}
                                        {placementResult.over_linked_sections.length > 0 && (
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>⚠️ Over-Linked Sections</div>
                                                {placementResult.over_linked_sections.map((s, i) => <div key={i} className="text-sm text-muted">• {s}</div>)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
