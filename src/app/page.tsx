'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StatCard, Badge } from '@/components/ui';

interface QuickAction {
  icon: string;
  title: string;
  description: string;
  href: string;
  color: string;
}

const quickActions: QuickAction[] = [
  { icon: '📝', title: 'Create Content', description: 'AI-generate SEO-optimized articles', href: '/create', color: '#6366f1' },
  { icon: '✏️', title: 'Optimize Post', description: 'Improve existing content for rankings', href: '/optimize', color: '#8b5cf6' },
  { icon: '🔍', title: 'Keyword Research', description: 'Discover high-potential keywords', href: '/keywords', color: '#06b6d4' },
  { icon: '📈', title: 'Check Rankings', description: 'Monitor keyword positions', href: '/rank-tracking', color: '#22c55e' },
  { icon: '🧪', title: 'A/B Test', description: 'Split-test titles & meta descriptions', href: '/ab-tests', color: '#f59e0b' },
  { icon: '🔗', title: 'Backlink Gap', description: 'Find competitor link opportunities', href: '/backlinks', color: '#ef4444' },
  { icon: '⚡', title: 'Programmatic SEO', description: 'Generate pages from CSV data', href: '/programmatic', color: '#14b8a6' },
  { icon: '💰', title: 'Affiliate Revenue', description: 'Track affiliate link performance', href: '/affiliates', color: '#ec4899' },
];

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSites: 0, totalKeywords: 0, decayAlerts: 0,
    queueItems: 0, queueReady: 0,
    rankedKeywords: 0, top10Keywords: 0,
    totalBacklinks: 0, apiCostToday: 0,
    activeTests: 0, affiliateRevenue: 0, syndicatedPosts: 0,
  });
  const [recentQueue, setRecentQueue] = useState<{ id: string; title: string; status: string; score: number; created_at: string }[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [sitesRes, keywordsRes, decayRes, queueRes, analyticsRes, abRes, affRes] = await Promise.allSettled([
          fetch('/api/sites').then(r => r.json()),
          fetch('/api/keywords').then(r => r.json()),
          fetch('/api/decay').then(r => r.json()),
          fetch('/api/queue').then(r => r.json()),
          fetch('/api/analytics').then(r => r.json()),
          fetch('/api/ab-tests?status=active').then(r => r.json()),
          fetch('/api/affiliates?action=dashboard').then(r => r.json()),
        ]);

        const sites = sitesRes.status === 'fulfilled' ? (sitesRes.value.sites || []) : [];
        const keywords = keywordsRes.status === 'fulfilled' ? (keywordsRes.value.keywords || []) : [];
        const decayData = decayRes.status === 'fulfilled' ? decayRes.value : { summary: { total: 0 } };
        const queueData = queueRes.status === 'fulfilled' ? queueRes.value : { items: [] };
        const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value : {};
        const abTests = abRes.status === 'fulfilled' ? (abRes.value.tests || []) : [];
        const affData = affRes.status === 'fulfilled' ? affRes.value : {};

        const queueItems = queueData.items || [];
        setRecentQueue(queueItems.slice(0, 5));

        setStats({
          totalSites: sites.length,
          totalKeywords: keywords.length,
          decayAlerts: decayData.summary?.total || 0,
          queueItems: queueItems.length,
          queueReady: queueItems.filter((i: { status: string }) => i.status === 'ready').length,
          rankedKeywords: analytics.rankTracking?.totalTracked || 0,
          top10Keywords: analytics.rankTracking?.top10 || 0,
          totalBacklinks: analytics.backlinks?.total || 0,
          apiCostToday: analytics.costs?.todayCost || 0,
          activeTests: abTests.length,
          affiliateRevenue: affData.stats?.totalRevenue || 0,
          syndicatedPosts: 0,
        });
      } catch {
        // Keep defaults on error
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Command Center</h1>
            <p className="page-description">Your SEO/AEO automation overview</p>
          </div>
          <a href="/create" className="btn btn-primary btn-lg">
            ✨ Create Content
          </a>
        </div>

        {/* Stats Grid */}
        <div className="stat-grid">
          <StatCard label="WordPress Sites" value={stats.totalSites} icon="🌐" delay={1} />
          <StatCard label="Keywords Tracked" value={stats.totalKeywords} icon="🔍" delay={2} />
          <StatCard label="Top 10 Rankings" value={stats.top10Keywords} icon="🏆" delay={3} />
          <StatCard label="Queue Items" value={stats.queueItems} icon="📋" delay={4} />
          <StatCard label="Backlinks" value={stats.totalBacklinks} icon="🔗" delay={5} />
          <StatCard label="Decay Alerts" value={stats.decayAlerts} icon="⏰" delay={6} />
          <StatCard label="A/B Tests" value={stats.activeTests} icon="🧪" delay={7} />
          <StatCard label="Affiliate Revenue" value={`$${stats.affiliateRevenue.toFixed(0)}`} icon="💰" delay={8} />
        </div>

        {/* Quick Actions */}
        <div className="card animate-in animate-delay-2" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">Quick Actions</h2>
              <p className="card-subtitle">Start automating your SEO workflow</p>
            </div>
          </div>
          <div className="grid-4">
            {quickActions.slice(0, 4).map((action) => (
              <a
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
              </a>
            ))}
          </div>
          <div className="grid-4" style={{ marginTop: 8 }}>
            {quickActions.slice(4).map((action) => (
              <a
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
              </a>
            ))}
          </div>
        </div>

        {/* Recent Queue + Activity */}
        <div className="grid-2">
          <div className="card animate-in animate-delay-3">
            <div className="card-header">
              <h2 className="card-title">📋 Publish Queue</h2>
              <a href="/queue" className="btn btn-secondary btn-sm">View All →</a>
            </div>
            {recentQueue.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="empty-state-icon">📝</div>
                <div className="empty-state-text">No items in queue. Create content to get started!</div>
                <a href="/create" className="btn btn-secondary btn-sm">Create Article →</a>
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
            <div className="flex flex-col gap-3">
              {stats.totalSites > 0 && (
                <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(34,197,94,0.05)', borderRadius: 'var(--radius-sm)' }}>
                  <span>🌐</span>
                  <div className="text-sm"><strong>{stats.totalSites}</strong> WordPress site{stats.totalSites > 1 ? 's' : ''} connected</div>
                </div>
              )}
              {stats.rankedKeywords > 0 && (
                <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-sm)' }}>
                  <span>📈</span>
                  <div className="text-sm"><strong>{stats.top10Keywords}</strong> of <strong>{stats.rankedKeywords}</strong> keywords in top 10 — <a href="/rank-tracking" style={{ color: 'var(--accent-primary-light)' }}>view rankings →</a></div>
                </div>
              )}
              {stats.queueReady > 0 && (
                <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(245,158,11,0.05)', borderRadius: 'var(--radius-sm)' }}>
                  <span>📤</span>
                  <div className="text-sm"><strong>{stats.queueReady}</strong> articles ready to publish — <a href="/queue" style={{ color: 'var(--accent-primary-light)' }}>view queue →</a></div>
                </div>
              )}
              {stats.totalBacklinks > 0 && (
                <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(6,182,212,0.05)', borderRadius: 'var(--radius-sm)' }}>
                  <span>🔗</span>
                  <div className="text-sm"><strong>{stats.totalBacklinks}</strong> backlinks tracked — <a href="/backlinks" style={{ color: 'var(--accent-primary-light)' }}>manage →</a></div>
                </div>
              )}
              {stats.decayAlerts > 0 && (
                <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(239,68,68,0.05)', borderRadius: 'var(--radius-sm)' }}>
                  <span>⏰</span>
                  <div className="text-sm"><strong>{stats.decayAlerts}</strong> posts need refreshing — <a href="/decay" style={{ color: 'var(--accent-primary-light)' }}>view alerts →</a></div>
                </div>
              )}
              {stats.apiCostToday > 0 && (
                <div className="flex items-center gap-3" style={{ padding: 10, background: 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-sm)' }}>
                  <span>💰</span>
                  <div className="text-sm">Today&apos;s API cost: <strong>${stats.apiCostToday.toFixed(4)}</strong> — <a href="/costs" style={{ color: 'var(--accent-primary-light)' }}>details →</a></div>
                </div>
              )}
              {stats.totalSites === 0 && stats.totalKeywords === 0 && (
                <div className="empty-state" style={{ padding: '30px 20px' }}>
                  <div className="empty-state-icon">📭</div>
                  <div className="empty-state-text">No activity yet. Start by adding a WordPress site!</div>
                  <a href="/sites" className="btn btn-secondary btn-sm">Add Site →</a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="card animate-in animate-delay-4" style={{ marginTop: 24 }}>
          <div className="card-header">
            <h2 className="card-title">🚀 Getting Started</h2>
          </div>
          <div className="grid-4">
            <StepItem step={1} title="Add Sites" description="Connect WordPress with App Passwords" done={stats.totalSites > 0} />
            <StepItem step={2} title="Research Keywords" description="Discover high-potential keywords" done={stats.totalKeywords > 0} />
            <StepItem step={3} title="Create Content" description="Generate SEO articles with AI" done={stats.queueItems > 0} />
            <StepItem step={4} title="Track Rankings" description="Monitor keyword positions" done={stats.rankedKeywords > 0} />
          </div>
        </div>

        {/* System Features Overview */}
        <div className="card animate-in animate-delay-4" style={{ marginTop: 24 }}>
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
      </main>
    </div>
  );
}

function StepItem({ step, title, description, done }: { step: number; title: string; description: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3" style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: done ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-glass)' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'var(--accent-success)' : 'var(--bg-glass)', fontSize: '0.8rem', fontWeight: 700,
        border: done ? 'none' : '1px solid var(--border-subtle)', color: done ? 'white' : 'var(--text-muted)',
      }}>
        {done ? '✓' : step}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: done ? 'var(--accent-success)' : 'var(--text-primary)' }}>{title}</div>
        <div className="text-sm text-muted">{description}</div>
      </div>
      {done && <Badge variant="success">Done</Badge>}
    </div>
  );
}

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
