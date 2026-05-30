'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface AuditIssue { type: 'error' | 'warning' | 'info'; category: string; message: string; url?: string; details?: string; }
interface AuditResult { score: number; checks: { total: number; passed: number; failed: number; warnings: number }; issues: AuditIssue[]; site: { name: string; url: string }; timestamp: string; }
interface Site { id: string; name: string; url: string; }

// Content Audit types (from /content-audit)
interface ContentIssue { type: string; severity: 'critical' | 'warning' | 'info'; message: string; fix: string; }
interface PostAudit { id: string; title: string; slug: string; word_count: number; issues: ContentIssue[]; score: number; }
interface ContentSummary { total_posts: number; critical_issues: number; warning_issues: number; avg_score: number; posts_needing_attention: number; posts_with_no_meta: number; thin_content_posts: number; no_keyword_posts: number; }

const SEV_VARIANT: Record<string, 'danger' | 'warning' | 'info'> = { critical: 'danger', warning: 'warning', info: 'info' };
const SEV_COLOR: Record<string, string> = { critical: '#dc2626', warning: '#d97706', info: '#2563eb' };

export default function AuditPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<string>('main');

    // Technical SEO Audit state
    const [result, setResult] = useState<AuditResult | null>(null);
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

    // Content Audit state
    const [caSiteId, setCaSiteId] = useState('');
    const [caSummary, setCaSummary] = useState<ContentSummary | null>(null);
    const [caResults, setCaResults] = useState<PostAudit[]>([]);
    const [caAuditing, setCaAuditing] = useState(false);
    const [caFilter, setCaFilter] = useState<'all' | 'critical' | 'needs_attention'>('needs_attention');
    const [caExpandedId, setCaExpandedId] = useState<string | null>(null);
    const [caMinWordCount, setCaMinWordCount] = useState('600');

    useEffect(() => { fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { }); }, []);

    // Technical SEO Audit functions
    const handleAudit = async () => {
        if (!selectedSite) { toast.warning('Select a site first'); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_id: selectedSite }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResult(data);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Audit failed');
        } finally { setLoading(false); }
    };

    const getScoreColor = (score: number) => score >= 80 ? 'var(--accent-success)' : score >= 60 ? 'var(--accent-warning)' : 'var(--accent-danger)';
    const getTypeVariant = (type: string): 'danger' | 'warning' | 'info' => type === 'error' ? 'danger' : type === 'warning' ? 'warning' : 'info';
    const getTypeIcon = (type: string) => type === 'error' ? '🔴' : type === 'warning' ? '🟡' : '🔵';

    const filteredIssues = result?.issues.filter(i => filter === 'all' || i.type === filter) || [];
    const categories = [...new Set(filteredIssues.map(i => i.category))];

    // Content Audit functions
    const handleContentAudit = async () => {
        if (!caSiteId) { toast.warning('Enter site ID'); return; }
        setCaAuditing(true);
        const res = await fetch('/api/content-audit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'audit', site_id: caSiteId, min_word_count: parseInt(caMinWordCount) }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed'); setCaAuditing(false); return; }
        setCaSummary(data.summary);
        setCaResults(data.results || []);
        toast.success(`Audited ${data.summary.total_posts} posts`);
        setCaAuditing(false);
    };

    const caFiltered = caResults.filter(r => {
        if (caFilter === 'critical') return r.issues.some(i => i.severity === 'critical');
        if (caFilter === 'needs_attention') return r.score < 70;
        return true;
    });

    const caScoreColor = (s: number) => s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Technical SEO Audit</h1>
                        <p className="page-description">Crawl your site for SEO issues — meta tags, schema, links, and more</p>
                    </div>
                    {activeTab === 'main' && (
                        <button className="btn btn-primary" onClick={handleAudit} disabled={loading || !selectedSite}>
                            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Auditing...</> : '🔍 Run Audit'}
                        </button>
                    )}
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button className={`btn ${activeTab === 'main' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('main')}>🔍 Technical SEO</button>
                    <button className={`btn ${activeTab === 'content-audit' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('content-audit')}>🩺 Content Audit</button>
                </div>

                {activeTab === 'main' && (
                    <>
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="flex items-center gap-3">
                                <div className="form-group" style={{ margin: 0, minWidth: 300 }}>
                                    <select className="form-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                                        <option value="">Select site to audit...</option>
                                        {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.url})</option>)}
                                    </select>
                                </div>
                                <span className="text-sm text-muted">Checks robots.txt, sitemap, meta tags, schema, HTTPS, mobile, and more</span>
                            </div>
                        </div>

                        {!result && !loading ? (
                            <div className="card">
                                <EmptyState icon="🔍" title="No Audit Results" description="Select a WordPress site and click 'Run Audit' to crawl for technical SEO issues." />
                            </div>
                        ) : loading ? (
                            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 20px' }} />
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 8 }}>🔍 Crawling site...</h2>
                                <p className="text-sm text-muted">Checking robots.txt, sitemap, meta tags, schema, and more</p>
                            </div>
                        ) : result && (
                            <>
                                {/* Score + Stats */}
                                <div className="grid-2" style={{ gap: 24, marginBottom: 24 }}>
                                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                                        <div style={{ fontSize: '4rem', fontWeight: 900, color: getScoreColor(result.score), marginBottom: 8 }}>
                                            {result.score}
                                        </div>
                                        <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>SEO Health Score</div>
                                        <div className="text-sm text-muted">{result.site.name} — {result.site.url}</div>
                                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>Audited: {new Date(result.timestamp).toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                            <StatCard label="Checks Run" value={result.checks.total} icon="🔍" />
                                            <StatCard label="Passed" value={result.checks.passed} icon="✅" />
                                            <StatCard label="Errors" value={result.checks.failed} icon="🔴" />
                                            <StatCard label="Warnings" value={result.checks.warnings} icon="🟡" />
                                        </div>
                                    </div>
                                </div>

                                {/* Filter */}
                                <div className="flex gap-2" style={{ marginBottom: 20 }}>
                                    {(['all', 'error', 'warning', 'info'] as const).map(f => (
                                        <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                            onClick={() => setFilter(f)}>
                                            {f === 'all' ? `All (${result.issues.length})` :
                                                f === 'error' ? `🔴 Errors (${result.issues.filter(i => i.type === 'error').length})` :
                                                    f === 'warning' ? `🟡 Warnings (${result.issues.filter(i => i.type === 'warning').length})` :
                                                        `🔵 Info (${result.issues.filter(i => i.type === 'info').length})`}
                                        </button>
                                    ))}
                                </div>

                                {/* Issues by Category */}
                                {categories.map(category => (
                                    <div key={category} className="card" style={{ marginBottom: 16 }}>
                                        <div className="card-header">
                                            <h2 className="card-title">{category}</h2>
                                            <Badge variant="neutral">{filteredIssues.filter(i => i.category === category).length} issues</Badge>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {filteredIssues.filter(i => i.category === category).map((issue, i) => (
                                                <div key={i} style={{
                                                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                                    background: issue.type === 'error' ? 'rgba(239,68,68,0.05)' : issue.type === 'warning' ? 'rgba(245,158,11,0.05)' : 'rgba(99,102,241,0.05)',
                                                    border: `1px solid ${issue.type === 'error' ? 'rgba(239,68,68,0.15)' : issue.type === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)'}`,
                                                }}>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant={getTypeVariant(issue.type)}>{getTypeIcon(issue.type)} {issue.type.toUpperCase()}</Badge>
                                                        <span className="text-sm" style={{ fontWeight: 500 }}>{issue.message}</span>
                                                    </div>
                                                    {issue.url && <div className="text-sm text-muted" style={{ marginTop: 4 }}>{issue.url}</div>}
                                                    {issue.details && <div className="text-sm" style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{issue.details}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </>
                )}

                {activeTab === 'content-audit' && (
                    <>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <input className="form-input" value={caSiteId} onChange={e => setCaSiteId(e.target.value)} placeholder="Site ID (UUID from Sites page)" style={{ flex: 1, minWidth: 200 }} />
                                <input className="form-input" type="number" value={caMinWordCount} onChange={e => setCaMinWordCount(e.target.value)} placeholder="Min word count" style={{ width: 140 }} />
                                <button className="btn btn-primary" onClick={handleContentAudit} disabled={caAuditing || !caSiteId}>
                                    {caAuditing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Auditing...</> : '🩺 Run Audit'}
                                </button>
                            </div>
                        </div>

                        {caSummary && (
                            <>
                                <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                                    {[
                                        { label: 'Posts Audited', value: caSummary.total_posts, icon: '📄' },
                                        { label: 'Critical Issues', value: caSummary.critical_issues, icon: '🚨', color: caSummary.critical_issues > 0 ? '#dc2626' : '#16a34a' },
                                        { label: 'Avg Score', value: `${caSummary.avg_score}/100`, icon: '📊', color: caScoreColor(caSummary.avg_score) },
                                        { label: 'Need Attention', value: caSummary.posts_needing_attention, icon: '⚠️', color: caSummary.posts_needing_attention > 0 ? '#d97706' : '#16a34a' },
                                    ].map((s, i) => (
                                        <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color }}>{s.value}</div>
                                            <div className="text-sm text-muted">{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="grid-4" style={{ gap: 8, marginBottom: 16 }}>
                                    {[
                                        { label: 'No Meta Description', value: caSummary.posts_with_no_meta, action: 'Run Bulk Meta' },
                                        { label: 'Thin Content', value: caSummary.thin_content_posts, action: 'Content Writer' },
                                        { label: 'No Focus Keyword', value: caSummary.no_keyword_posts, action: 'Fix Manually' },
                                    ].map((s, i) => (
                                        <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: s.value > 0 ? '#dc2626' : '#16a34a' }}>{s.value}</div>
                                            <div className="text-sm text-muted">{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                    {(['needs_attention', 'critical', 'all'] as const).map(f => (
                                        <button key={f} className={`btn btn-sm ${caFilter === f ? 'btn-primary' : ''}`} onClick={() => setCaFilter(f)} style={{ textTransform: 'capitalize' }}>
                                            {f === 'needs_attention' ? `⚠️ Needs Attention (${caResults.filter(r => r.score < 70).length})` : f === 'critical' ? `🚨 Critical (${caResults.filter(r => r.issues.some(i => i.severity === 'critical')).length})` : `All (${caResults.length})`}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {caFiltered.map((post, i) => (
                                        <div key={i} className="card" style={{ padding: '10px 14px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setCaExpandedId(caExpandedId === post.id ? null : post.id)}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${caScoreColor(post.score)}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.7rem', color: caScoreColor(post.score), flexShrink: 0 }}>{post.score}</div>
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{post.title}</div>
                                                            <div style={{ display: 'flex', gap: 8 }}>
                                                                <span className="text-sm text-muted">{post.word_count.toLocaleString()}w</span>
                                                                {post.issues.filter(i => i.severity === 'critical').length > 0 && <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 700 }}>{post.issues.filter(i => i.severity === 'critical').length} critical</span>}
                                                                {post.issues.filter(i => i.severity === 'warning').length > 0 && <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700 }}>{post.issues.filter(i => i.severity === 'warning').length} warnings</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <span style={{ color: 'var(--text-muted)' }}>{caExpandedId === post.id ? '▲' : '▼'}</span>
                                            </div>

                                            {caExpandedId === post.id && (
                                                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                                                    {post.issues.map((issue, ii) => (
                                                        <div key={ii} style={{ display: 'flex', gap: 10, marginBottom: 8, padding: '6px 8px', background: `${SEV_COLOR[issue.severity]}08`, borderRadius: 4, borderLeft: `2px solid ${SEV_COLOR[issue.severity]}` }}>
                                                            <Badge variant={SEV_VARIANT[issue.severity]}>{issue.severity}</Badge>
                                                            <div>
                                                                <div className="text-sm" style={{ fontWeight: 600 }}>{issue.message}</div>
                                                                <div className="text-sm text-muted">Fix: {issue.fix}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {!caSummary && !caAuditing && <EmptyState icon="🩺" title="Enter site ID to audit" description="Scans all posts for missing meta, thin content, keyword issues, schema, and more" />}
                    </>
                )}
            </main>
        </div>
    );
}
