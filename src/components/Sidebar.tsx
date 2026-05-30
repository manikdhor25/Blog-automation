'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import NotificationBell from '@/components/NotificationBell';
import { useProfile } from '@/hooks/useProfile';
import useFetch from '@/hooks/useFetch';

/* ─── Navigation Config ─── */
const navSections = [
    {
        section: 'Overview',
        icon: '⚡',
        items: [
            { href: '/', label: 'Command Center', icon: '⚡' },
            { href: '/portfolio', label: 'Portfolio Dashboard', icon: '🌐' },
            { href: '/onboarding', label: 'Setup Guide', icon: '🚀' },
        ],
    },
    {
        section: 'Content',
        icon: '📝',
        items: [
            { href: '/create', label: 'Content Writer', icon: '📝' },
            { href: '/auto-blogger', label: 'Auto-Blogger', icon: '🤖' },
            { href: '/optimize', label: 'Optimizer', icon: '✏️' },
            { href: '/briefs', label: 'Content Briefs', icon: '📋' },
            { href: '/content-pipeline', label: 'Content Pipeline', icon: '🚀' },
            { href: '/queue', label: 'Publish Queue', icon: '📤' },
            { href: '/templates', label: 'Post Templates', icon: '📋' },
            { href: '/repurpose', label: 'Repurpose', icon: '🔄' },
            { href: '/programmatic', label: 'Programmatic SEO', icon: '⚡' },
            { href: '/transcript-to-post', label: 'Transcript → Post', icon: '🎙️' },
            { href: '/versions', label: 'Versioning', icon: '📜' },
            { href: '/content-records', label: 'Content Records', icon: '📊' },
        ],
    },
    {
        section: 'SEO',
        icon: '🔍',
        items: [
            { href: '/keywords', label: 'Keyword Intel', icon: '🔍' },
            { href: '/clusters', label: 'Topic Clusters', icon: '🏗️' },
            { href: '/rank-tracking', label: 'Rank Tracker', icon: '📈' },
            { href: '/audit', label: 'SEO Audit', icon: '🩺' },
            { href: '/serp-data', label: 'SERP Data', icon: '🔎' },
            { href: '/seo-predictor', label: 'SEO Predictor', icon: '🔮' },
            { href: '/cluster-autopilot', label: 'Cluster Auto-Pilot', icon: '🤖' },
            { href: '/topical-authority', label: 'Topical Authority', icon: '🔬' },
            { href: '/keyword-alerts', label: 'Rank Alerts', icon: '🔔' },
            { href: '/gap-analyzer', label: 'Topic Gaps', icon: '🕳️' },
            { href: '/schema-builder', label: 'Schema Builder', icon: '🏷️' },
            { href: '/image-seo', label: 'Image SEO', icon: '🖼️' },
            { href: '/niche-wizard', label: 'Niche Wizard', icon: '🔮' },
        ],
    },
    {
        section: 'Analytics',
        icon: '📊',
        items: [
            { href: '/analytics', label: 'Analytics', icon: '📊' },
            { href: '/health-score', label: 'Site Health Score', icon: '🏥' },
            { href: '/gsc', label: 'Search Console', icon: '📈' },
            { href: '/ga4', label: 'Google Analytics 4', icon: '📊' },
            { href: '/cwv', label: 'Core Web Vitals', icon: '⚡' },
            { href: '/freshness-dashboard', label: 'Content Freshness', icon: '📅' },
            { href: '/volatility', label: 'SERP Volatility', icon: '🌊' },
            { href: '/algo-tracker', label: 'Algo Tracker', icon: '📊' },
            { href: '/ab-tests', label: 'A/B Tests', icon: '🧪' },
            { href: '/forecaster', label: 'Revenue Forecaster', icon: '🔮' },
            { href: '/reports', label: 'Client Reports', icon: '📋' },
        ],
    },
    {
        section: 'Links',
        icon: '🔗',
        items: [
            { href: '/backlinks', label: 'Backlinks', icon: '🔗' },
            { href: '/internal-links', label: 'Internal Links', icon: '🔗' },
            { href: '/link-graph', label: 'Link Graph', icon: '🕸️' },
            { href: '/link-fixer', label: 'Link Fixer', icon: '🔧' },
            { href: '/backlink-crm', label: 'Backlink CRM', icon: '🔗' },
            { href: '/backlink-gap', label: 'Backlink Gap', icon: '🔍' },
            { href: '/outbound-checker', label: 'Outbound Checker', icon: '🔗' },
            { href: '/canonical', label: 'Canonical Manager', icon: '🔗' },
            { href: '/redirects', label: 'Redirect Manager', icon: '🔀' },
            { href: '/hreflang', label: 'Hreflang', icon: '🌐' },
        ],
    },
    {
        section: 'Monetize',
        icon: '💰',
        items: [
            { href: '/affiliates', label: 'Affiliates', icon: '💰' },
            { href: '/link-manager', label: 'Link Manager', icon: '🔗' },
            { href: '/comparison', label: 'Comparison Tables', icon: '📊' },
            { href: '/review-generator', label: 'Review Generator', icon: '⭐' },
            { href: '/price-monitor', label: 'Price Monitor', icon: '📉' },
            { href: '/bsr-tracker', label: 'BSR Tracker', icon: '📦' },
            { href: '/deals', label: 'Deals & Coupons', icon: '🎟️' },
            { href: '/sponsored', label: 'Sponsored Posts', icon: '🤝' },
            { href: '/ad-revenue', label: 'Ad Revenue', icon: '📺' },
            { href: '/digital-products', label: 'Digital Products', icon: '💿' },
            { href: '/cro-analyzer', label: 'CRO Analyzer', icon: '🎯' },
            { href: '/click-tracker', label: 'Click Tracker', icon: '👆' },
            { href: '/monetization-score', label: 'Monetization Score', icon: '💰' },
            { href: '/amazon-updater', label: 'Amazon Updater', icon: '📦' },
            { href: '/rate-monitor', label: 'Rate Monitor', icon: '📉' },
            { href: '/program-finder', label: 'Program Finder', icon: '🤝' },
            { href: '/goal-planner', label: 'Revenue Goals', icon: '💰' },
            { href: '/income-report', label: 'Income Report', icon: '📊' },
        ],
    },
    {
        section: 'Growth',
        icon: '🚀',
        items: [
            { href: '/trending', label: 'Trending Radar', icon: '📡' },
            { href: '/idea-generator', label: 'Idea Generator', icon: '💡' },
            { href: '/competitors', label: 'Competitors', icon: '🏢' },
            { href: '/competitor-spy', label: 'Competitor Spy', icon: '🕵️' },
            { href: '/competitor-feed', label: 'Competitor Feed', icon: '📡' },
            { href: '/outreach', label: 'Outreach CRM', icon: '🎯' },
            { href: '/social', label: 'Social Publisher', icon: '📱' },
            { href: '/social-listening', label: 'Social Listening', icon: '📡' },
            { href: '/haro', label: 'HARO Automation', icon: '📬' },
            { href: '/roundup', label: 'Expert Roundups', icon: '🎯' },
            { href: '/press-release', label: 'Press Releases', icon: '📰' },
            { href: '/proposal', label: 'SEO Proposals', icon: '📄' },
            { href: '/brand-voice', label: 'Brand Voice', icon: '🎭' },
            { href: '/youtube-seo', label: 'YouTube SEO', icon: '▶️' },
            { href: '/video-scripts', label: 'Video Scripts', icon: '🎬' },
        ],
    },
    {
        section: 'Tools',
        icon: '🔧',
        items: [
            { href: '/humanizer', label: 'Content Humanizer', icon: '🧠' },
            { href: '/readability', label: 'Readability Improver', icon: '📖' },
            { href: '/snippet-optimizer', label: 'Snippet Optimizer', icon: '🎯' },
            { href: '/keyword-density', label: 'Keyword Density', icon: '🔢' },
            { href: '/eeat-improver', label: 'E-E-A-T Improver', icon: '⭐' },
            { href: '/post-analyzer', label: 'Competitor Analyzer', icon: '🔍' },
            { href: '/alt-text-bulk', label: 'Alt-Text Generator', icon: '🖼️' },
            { href: '/glossary', label: 'Glossary Builder', icon: '📖' },
            { href: '/faq-generator', label: 'FAQ Generator', icon: '❓' },
            { href: '/content-grader', label: 'Content Grader', icon: '📊' },
            { href: '/toc-generator', label: 'TOC Generator', icon: '📑' },
            { href: '/duplicate-scanner', label: 'Overlap Detector', icon: '🔍' },
            { href: '/intent-classifier', label: 'Intent Classifier', icon: '🎯' },
            { href: '/image-gen', label: 'AI Image Generator', icon: '🖼️' },
            { href: '/playground', label: 'AI Playground', icon: '🧪' },
            { href: '/plagiarism', label: 'AI Detection', icon: '🔬' },
        ],
    },
    {
        section: 'System',
        icon: '⚙️',
        items: [
            { href: '/sites', label: 'Sites', icon: '🌐' },
            { href: '/settings', label: 'Settings', icon: '⚙️' },
            { href: '/account', label: 'Account', icon: '👤' },
            { href: '/team-manager', label: 'Team Manager', icon: '👥' },
            { href: '/costs', label: 'API Costs', icon: '💰' },
            { href: '/export', label: 'Export', icon: '📥' },
            { href: '/webhooks', label: 'Webhooks', icon: '🔔' },
            { href: '/zapier-builder', label: 'Zapier Builder', icon: '⚡' },
            { href: '/bulk-ops', label: 'Bulk Operations', icon: '⚡' },
            { href: '/404-monitor', label: '404 Monitor', icon: '🔴' },
            { href: '/schema-validator', label: 'Schema Validator', icon: '📋' },
            { href: '/site-config', label: 'robots.txt & Sitemap', icon: '⚙️' },
            { href: '/disclosure-audit', label: 'Disclosure Audit', icon: '⚖️' },
            { href: '/theme-scanner', label: 'Theme Scanner', icon: '🎨' },
            { href: '/wp-plugin', label: 'WP Plugin', icon: '🔌' },
            { href: '/wp-comments', label: 'Comment Manager', icon: '💬' },
            { href: '/rss-monitor', label: 'RSS Monitor', icon: '📡' },
            { href: '/drip-builder', label: 'Drip Sequences', icon: '📨' },
            { href: '/email-capture', label: 'Email Capture', icon: '📧' },
            { href: '/newsletter', label: 'Newsletter Revenue', icon: '💌' },
            { href: '/syndication', label: 'Syndication', icon: '🔄' },
            { href: '/multilang', label: 'Multi-Language', icon: '🌍' },
            { href: '/network-sync', label: 'Network Sync', icon: '🔄' },
            { href: '/roi', label: 'Content ROI', icon: '📈' },
            { href: '/valuation', label: 'Site Valuation', icon: '💎' },
            { href: '/acquisition', label: 'Site Acquisition', icon: '🏪' },
            { href: '/attribution', label: 'Revenue Attribution', icon: '🎯' },
        ],
    },
];

// Build a flat lookup for path -> item info
const allNavItems = navSections.flatMap(s => s.items.map(i => ({ ...i, section: s.section })));

function getActiveSection(pathname: string): string {
    const item = allNavItems.find(i => i.href === pathname);
    return item?.section || 'Overview';
}

function getPageTitle(pathname: string): string {
    const item = allNavItems.find(i => i.href === pathname);
    return item?.label || pathname.replace(/^\//, '').replace(/-/g, ' ') || 'Dashboard';
}

/* ─── Favorites / Recent Pages (localStorage) ─── */
function loadFavorites(): string[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('sidebar_favorites') || '[]'); } catch { return []; }
}

function saveFavorites(favs: string[]) {
    localStorage.setItem('sidebar_favorites', JSON.stringify(favs));
}

interface RecentPage { path: string; title: string; ts: number; }

function loadRecentPages(): RecentPage[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('recent_pages') || '[]'); } catch { return []; }
}

function saveRecentPages(pages: RecentPage[]) {
    localStorage.setItem('recent_pages', JSON.stringify(pages));
}

/* ─── Component ─── */
export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);
    const { profile } = useProfile();

    // Collapsible sections
    const activeSection = useMemo(() => getActiveSection(pathname), [pathname]);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(['Overview', activeSection]));

    // Favorites
    const [favorites, setFavorites] = useState<string[]>([]);
    useEffect(() => { setFavorites(loadFavorites()); }, []);

    // Recent pages
    const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
    useEffect(() => { setRecentPages(loadRecentPages()); }, []);

    // Track page visits
    useEffect(() => {
        if (pathname === '/login' || pathname === '/signup') return;
        const title = getPageTitle(pathname);
        setRecentPages(prev => {
            const filtered = prev.filter(p => p.path !== pathname);
            const updated = [{ path: pathname, title, ts: Date.now() }, ...filtered].slice(0, 8);
            saveRecentPages(updated);
            return updated;
        });
    }, [pathname]);

    // Auto-expand active section
    useEffect(() => {
        const section = getActiveSection(pathname);
        setExpandedSections(prev => {
            if (prev.has(section)) return prev;
            const next = new Set(prev);
            next.add(section);
            return next;
        });
    }, [pathname]);

    // SWR data
    const { data: sessionData } = useFetch<{ user: { email: string } }>('/api/auth/session');
    const userEmail = sessionData?.user?.email || '';

    const { data: settingsData } = useFetch<{ settings: { key: string; value?: string; has_value?: boolean }[] }>('/api/settings');

    const aiStatus = useMemo(() => {
        const settings = settingsData?.settings || [];
        const providerNames: Record<string, string> = {
            gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude',
            groq: 'Groq', mistral: 'Mistral', deepseek: 'DeepSeek', cohere: 'Cohere',
        };
        const defaultProvider = settings.find(s => s.key === 'default_ai_provider');
        const configuredProviders = settings
            .filter(s => s.key.endsWith('_api_key') && s.has_value)
            .map(s => s.key.replace('_api_key', ''));

        if (defaultProvider?.value && configuredProviders.includes(defaultProvider.value)) {
            return { provider: providerNames[defaultProvider.value] || defaultProvider.value, active: true };
        } else if (configuredProviders.length > 0) {
            const first = configuredProviders[0];
            return { provider: providerNames[first] || first, active: true };
        }
        return { provider: 'Not configured', active: false };
    }, [settingsData]);

    // Close on route change
    useEffect(() => { setMobileOpen(false); }, [pathname]);

    // Listen for toggle-sidebar event from keyboard shortcuts
    useEffect(() => {
        const handler = () => setMobileOpen(prev => !prev);
        window.addEventListener('toggle-sidebar', handler);
        return () => window.removeEventListener('toggle-sidebar', handler);
    }, []);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
        } catch {
            router.push('/login');
        }
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) { next.delete(section); } else { next.add(section); }
            return next;
        });
    };

    const toggleFavorite = useCallback((href: string) => {
        setFavorites(prev => {
            const next = prev.includes(href) ? prev.filter(f => f !== href) : [...prev, href];
            saveFavorites(next);
            return next;
        });
    }, []);

    const favoriteItems = useMemo(() => {
        return favorites
            .map(href => allNavItems.find(i => i.href === href))
            .filter(Boolean) as typeof allNavItems;
    }, [favorites]);

    // Detect OS for shortcut label
    const [isMac, setIsMac] = useState(false);
    useEffect(() => {
        setIsMac(navigator.platform?.toLowerCase().includes('mac') || false);
    }, []);

    return (
        <>
            {/* Mobile hamburger toggle */}
            <button
                className={`sidebar-toggle ${mobileOpen ? 'active' : ''}`}
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle navigation"
                aria-expanded={mobileOpen}
            >
                <span /><span /><span />
            </button>
            {/* Mobile backdrop */}
            <div
                className={`sidebar-backdrop ${mobileOpen ? 'show' : ''}`}
                onClick={() => setMobileOpen(false)}
                aria-hidden="true"
            />

            <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} role="navigation" aria-label="Main navigation">
                <div className="sidebar-logo">
                    <h1>RankMaster Pro</h1>
                    <span>SEO &bull; AEO &bull; GEO Automation</span>
                </div>

                {/* Quick Search trigger */}
                <button
                    className="sidebar-search-trigger"
                    onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
                    aria-label="Open command palette"
                >
                    <span style={{ opacity: 0.5 }}>🔍</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>Search everything...</span>
                    <kbd>{isMac ? '⌘' : 'Ctrl+'}K</kbd>
                </button>

                <nav className="sidebar-nav">
                    {/* ★ Favorites */}
                    {favoriteItems.length > 0 && (
                        <div className="sidebar-favorites">
                            <div className="sidebar-favorites-header">
                                <span>⭐ Favorites</span>
                            </div>
                            {favoriteItems.map(item => (
                                <Link
                                    key={`fav-${item.href}`}
                                    href={item.href}
                                    className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* 🕐 Recently Visited */}
                    {recentPages.length > 1 && (
                        <div className="sidebar-recent">
                            <div className="sidebar-recent-header">
                                <span>🕐 Recent</span>
                            </div>
                            {recentPages.slice(0, 5).map(page => (
                                <Link
                                    key={`recent-${page.path}`}
                                    href={page.path}
                                    className={`nav-item ${pathname === page.path ? 'active' : ''}`}
                                >
                                    <span className="nav-icon">
                                        {allNavItems.find(i => i.href === page.path)?.icon || '📄'}
                                    </span>
                                    {page.title}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Main navigation sections */}
                    {navSections.map((section) => {
                        const isExpanded = expandedSections.has(section.section);
                        const hasActiveItem = section.items.some(item => item.href === pathname);
                        return (
                            <div key={section.section}>
                                <button
                                    className={`sidebar-section-btn ${hasActiveItem ? 'has-active' : ''}`}
                                    onClick={() => toggleSection(section.section)}
                                    aria-expanded={isExpanded}
                                >
                                    <span>{section.icon} {section.section}</span>
                                    <span className={`section-chevron ${isExpanded ? 'expanded' : ''}`}>▶</span>
                                </button>
                                {isExpanded && section.items.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                                    >
                                        <span className="nav-icon">{item.icon}</span>
                                        {item.label}
                                        <button
                                            className={`nav-item-star ${favorites.includes(item.href) ? 'is-favorite' : ''}`}
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item.href); }}
                                            aria-label={favorites.includes(item.href) ? 'Remove from favorites' : 'Add to favorites'}
                                            title={favorites.includes(item.href) ? 'Remove from favorites' : 'Add to favorites'}
                                        >
                                            {favorites.includes(item.href) ? '★' : '☆'}
                                        </button>
                                    </Link>
                                ))}
                            </div>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-footer-meta">
                        <div className="text-sm text-muted">AI Status</div>
                        <NotificationBell />
                    </div>
                    <div className="sidebar-ai-status">
                        <span className={`sidebar-ai-dot ${aiStatus.active ? 'active' : 'inactive'}`} />
                        <span className="text-sm">{aiStatus.provider} {aiStatus.active ? 'Active' : ''}</span>
                    </div>

                    {/* User Profile Card */}
                    <Link href="/account" className="sidebar-user-card">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="" className="sidebar-avatar" />
                        ) : (
                            <div className="sidebar-avatar-placeholder">
                                {profile?.display_name?.[0]?.toUpperCase()
                                    || userEmail?.[0]?.toUpperCase()
                                    || '?'}
                            </div>
                        )}
                        <div className="sidebar-user-info">
                            <div className="sidebar-user-name">
                                {profile?.display_name || userEmail?.split('@')[0] || 'User'}
                            </div>
                            <div className="sidebar-user-email">
                                {userEmail || 'Not signed in'}
                            </div>
                        </div>
                    </Link>

                    <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                        🚪 Logout
                    </button>
                </div>
            </aside>
        </>
    );
}
