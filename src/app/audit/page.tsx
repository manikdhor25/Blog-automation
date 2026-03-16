'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface AuditIssue { type: 'error' | 'warning' | 'info'; category: string; message: string; url?: string; details?: string; }
interface AuditResult { score: number; checks: { total: number; passed: number; failed: number; warnings: number }; issues: AuditIssue[]; site: { name: string; url: string }; timestamp: string; }
interface Site { id: string; name: string; url: string; }

export default function AuditPage() {
    const toast = useToast();
    const [result, setResult] = useState<AuditResult | null>(null);
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

    useEffect(() => { fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])).catch(() => { }); }, []);

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

    // Group by category
    const categories = [...new Set(filteredIssues.map(i => i.category))];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Technical SEO Audit</h1>
                        <p className="page-description">Crawl your site for SEO issues — meta tags, schema, links, and more</p>
                    </div>
                    <button className="btn btn-primary" onClick={handleAudit} disabled={loading || !selectedSite}>
                        {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Auditing...</> : '🔍 Run Audit'}
                    </button>
                </div>

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
            </main>
        </div>
    );
}
