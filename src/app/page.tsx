'use client';

import React from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge } from '@/components/ui';
import useFetch from '@/hooks/useFetch';
import { useTheme } from '@/components/ThemeProvider';

/* ─── Quick Actions Config ─── */
interface QuickAction {
    icon: string;
    title: string;
    description: string;
    href: string;
}

const quickActions: QuickAction[] = [
    { icon: '📝', title: 'Create Content', description: 'AI-generate SEO-optimized articles', href: '/create' },
    { icon: '✏️', title: 'Optimize Post', description: 'Improve existing content for rankings', href: '/optimize' },
    { icon: '🔍', title: 'Keyword Research', description: 'Discover high-potential keywords', href: '/keywords' },
    { icon: '📈', title: 'Check Rankings', description: 'Monitor keyword positions', href: '/rank-tracking' },
    { icon: '🧪', title: 'A/B Test', description: 'Split-test titles & meta descriptions', href: '/ab-tests' },
    { icon: '🔗', title: 'Backlink Gap', description: 'Find competitor link opportunities', href: '/backlinks' },
    { icon: '⚡', title: 'Programmatic SEO', description: 'Generate pages from CSV data', href: '/programmatic' },
    { icon: '💰', title: 'Affiliate Revenue', description: 'Track affiliate link performance', href: '/affiliates' },
];

/* ─── Skeleton ─── */
function SkeletonRows({ count = 4 }: { count?: number }) {
    return (
        <div className="flex flex-col gap-2">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 40, borderRadius: 'var(--radius-sm)' }} />
            ))}
        </div>
    );
}

/* ─── Main Dashboard ─── */
export default function Dashboard() {
    const { theme, toggleTheme } = useTheme();

    // SWR hooks — auto-deduplicated, cached, revalidate-on-focus
    const { data: sitesData, isLoading: sitesLoading } = useFetch<{ sites: { id: string }[] }>('/api/sites');
    const { data: keywordsData, isLoading: kwLoading } = useFetch<{ keywords: { id: string }[] }>('/api/keywords');
    const { data: decayData, isLoading: decayLoading } = useFetch<{ summary: { total: number } }>('/api/decay');
    const { data: queueData, isLoading: queueLoading } = useFetch<{ items: { id: string; title: string; status: string; score: number; created_at: string }[] }>('/api/queue');
    const { data: analyticsData, isLoading: analyticsLoading } = useFetch<{ rankTracking?: { totalTracked: number; top10: number }; backlinks?: { total: number }; costs?: { todayCost: number } }>('/api/analytics');
    const { data: abData } = useFetch<{ tests: { id: string }[] }>('/api/ab-tests?status=active');
    const { data: affData } = useFetch<{ stats: { totalRevenue: number } }>('/api/affiliates?action=dashboard');

    // Derived values (safe fallbacks)
    const sites = sitesData?.sites || [];
    const keywords = keywordsData?.keywords || [];
    const decayAlerts = decayData?.summary?.total || 0;
    const queueItems = queueData?.items || [];
    const recentQueue = queueItems.slice(0, 5);
    const rankedKeywords = analyticsData?.rankTracking?.totalTracked || 0;
    const top10Keywords = analyticsData?.rankTracking?.top10 || 0;
    const totalBacklinks = analyticsData?.backlinks?.total || 0;
    const apiCostToday = analyticsData?.costs?.todayCost || 0;
    const activeTests = abData?.tests?.length || 0;
    const affiliateRevenue = affData?.stats?.totalRevenue || 0;
    const queueReady = queueItems.filter(i => i.status === 'ready').length;

    const isLoadingStats = sitesLoading || kwLoading || decayLoading || queueLoading || analyticsLoading;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content" id="main-content">
                {/* Page Header */}
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Command Center</h1>
                        <p className="page-description">Your SEO/AEO automation overview</p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <button
                            className="theme-toggle"
                            onClick={toggleTheme}
                            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        >
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>
                        <Link href="/create" className="btn btn-primary btn-lg">
                            ✨ Create Content
                        </Link>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="stat-grid">
                    {isLoadingStats ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="stat-card" style={{ minHeight: 90 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <div className="skeleton" style={{ height: 12, width: '50%' }} />
                                    <div className="skeleton" style={{ height: 20, width: 20, borderRadius: '50%' }} />
                                </div>
                                <div className="skeleton" style={{ height: 32, width: '40%' }} />
                            </div>
                        ))
                    ) : (
                        <>
                            <StatCard label="WordPress Sites" value={sites.length} icon="🌐" delay={1} />
                            <StatCard label="Keywords Tracked" value={keywords.length} icon="🔍" delay={2} />
                            <StatCard label="Top 10 Rankings" value={top10Keywords} icon="🏆" delay={3} />
                            <StatCard label="Queue Items" value={queueItems.length} icon="📋" delay={4} />
                            <StatCard label="Backlinks" value={totalBacklinks} icon="🔗" delay={5} />
                            <StatCard label="Decay Alerts" value={decayAlerts} icon="⏰" delay={6} />
                            <StatCard label="A/B Tests" value={activeTests} icon="🧪" delay={7} />
                            <StatCard label="Affiliate Revenue" value={`$${affiliateRevenue.toFixed(0)}`} icon="💰" delay={8} />
                        </>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="card animate-in animate-delay-2" style={{ marginBottom: 'var(--space-6)' }}>
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">Quick Actions</h2>
                            <p className="card-subtitle">Start automating your SEO workflow</p>
                        </div>
                    </div>
                    <div className="grid-4">
                        {quickActions.slice(0, 4).map((action) => (
                            <Link
                                key={action.title}
                                href={action.href}
                                className="card"
                                style={{
                                    textDecoration: 'none',
                                    textAlign: 'center',
                                    padding: '24px 16px',
                                    cursor: 'pointer',
                                    borderColor: 'transparent',
                                }}
                            >
                                <div style={{ fontSize: '2rem', marginBottom: 8 }}>{action.icon}</div>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{action.title}</div>
                                <div className="text-xs text-muted">{action.description}</div>
                            </Link>
                        ))}
                    </div>
                    <div className="grid-4" style={{ marginTop: 8 }}>
                        {quickActions.slice(4).map((action) => (
                            <Link
                                key={action.title}
                                href={action.href}
                                className="card"
                                style={{
                                    textDecoration: 'none',
                                    textAlign: 'center',
                                    padding: '24px 16px',
                                    cursor: 'pointer',
                                    borderColor: 'transparent',
                                }}
                            >
                                <div style={{ fontSize: '2rem', marginBottom: 8 }}>{action.icon}</div>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{action.title}</div>
                                <div className="text-xs text-muted">{action.description}</div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Recent Queue + Activity */}
                <div className="grid-2">
                    <div className="card animate-in animate-delay-3">
                        <div className="card-header">
                            <h2 className="card-title">📋 Publish Queue</h2>
                            <Link href="/queue" className="btn btn-secondary btn-sm">View All →</Link>
                        </div>
                        {queueLoading ? (
                            <SkeletonRows count={5} />
                        ) : recentQueue.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px 20px' }}>
                                <div className="empty-state-icon">📝</div>
                                <div className="empty-state-text">No items in queue. Create content to get started!</div>
                                <Link href="/create" className="btn btn-secondary btn-sm">Create Article →</Link>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {recentQueue.map(item => (
                                    <div key={item.id} className="flex items-center gap-3" style={{ padding: '10px 12px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="text-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                                        </div>
                                        <Badge variant={item.status === 'ready' ? 'success' : item.status === 'review' ? 'warning' : 'neutral'}>{item.status}</Badge>
                                        {item.score > 0 && <Badge variant="info">{item.score}/100</Badge>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card animate-in animate-delay-4">
                        <div className="card-header">
                            <h2 className="card-title">📊 Live Overview</h2>
                        </div>
                        {isLoadingStats ? (
                            <SkeletonRows count={5} />
                        ) : (
                            <div className="flex flex-col gap-3">
                                {sites.length > 0 && (
                                    <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(34,197,94,0.05)', borderRadius: 'var(--radius-sm)' }}>
                                        <span>🌐</span>
                                        <div className="text-sm"><strong>{sites.length}</strong> WordPress site{sites.length > 1 ? 's' : ''} connected</div>
                                    </div>
                                )}
                                {rankedKeywords > 0 && (
                                    <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-sm)' }}>
                                        <span>📈</span>
                                        <div className="text-sm"><strong>{top10Keywords}</strong> of <strong>{rankedKeywords}</strong> keywords in top 10 — <Link href="/rank-tracking" style={{ color: 'var(--accent-primary-light)' }}>view rankings →</Link></div>
                                    </div>
                                )}
                                {queueReady > 0 && (
                                    <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(245,158,11,0.05)', borderRadius: 'var(--radius-sm)' }}>
                                        <span>📤</span>
                                        <div className="text-sm"><strong>{queueReady}</strong> articles ready to publish — <Link href="/queue" style={{ color: 'var(--accent-primary-light)' }}>view queue →</Link></div>
                                    </div>
                                )}
                                {totalBacklinks > 0 && (
                                    <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(6,182,212,0.05)', borderRadius: 'var(--radius-sm)' }}>
                                        <span>🔗</span>
                                        <div className="text-sm"><strong>{totalBacklinks}</strong> backlinks tracked — <Link href="/backlinks" style={{ color: 'var(--accent-primary-light)' }}>manage →</Link></div>
                                    </div>
                                )}
                                {decayAlerts > 0 && (
                                    <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(239,68,68,0.05)', borderRadius: 'var(--radius-sm)' }}>
                                        <span>⏰</span>
                                        <div className="text-sm"><strong>{decayAlerts}</strong> posts need refreshing — <Link href="/decay" style={{ color: 'var(--accent-primary-light)' }}>view alerts →</Link></div>
                                    </div>
                                )}
                                {apiCostToday > 0 && (
                                    <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-sm)' }}>
                                        <span>💰</span>
                                        <div className="text-sm">Today&apos;s API cost: <strong>${apiCostToday.toFixed(4)}</strong> — <Link href="/costs" style={{ color: 'var(--accent-primary-light)' }}>details →</Link></div>
                                    </div>
                                )}
                                {sites.length === 0 && keywords.length === 0 && (
                                    <div className="empty-state" style={{ padding: '30px 20px' }}>
                                        <div className="empty-state-icon">📭</div>
                                        <div className="empty-state-text">No activity yet. Start by adding a WordPress site!</div>
                                        <Link href="/sites" className="btn btn-secondary btn-sm">Add Site →</Link>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Getting Started */}
                <div className="card animate-in animate-delay-4" style={{ marginTop: 'var(--space-6)' }}>
                    <div className="card-header">
                        <h2 className="card-title">🚀 Getting Started</h2>
                    </div>
                    <div className="grid-4">
                        <StepItem step={1} title="Add Sites" description="Connect WordPress with App Passwords" done={sites.length > 0} href="/sites" />
                        <StepItem step={2} title="Research Keywords" description="Discover high-potential keywords" done={keywords.length > 0} href="/keywords" />
                        <StepItem step={3} title="Create Content" description="Generate SEO articles with AI" done={queueItems.length > 0} href="/create" />
                        <StepItem step={4} title="Track Rankings" description="Monitor keyword positions" done={rankedKeywords > 0} href="/rank-tracking" />
                    </div>
                </div>

                {/* System Features Overview */}
                <div className="card animate-in animate-delay-4" style={{ marginTop: 'var(--space-6)' }}>
                    <div className="card-header">
                        <h2 className="card-title">⚙️ System Capabilities</h2>
                    </div>
                    <div className="grid-3">
                        <FeatureItem icon="🤖" title="Smart AI Routing" desc="7 providers: Gemini, GPT-4o, Claude & more" />
                        <FeatureItem icon="📊" title="12-Dimension Scoring" desc="SEO, AEO, GEO, E-E-A-T, SERP Correlation" />
                        <FeatureItem icon="🏗️" title="Topical Authority" desc="Content clusters & pillar pages" />
                        <FeatureItem icon="📈" title="Rank Tracking" desc="Google SERP + AI Overview citations" />
                        <FeatureItem icon="🔗" title="Backlink Intel" desc="Moz API: DA/PA, gap analysis, real links" />
                        <FeatureItem icon="🩺" title="SEO Audit" desc="Technical site crawl & health scoring" />
                        <FeatureItem icon="🧪" title="A/B Split Testing" desc="Title/meta variants with z-score" />
                        <FeatureItem icon="💰" title="Affiliate Revenue" desc="Program tracking, links, UTM, revenue" />
                        <FeatureItem icon="⚡" title="Programmatic SEO" desc="CSV import, templates, batch 100+ pages" />
                        <FeatureItem icon="🔄" title="Content Syndication" desc="AI rewrite, uniqueness, canonical" />
                        <FeatureItem icon="⏰" title="Automation Pipeline" desc="CRON: auto-publish, rank-check, decay" />
                        <FeatureItem icon="🌐" title="Multi-Language" desc="Generate in 15+ languages" />
                        <FeatureItem icon="📋" title="Version History" desc="Track content changes & rollback" />
                        <FeatureItem icon="🖼️" title="Image SEO" desc="Alt-text, naming & placement tips" />
                        <FeatureItem icon="📤" title="Multi-Site" desc="Unlimited WordPress sites" />
                    </div>
                </div>

                {/* Keyboard Shortcut Hint */}
                <div style={{ textAlign: 'center', padding: 'var(--space-6) 0 var(--space-8)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    Press <kbd style={{ padding: '2px 6px', background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>Ctrl+K</kbd> to search everywhere • <kbd style={{ padding: '2px 6px', background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>Ctrl+/</kbd> for keyboard shortcuts
                </div>
            </main>
        </div>
    );
}

/* ─── Step Item (Getting Started) ─── */
function StepItem({ step, title, description, done, href }: { step: number; title: string; description: string; done: boolean; href: string }) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3"
            style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                background: done ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-glass)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'background var(--transition-fast)',
            }}
        >
            <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'var(--accent-success)' : 'var(--bg-glass)', fontSize: '0.8rem', fontWeight: 700,
                border: done ? 'none' : '1px solid var(--border-subtle)', color: done ? 'white' : 'var(--text-muted)',
                flexShrink: 0,
            }}>
                {done ? '✓' : step}
            </div>
            <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: done ? 'var(--accent-success)' : 'var(--text-primary)' }}>{title}</div>
                <div className="text-sm text-muted">{description}</div>
            </div>
            {done && <Badge variant="success">Done</Badge>}
        </Link>
    );
}

/* ─── Feature Item ─── */
function FeatureItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
    return (
        <div className="flex items-center gap-3" style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-glass)' }}>
            <span style={{ fontSize: '1.5rem' }}>{icon}</span>
            <div>
                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{title}</div>
                <div className="text-sm text-muted">{desc}</div>
            </div>
        </div>
    );
}
