'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

// Content Duplicates types
interface DupeResult { id: string; post_a_id: string; post_a_title: string; post_a_slug?: string; post_b_id: string; post_b_title: string; post_b_slug?: string; similarity_score: number; title_similarity: number; keyword_similarity: number; content_similarity: number; recommendation: string; ai_recommendation?: { action: string; reason: string; which_to_keep: string; differentiation_angle: string }; status: string; }

// Title Duplicates types (from /duplicate-titles)
interface DuplicateGroup { type: string; similarity: number; posts: Array<{ id: string; title: string; meta_title: string; slug: string; score: number }>; }
interface TitleSummary { total_posts: number; near_duplicate_pairs: number; exact_duplicate_groups: number; affected_posts: number; }

// Cannibalization types (from /cannibalization)
interface ConflictPost { postId: string; title: string; slug: string; score: number; status: string; }
interface Conflict { keyword: string; severity: 'high' | 'medium' | 'low'; type: 'exact' | 'partial'; posts: ConflictPost[]; recommendation: string; searchVolume?: number; difficulty?: number; }
interface CannSite { id: string; name: string; url: string; }

const REC_COLOR: Record<string, string> = { merge: '#dc2626', consolidate: '#ea580c', differentiate: '#d97706', keep_both: '#16a34a' };

export default function DuplicateScannerPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('main');

    // Content Duplicates state
    const [results, setResults] = useState<DupeResult[]>([]);
    const [siteId, setSiteId] = useState('');
    const [threshold, setThreshold] = useState('0.75');
    const [scanning, setScanning] = useState(false);
    const [scanStats, setScanStats] = useState<{ scanned: number; found: number } | null>(null);

    // Title Duplicates state
    const [dtSites, setDtSites] = useState<Array<{ id: string; name: string }>>([]);
    const [dtSiteId, setDtSiteId] = useState('');
    const [dtGroups, setDtGroups] = useState<DuplicateGroup[]>([]);
    const [dtSummary, setDtSummary] = useState<TitleSummary | null>(null);
    const [dtThreshold, setDtThreshold] = useState(0.85);
    const [dtLoading, setDtLoading] = useState(false);

    // Cannibalization state
    const [cannSites, setCannSites] = useState<CannSite[]>([]);
    const [cannSelectedSite, setCannSelectedSite] = useState('');
    const [cannConflicts, setCannConflicts] = useState<Conflict[]>([]);
    const [cannSummary, setCannSummary] = useState({ total: 0, high: 0, medium: 0, low: 0 });
    const [cannLoading, setCannLoading] = useState(false);
    const [cannExpandedIdx, setCannExpandedIdx] = useState<number | null>(null);

    useEffect(() => { if (siteId) loadResults(); }, [siteId]);
    useEffect(() => {
        fetch('/api/sites').then(r => r.json()).then(d => {
            setDtSites(d.sites || []);
            setCannSites(d.sites || []);
        });
    }, []);

    // Content Duplicates functions
    const loadResults = async () => {
        const res = await fetch(`/api/duplicate-scanner?site_id=${siteId}`);
        const data = await res.json();
        setResults(data.results || []);
    };

    const scan = async () => {
        if (!siteId) { toast.warning('Enter site ID'); return; }
        setScanning(true);
        const res = await fetch('/api/duplicate-scanner', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scan', site_id: siteId, threshold: parseFloat(threshold) }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setScanning(false); return; }
        setScanStats({ scanned: data.scanned, found: data.found });
        toast.success(`Scanned ${data.scanned} posts, found ${data.found} duplicate pairs`);
        loadResults();
        setScanning(false);
    };

    const resolve = async (id: string, status: string) => {
        await fetch('/api/duplicate-scanner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve', result_id: id, status }) });
        toast.success('Marked as resolved');
        loadResults();
    };

    const simColor = (s: number) => s >= 0.9 ? '#dc2626' : s >= 0.8 ? '#ea580c' : '#d97706';

    // Title Duplicates functions
    const dtScan = async () => {
        setDtLoading(true);
        const res = await fetch(`/api/duplicate-titles?threshold=${dtThreshold}${dtSiteId ? `&site_id=${dtSiteId}` : ''}`);
        const data = await res.json();
        setDtGroups(data.duplicate_groups || []);
        setDtSummary(data.summary || null);
        toast.success(`Scanned ${data.summary?.total_posts || 0} posts — ${data.summary?.near_duplicate_pairs || 0} duplicate pairs found`);
        setDtLoading(false);
    };

    // Cannibalization functions
    const handleCannScan = async () => {
        if (!cannSelectedSite) { toast.warning('Select a site first'); return; }
        setCannLoading(true);
        try {
            const res = await fetch(`/api/cannibalization?site_id=${cannSelectedSite}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setCannConflicts(data.conflicts || []);
            setCannSummary(data.summary || { total: 0, high: 0, medium: 0, low: 0 });
            if (data.conflicts.length === 0) {
                toast.success('No cannibalization detected! Your keywords are well-targeted.');
            } else {
                toast.warning(`Found ${data.conflicts.length} cannibalization issue(s)`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Scan failed');
        } finally {
            setCannLoading(false);
        }
    };

    const severityColor = (s: string) => s === 'high' ? 'danger' as const : s === 'medium' ? 'warning' as const : 'info' as const;
    const severityIcon = (s: string) => s === 'high' ? '🔴' : s === 'medium' ? '🟡' : '🟢';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Duplicate Content Scanner</h1>
                        <p className="page-description">Find near-duplicate posts on your site — keyword cannibalization + AI merge recommendations</p>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>🔍 Content Duplicates</button>
                    <button className={`btn ${activeTab === 'title-duplicates' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('title-duplicates')}>📝 Title Duplicates</button>
                    <button className={`btn ${activeTab === 'cannibalization' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('cannibalization')}>🎯 Cannibalization</button>
                </div>

                {activeTab === 'main' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <input className="form-input" value={siteId} onChange={e => setSiteId(e.target.value)} placeholder="Site ID (UUID from Sites page)" style={{ flex: 1, minWidth: 200 }} />
                                <select className="form-input" value={threshold} onChange={e => setThreshold(e.target.value)} style={{ width: 'auto' }}>
                                    <option value="0.65">Low sensitivity (65%)</option>
                                    <option value="0.75">Medium (75%)</option>
                                    <option value="0.85">High sensitivity (85%)</option>
                                </select>
                                <button className="btn btn-primary" onClick={scan} disabled={scanning || !siteId}>
                                    {scanning ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Scanning...</> : '🔍 Scan for Duplicates'}
                                </button>
                            </div>
                            {scanStats && (
                                <div className="text-sm text-muted" style={{ marginTop: 8 }}>
                                    Scanned {scanStats.scanned} posts → found <strong>{scanStats.found}</strong> duplicate pairs
                                </div>
                            )}
                        </div>

                        {results.length === 0 ? (
                            <EmptyState icon="🔍" title="No duplicates found" description="Enter site ID and scan to find near-duplicate posts that could hurt your SEO" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {results.filter(r => r.status === 'pending').concat(results.filter(r => r.status !== 'pending')).map((r, i) => (
                                    <div key={i} className="card" style={{ padding: '14px', opacity: r.status !== 'pending' ? 0.6 : 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                                    <span style={{ fontSize: '1.3rem', fontWeight: 900, color: simColor(r.similarity_score) }}>{(r.similarity_score * 100).toFixed(0)}%</span>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: REC_COLOR[r.recommendation], border: `1px solid ${REC_COLOR[r.recommendation]}`, padding: '1px 8px', borderRadius: 10 }}>{r.recommendation}</span>
                                                    {r.status !== 'pending' && <Badge variant="neutral">{r.status}</Badge>}
                                                </div>
                                                <div className="grid-2" style={{ gap: 8, marginBottom: 8 }}>
                                                    <div style={{ padding: '6px 10px', background: '#eff6ff', borderRadius: 4 }}>
                                                        <div style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700 }}>POST A</div>
                                                        <div className="text-sm" style={{ fontWeight: 600 }}>{r.post_a_title}</div>
                                                    </div>
                                                    <div style={{ padding: '6px 10px', background: '#faf5ff', borderRadius: 4 }}>
                                                        <div style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 700 }}>POST B</div>
                                                        <div className="text-sm" style={{ fontWeight: 600 }}>{r.post_b_title}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 16 }}>
                                                    <span className="text-sm text-muted">Title: <strong>{(r.title_similarity * 100).toFixed(0)}%</strong></span>
                                                    <span className="text-sm text-muted">Keyword: <strong>{(r.keyword_similarity * 100).toFixed(0)}%</strong></span>
                                                    <span className="text-sm text-muted">Content: <strong>{(r.content_similarity * 100).toFixed(0)}%</strong></span>
                                                </div>
                                            </div>
                                        </div>

                                        {r.ai_recommendation && (
                                            <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 10 }}>
                                                <div style={{ fontWeight: 600, marginBottom: 4 }}>🤖 AI: {r.ai_recommendation.action.replace(/_/g, ' ')}</div>
                                                <div className="text-sm text-muted">{r.ai_recommendation.reason}</div>
                                                {r.ai_recommendation.differentiation_angle && <div className="text-sm" style={{ marginTop: 4 }}>💡 {r.ai_recommendation.differentiation_angle}</div>}
                                            </div>
                                        )}

                                        {r.status === 'pending' && (
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-sm" onClick={() => resolve(r.id, 'merged')}>✅ Merged</button>
                                                <button className="btn btn-sm" onClick={() => resolve(r.id, 'differentiated')}>✏️ Differentiated</button>
                                                <button className="btn btn-sm" onClick={() => resolve(r.id, 'kept_both')}>👍 Keep Both</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'title-duplicates' && (
                    <>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Site</label>
                                <select className="form-select" value={dtSiteId} onChange={e => setDtSiteId(e.target.value)} style={{ minWidth: 200 }}>
                                    <option value="">All sites</option>
                                    {dtSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Similarity Threshold ({Math.round(dtThreshold * 100)}%)</label>
                                <input type="range" min="0.6" max="1" step="0.05" value={dtThreshold} onChange={e => setDtThreshold(parseFloat(e.target.value))} style={{ width: 150 }} />
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={dtScan} disabled={dtLoading}>{dtLoading ? 'Scanning...' : '🔍 Scan Titles'}</button>
                        </div>

                        {dtSummary && (
                            <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                                {[{ label: 'Posts Scanned', value: dtSummary.total_posts, icon: '📄' }, { label: 'Duplicate Pairs', value: dtSummary.near_duplicate_pairs, icon: '🔁', color: dtSummary.near_duplicate_pairs > 0 ? '#dc2626' : '#16a34a' }, { label: 'Exact Duplicates', value: dtSummary.exact_duplicate_groups, icon: '⚠️', color: dtSummary.exact_duplicate_groups > 0 ? '#dc2626' : '#16a34a' }, { label: 'Affected Posts', value: dtSummary.affected_posts, icon: '📝' }].map((s, i) => (
                                    <div key={i} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                                        <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color || 'var(--text-primary)' }}>{s.value}</div>
                                        <div className="text-sm text-muted">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="card">
                            {dtLoading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                                : dtGroups.length === 0 ? <EmptyState icon="✅" title={dtSummary ? 'No Duplicates Found' : 'Click Scan to Check'} description={dtSummary ? 'All post titles are sufficiently unique' : 'Select a site and click Scan Titles'} />
                                : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {dtGroups.map((g, i) => (
                                        <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8, borderLeft: g.similarity >= 0.95 ? '3px solid #dc2626' : '3px solid #d97706' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <Badge variant={g.similarity >= 0.95 ? 'danger' : 'warning'}>{g.type}</Badge>
                                                    <span className="text-sm text-muted">{Math.round(g.similarity * 100)}% similar</span>
                                                </div>
                                            </div>
                                            {g.posts.map((p, j) => (
                                                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: j < g.posts.length - 1 ? '1px solid var(--border-color)' : undefined }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{p.title}</div>
                                                        <div className="text-sm text-muted">/{p.slug}/ · Score: {p.score}</div>
                                                    </div>
                                                    <a href={`/optimize?post_id=${p.id}`} className="btn btn-sm">Edit →</a>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            }
                        </div>
                    </>
                )}

                {activeTab === 'cannibalization' && (
                    <>
                        {/* Controls */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="grid-3" style={{ gap: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Target Site</label>
                                    <select className="form-select" value={cannSelectedSite} onChange={e => setCannSelectedSite(e.target.value)}>
                                        <option value="">Select a site...</option>
                                        {cannSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                                    <button className="btn btn-primary" onClick={handleCannScan} disabled={cannLoading} style={{ width: '100%' }}>
                                        {cannLoading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Scanning...</> : '🔍 Scan for Cannibalization'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Summary stats */}
                        {cannSummary.total > 0 && (
                            <div className="grid-4" style={{ marginBottom: 24 }}>
                                <StatCard label="Total Issues" value={cannSummary.total} icon="⚠️" />
                                <StatCard label="High Severity" value={cannSummary.high} icon="🔴" />
                                <StatCard label="Medium" value={cannSummary.medium} icon="🟡" />
                                <StatCard label="Low" value={cannSummary.low} icon="🟢" />
                            </div>
                        )}

                        {/* Results */}
                        <div className="card">
                            {cannConflicts.length === 0 ? (
                                <EmptyState
                                    icon="🎯"
                                    title="No Cannibalization Issues"
                                    description="Select a site and scan to detect keyword conflicts between your posts."
                                />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {cannConflicts.map((conflict, i) => (
                                        <div
                                            key={i}
                                            className="card"
                                            style={{
                                                cursor: 'pointer',
                                                border: cannExpandedIdx === i ? '1px solid var(--accent-primary)' : undefined,
                                                transition: 'border 0.2s',
                                            }}
                                            onClick={() => setCannExpandedIdx(cannExpandedIdx === i ? null : i)}
                                        >
                                            {/* Conflict header */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '1.2rem' }}>{severityIcon(conflict.severity)}</span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                                                        {conflict.keyword}
                                                    </div>
                                                    <div className="text-sm text-muted">
                                                        {conflict.posts.length} posts • {conflict.type === 'exact' ? 'Exact match' : 'Partial overlap'}
                                                    </div>
                                                </div>
                                                <Badge variant={severityColor(conflict.severity)}>
                                                    {conflict.severity.toUpperCase()}
                                                </Badge>
                                                {conflict.searchVolume && (
                                                    <div className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                                                        {conflict.searchVolume.toLocaleString()} vol
                                                    </div>
                                                )}
                                                <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                                                    {cannExpandedIdx === i ? '▼' : '▶'}
                                                </span>
                                            </div>

                                            {/* Expanded details */}
                                            {cannExpandedIdx === i && (
                                                <div style={{ marginTop: 16 }}>
                                                    {/* Recommendation */}
                                                    <div style={{
                                                        padding: '10px 14px', borderRadius: 8,
                                                        background: 'rgba(99, 102, 241, 0.08)',
                                                        border: '1px solid rgba(99, 102, 241, 0.15)',
                                                        marginBottom: 16, fontSize: '0.85rem',
                                                        color: 'var(--text-secondary)',
                                                    }}>
                                                        💡 <strong>Recommendation:</strong> {conflict.recommendation}
                                                    </div>

                                                    {/* Posts table */}
                                                    <div className="table-wrapper">
                                                        <table className="data-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>Post Title</th>
                                                                    <th>Slug</th>
                                                                    <th>SEO Score</th>
                                                                    <th>Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {conflict.posts.map((post, j) => (
                                                                    <tr key={j}>
                                                                        <td style={{ fontWeight: j === 0 ? 600 : 400, color: 'var(--text-primary)' }}>
                                                                            {j === 0 && '👑 '}{post.title}
                                                                        </td>
                                                                        <td className="text-sm font-mono text-muted">/{post.slug}</td>
                                                                        <td>
                                                                            <Badge variant={post.score >= 70 ? 'success' : post.score >= 40 ? 'warning' : 'danger'}>
                                                                                {post.score}/100
                                                                            </Badge>
                                                                        </td>
                                                                        <td><Badge variant="neutral">{post.status}</Badge></td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
