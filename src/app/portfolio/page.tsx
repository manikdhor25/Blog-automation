'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface SiteStats { id: string; name: string; url: string; niche: string; total_posts: number; published_posts: number; keywords_tracked: number; top10_keywords: number; top3_keywords: number; decay_alerts: number; monthly_revenue: number; avg_monetization_score: number | null; topical_authority: { score: number; grade: string } | null; pending_tasks: number; pipeline_runs: number; }
interface Totals { sites: number; posts: number; keywords: number; monthly_revenue: number; decay_alerts: number; pending_tasks: number; }

const GRADE_COLOR: Record<string, string> = { 'A+': '#16a34a', A: '#16a34a', B: '#65a30d', C: '#d97706', D: '#ea580c', F: '#dc2626' };

export default function PortfolioPage() {
    const [portfolio, setPortfolio] = useState<SiteStats[]>([]);
    const [totals, setTotals] = useState<Totals | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        const res = await fetch('/api/portfolio');
        const data = await res.json();
        setPortfolio(data.portfolio || []);
        setTotals(data.totals || null);
        setLoading(false);
    };

    const scoreColor = (s: number) => s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Portfolio Dashboard</h1>
                        <p className="page-description">All sites at a glance — revenue, traffic, health, tasks</p>
                    </div>
                    <Link href="/sites" className="btn btn-primary btn-sm">+ Add Site</Link>
                </div>

                {totals && (
                    <div className="grid-4" style={{ gap: 12, marginBottom: 20 }}>
                        {[
                            { label: 'Total Sites', value: totals.sites, icon: '🌐' },
                            { label: 'Total Posts', value: totals.posts.toLocaleString(), icon: '📄' },
                            { label: 'Monthly Revenue', value: `$${totals.monthly_revenue.toFixed(2)}`, icon: '💰', color: '#16a34a' },
                            { label: 'Pending Tasks', value: totals.pending_tasks, icon: '✅', color: totals.pending_tasks > 0 ? '#d97706' : undefined },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ textAlign: 'center', padding: '14px' }}>
                                <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: (s as { color?: string }).color }}>{s.value}</div>
                                <div className="text-sm text-muted">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
                ) : portfolio.length === 0 ? (
                    <EmptyState icon="🌐" title="No sites yet" description="Add your first site to start tracking your portfolio" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {portfolio.map((site, i) => (
                            <div key={i} className="card animate-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{site.name}</span>
                                            {site.niche && <Badge variant="neutral">{site.niche}</Badge>}
                                            {site.decay_alerts > 0 && <Badge variant="danger">{site.decay_alerts} decay</Badge>}
                                            {site.pending_tasks > 0 && <Badge variant="warning">{site.pending_tasks} tasks</Badge>}
                                        </div>
                                        <div className="text-sm text-muted">{site.url}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#16a34a' }}>${site.monthly_revenue.toFixed(2)}</div>
                                        <div className="text-sm text-muted">this month</div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
                                    {[
                                        { label: 'Posts', value: site.published_posts + '/' + site.total_posts },
                                        { label: 'Keywords', value: site.keywords_tracked },
                                        { label: 'Top 10', value: site.top10_keywords },
                                        { label: 'Top 3', value: site.top3_keywords },
                                        { label: 'Mon. Score', value: site.avg_monetization_score ? site.avg_monetization_score + '/100' : 'N/A', color: site.avg_monetization_score ? scoreColor(site.avg_monetization_score) : undefined },
                                        { label: 'Authority', value: site.topical_authority ? `${site.topical_authority.grade} (${site.topical_authority.score})` : 'N/A', color: site.topical_authority ? GRADE_COLOR[site.topical_authority.grade] : undefined },
                                    ].map((stat, si) => (
                                        <div key={si} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, color: (stat as { color?: string }).color }}>{stat.value}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{stat.label}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {[
                                        { label: '📝 Write', href: `/create?site=${site.id}` },
                                        { label: '🔍 Keywords', href: `/keywords?site=${site.id}` },
                                        { label: '📊 Analytics', href: `/analytics?site=${site.id}` },
                                        { label: '💰 Earnings', href: `/affiliate-earnings?site=${site.id}` },
                                        { label: '🔬 Authority', href: `/topical-authority?site=${site.id}` },
                                    ].map((link, li) => (
                                        <Link key={li} href={link.href} className="btn btn-sm" style={{ fontSize: '0.75rem' }}>{link.label}</Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
