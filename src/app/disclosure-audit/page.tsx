'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface AuditResult { post_id: string; title: string; slug: string; has_affiliate_links: boolean; has_disclosure: boolean; needs_disclosure: boolean; status: string; }
interface Summary { total_posts: number; missing_disclosure: number; compliant: number; no_affiliate_links: number; compliance_rate: number; }

export default function DisclosureAuditPage() {
    const toast = useToast();
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [siteId, setSiteId] = useState('');
    const [results, setResults] = useState<AuditResult[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'missing' | 'compliant'>('missing');

    useEffect(() => { fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || [])); }, []);

    const runAudit = async () => {
        setLoading(true);
        const res = await fetch(`/api/disclosure-audit${siteId ? `?site_id=${siteId}` : ''}`);
        const data = await res.json();
        setResults(data.results || []);
        setSummary(data.summary || null);
        toast.success(`Audited ${data.summary?.total_posts || 0} posts — ${data.summary?.missing_disclosure || 0} missing disclosures`);
        setLoading(false);
    };

    const displayed = filter === 'all' ? results : filter === 'missing' ? results.filter(r => r.needs_disclosure) : results.filter(r => r.status === 'compliant');

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Disclosure Audit</h1>
                        <p className="page-description">Scan all posts for missing FTC affiliate disclosures — legal compliance check</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={runAudit} disabled={loading}>{loading ? 'Auditing...' : '🔍 Run Audit'}</button>
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                    <select className="form-select" value={siteId} onChange={e => setSiteId(e.target.value)} style={{ maxWidth: 250 }}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                {summary && (
                    <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                        {[
                            { label: 'Compliance Rate', value: `${summary.compliance_rate}%`, icon: '⚖️', color: summary.compliance_rate >= 90 ? '#16a34a' : '#dc2626' },
                            { label: 'Missing', value: summary.missing_disclosure, icon: '🚨', color: summary.missing_disclosure > 0 ? '#dc2626' : '#16a34a' },
                            { label: 'Compliant', value: summary.compliant, icon: '✅' },
                            { label: 'No Affiliate Links', value: summary.no_affiliate_links, icon: '📝' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                                <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color || 'var(--text-primary)' }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {summary && summary.missing_disclosure > 0 && (
                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>⚠️ FTC Compliance Warning</div>
                        <div className="text-sm" style={{ color: '#7f1d1d' }}>{summary.missing_disclosure} posts have affiliate links without disclosure. The FTC requires clear disclosure before affiliate links. Add disclosure text using the FTC Disclosure engine in Settings.</div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {(['missing', 'compliant', 'all'] as const).map(f => <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>{f} {f === 'missing' && summary ? `(${summary.missing_disclosure})` : ''}</button>)}
                </div>

                <div className="card">
                    {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                        : displayed.length === 0 ? <EmptyState icon="⚖️" title={results.length === 0 ? 'Run Audit First' : 'All Clear'} description={results.length === 0 ? 'Click Run Audit to check all posts for FTC compliance' : 'No posts in this category'} />
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {displayed.map(r => (
                                <div key={r.post_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, borderLeft: `3px solid ${r.needs_disclosure ? '#dc2626' : '#16a34a'}` }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{r.title}</div>
                                        <div className="text-sm text-muted">/{r.slug}/</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        {r.has_affiliate_links && <span style={{ fontSize: '0.75rem', color: '#d97706' }}>has affiliate links</span>}
                                        <Badge variant={r.status === 'compliant' ? 'success' : r.status === 'missing' ? 'danger' : 'neutral'}>{r.status.replace('_', ' ')}</Badge>
                                        <a href={`/optimize?post_id=${r.post_id}`} className="btn btn-sm">Fix →</a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    }
                </div>
            </main>
        </div>
    );
}
