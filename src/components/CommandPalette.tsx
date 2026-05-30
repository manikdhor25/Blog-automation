'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface PaletteItem {
    id: string;
    label: string;
    icon: string;
    shortcut?: string;
    category: 'page' | 'action' | 'setting' | 'recent';
    action: () => void;
}

/* ─── All navigation items (synced with Sidebar) ─── */
const ALL_PAGES: { id: string; label: string; icon: string; path: string }[] = [
    // Overview
    { id: 'dashboard', label: 'Command Center (Dashboard)', icon: '⚡', path: '/' },
    { id: 'portfolio', label: 'Portfolio Dashboard', icon: '🌐', path: '/portfolio' },
    { id: 'onboarding', label: 'Setup Guide', icon: '🚀', path: '/onboarding' },
    { id: 'revenue-modeler', label: 'Revenue Modeler', icon: '🔮', path: '/revenue-modeler' },
    { id: 'rank-history', label: 'Rank History', icon: '📈', path: '/rank-history' },
    // Content
    { id: 'create', label: 'Content Writer', icon: '📝', path: '/create' },
    { id: 'auto-blogger', label: 'Auto-Blogger', icon: '🤖', path: '/auto-blogger' },
    { id: 'optimize', label: 'Optimizer', icon: '✏️', path: '/optimize' },
    { id: 'briefs', label: 'Content Briefs', icon: '📋', path: '/briefs' },
    { id: 'content-pipeline', label: 'Content Pipeline', icon: '🚀', path: '/content-pipeline' },
    { id: 'queue', label: 'Publish Queue', icon: '📤', path: '/queue' },
    { id: 'calendar', label: 'Content Calendar', icon: '📅', path: '/calendar' },
    { id: 'templates', label: 'Post Templates', icon: '📋', path: '/templates' },
    { id: 'repurpose', label: 'Content Repurposing', icon: '🔄', path: '/repurpose' },
    { id: 'programmatic', label: 'Programmatic SEO', icon: '⚡', path: '/programmatic' },
    { id: 'bulk-programmatic', label: 'Bulk Generator', icon: '🚀', path: '/bulk-programmatic' },
    { id: 'transcript-to-post', label: 'Transcript → Post', icon: '🎙️', path: '/transcript-to-post' },
    { id: 'versions', label: 'Content Versioning', icon: '📜', path: '/versions' },
    { id: 'content-records', label: 'Content Records', icon: '📊', path: '/content-records' },
    // SEO
    { id: 'keywords', label: 'Keyword Intelligence', icon: '🔍', path: '/keywords' },
    { id: 'clusters', label: 'Topic Clusters', icon: '🏗️', path: '/clusters' },
    { id: 'rank-tracking', label: 'Rank Tracking', icon: '📈', path: '/rank-tracking' },
    { id: 'audit', label: 'Technical SEO Audit', icon: '🩺', path: '/audit' },
    { id: 'serp-data', label: 'SERP Data', icon: '🔎', path: '/serp-data' },
    { id: 'seo-predictor', label: 'SEO Predictor', icon: '🔮', path: '/seo-predictor' },
    { id: 'cluster-autopilot', label: 'Cluster Auto-Pilot', icon: '🤖', path: '/cluster-autopilot' },
    { id: 'nlp-brief', label: 'NLP Brief', icon: '📋', path: '/nlp-brief' },
    { id: 'topical-authority', label: 'Topical Authority', icon: '🔬', path: '/topical-authority' },
    { id: 'keyword-alerts', label: 'Rank Alerts', icon: '🔔', path: '/keyword-alerts' },
    { id: 'keyword-cluster', label: 'Keyword Clustering', icon: '🗂️', path: '/keyword-cluster' },
    { id: 'cannibalization', label: 'Keyword Cannibalization', icon: '🎯', path: '/cannibalization' },
    { id: 'gap-analyzer', label: 'Topic Gaps', icon: '🕳️', path: '/gap-analyzer' },
    { id: 'schema-builder', label: 'Schema Builder', icon: '🏷️', path: '/schema-builder' },
    { id: 'image-seo', label: 'Image SEO', icon: '🖼️', path: '/image-seo' },
    { id: 'niche-wizard', label: 'Niche Wizard', icon: '🔮', path: '/niche-wizard' },
    // Analytics
    { id: 'analytics', label: 'Analytics', icon: '📊', path: '/analytics' },
    { id: 'health-score', label: 'Site Health Score', icon: '🏥', path: '/health-score' },
    { id: 'gsc', label: 'Google Search Console', icon: '📈', path: '/gsc' },
    { id: 'ga4', label: 'Google Analytics 4', icon: '📊', path: '/ga4' },
    { id: 'cwv', label: 'Core Web Vitals', icon: '⚡', path: '/cwv' },
    { id: 'decay', label: 'Content Decay Alerts', icon: '⏰', path: '/decay' },
    { id: 'volatility', label: 'SERP Volatility', icon: '🌊', path: '/volatility' },
    { id: 'algo-tracker', label: 'Algorithm Tracker', icon: '📊', path: '/algo-tracker' },
    { id: 'ab-tests', label: 'A/B Split Tests', icon: '🧪', path: '/ab-tests' },
    { id: 'forecaster', label: 'Revenue Forecaster', icon: '🔮', path: '/forecaster' },
    { id: 'reports', label: 'Client Reports', icon: '📋', path: '/reports' },
    // Links
    { id: 'backlinks', label: 'Backlink Intelligence', icon: '🔗', path: '/backlinks' },
    { id: 'internal-links', label: 'Internal Links', icon: '🔗', path: '/internal-links' },
    { id: 'link-graph', label: 'Link Graph', icon: '🕸️', path: '/link-graph' },
    { id: 'link-builder', label: 'Internal Link Builder', icon: '🕸️', path: '/link-builder' },
    { id: 'link-fixer', label: 'Link Fixer', icon: '🔧', path: '/link-fixer' },
    { id: 'backlink-crm', label: 'Backlink CRM', icon: '🔗', path: '/backlink-crm' },
    { id: 'backlink-gap', label: 'Backlink Gap Analysis', icon: '🔍', path: '/backlink-gap' },
    { id: 'redirects', label: 'Redirect Manager', icon: '🔀', path: '/redirects' },
    { id: 'canonical', label: 'Canonical Manager', icon: '🔗', path: '/canonical' },
    { id: 'hreflang', label: 'Hreflang & Multi-Language', icon: '🌐', path: '/hreflang' },
    // Monetize
    { id: 'affiliates', label: 'Affiliate Dashboard', icon: '💰', path: '/affiliates' },
    { id: 'affiliate-earnings', label: 'Earnings Dashboard', icon: '💵', path: '/affiliate-earnings' },
    { id: 'link-manager', label: 'Link Manager', icon: '🔗', path: '/link-manager' },
    { id: 'comparison', label: 'Comparison Tables', icon: '📊', path: '/comparison' },
    { id: 'review-generator', label: 'Review Generator', icon: '⭐', path: '/review-generator' },
    { id: 'deals', label: 'Deals & Coupons', icon: '🎟️', path: '/deals' },
    { id: 'ad-revenue', label: 'Ad Revenue', icon: '📺', path: '/ad-revenue' },
    { id: 'digital-products', label: 'Digital Products', icon: '💿', path: '/digital-products' },
    // Growth
    { id: 'trending', label: 'Trending Radar', icon: '📡', path: '/trending' },
    { id: 'idea-generator', label: 'Idea Generator', icon: '💡', path: '/idea-generator' },
    { id: 'competitors', label: 'Competitor Analysis', icon: '🏢', path: '/competitors' },
    { id: 'competitor-spy', label: 'Competitor Spy', icon: '🕵️', path: '/competitor-spy' },
    { id: 'outreach', label: 'Outreach CRM', icon: '🎯', path: '/outreach' },
    { id: 'social', label: 'Social Publisher', icon: '📱', path: '/social' },
    { id: 'youtube-seo', label: 'YouTube SEO', icon: '▶️', path: '/youtube-seo' },
    // System
    { id: 'sites', label: 'Site Manager', icon: '🌐', path: '/sites' },
    { id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings' },
    { id: 'account', label: 'Account', icon: '👤', path: '/account' },
    { id: 'costs', label: 'API Cost Tracking', icon: '💰', path: '/costs' },
    { id: 'export', label: 'Export Center', icon: '📦', path: '/export' },
    { id: 'webhooks', label: 'Webhooks', icon: '🔔', path: '/webhooks' },
    { id: 'playground', label: 'AI Playground', icon: '🧪', path: '/playground' },
    { id: 'plagiarism', label: 'AI Detection', icon: '🔬', path: '/plagiarism' },
    { id: 'team-manager', label: 'Team Manager', icon: '👥', path: '/team-manager' },
];

/* ─── Fuzzy matching ─── */
function fuzzyMatch(text: string, query: string): number {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    // Exact match
    if (lower === q) return 100;
    // Starts with
    if (lower.startsWith(q)) return 90;
    // Contains
    if (lower.includes(q)) return 70;
    // Fuzzy: all chars appear in order
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i++) {
        if (lower[i] === q[qi]) qi++;
    }
    if (qi === q.length) return 50;
    // Word match: any word starts with query
    const words = lower.split(/[\s\-_/]+/);
    for (const w of words) {
        if (w.startsWith(q)) return 60;
    }
    return 0;
}

/* ─── Load recent pages from localStorage ─── */
function getRecentPages(): { path: string; title: string }[] {
    if (typeof window === 'undefined') return [];
    try {
        const pages = JSON.parse(localStorage.getItem('recent_pages') || '[]');
        return pages.slice(0, 5);
    } catch { return []; }
}

export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const navigate = useCallback((path: string) => {
        setOpen(false);
        setQuery('');
        router.push(path);
    }, [router]);

    // Build items list with recent pages
    const items = useMemo((): PaletteItem[] => {
        const recentPages = getRecentPages();
        const result: PaletteItem[] = [];

        // Recent items (only when no query)
        if (!query.trim()) {
            recentPages.forEach(page => {
                const navItem = ALL_PAGES.find(p => p.path === page.path);
                result.push({
                    id: `recent-${page.path}`,
                    label: page.title,
                    icon: navItem?.icon || '📄',
                    category: 'recent',
                    action: () => navigate(page.path),
                });
            });
        }

        // Pages
        ALL_PAGES.forEach(page => {
            result.push({
                id: page.id,
                label: page.label,
                icon: page.icon,
                category: 'page',
                action: () => navigate(page.path),
            });
        });

        // Quick Actions
        result.push(
            { id: 'action-new-content', label: 'Write New Article', icon: '📝', shortcut: 'Ctrl+N', category: 'action', action: () => navigate('/create') },
            { id: 'action-discover-kw', label: 'Discover Keywords', icon: '🤖', category: 'action', action: () => navigate('/keywords') },
            { id: 'action-run-audit', label: 'Run SEO Audit', icon: '🔍', category: 'action', action: () => navigate('/audit') },
            { id: 'action-check-ranks', label: 'Check Rankings', icon: '📊', category: 'action', action: () => navigate('/rank-tracking') },
            { id: 'action-auto-blog', label: 'Start Auto-Blogger', icon: '🤖', category: 'action', action: () => navigate('/auto-blogger') },
            { id: 'action-optimize', label: 'Optimize a Post', icon: '✏️', category: 'action', action: () => navigate('/optimize') },
        );

        // Settings
        result.push(
            { id: 'settings', label: 'Settings', icon: '⚙️', shortcut: 'S', category: 'setting', action: () => navigate('/settings') },
            { id: 'account', label: 'Account Settings', icon: '👤', category: 'setting', action: () => navigate('/account') },
        );

        return result;
    }, [navigate, query]);

    // Filter and score items
    const filtered = useMemo(() => {
        if (!query.trim()) return items;
        return items
            .map(item => ({ item, score: Math.max(fuzzyMatch(item.label, query), fuzzyMatch(item.id, query)) }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .map(({ item }) => item);
    }, [items, query]);

    // Reset selection when results change
    useEffect(() => { setSelectedIndex(0); }, [filtered.length]);

    // Keyboard handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            setOpen(prev => !prev);
            setQuery('');
            setSelectedIndex(0);
        }
        if (e.key === 'Escape') {
            setOpen(false);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Focus input when opened
    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 50);
    }, [open]);

    // Scroll selected item into view
    useEffect(() => {
        if (!resultsRef.current) return;
        const selected = resultsRef.current.querySelector('[data-selected="true"]');
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    // Input key navigation
    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && filtered[selectedIndex]) {
            e.preventDefault();
            filtered[selectedIndex].action();
        }
    };

    if (!open) return null;

    // Group items
    const grouped = {
        recent: filtered.filter(i => i.category === 'recent'),
        page: filtered.filter(i => i.category === 'page'),
        action: filtered.filter(i => i.category === 'action'),
        setting: filtered.filter(i => i.category === 'setting'),
    };

    let globalIndex = -1;

    const renderGroup = (title: string, groupItems: PaletteItem[]) => {
        if (groupItems.length === 0) return null;
        return (
            <div>
                <div className="command-palette-group-title">{title}</div>
                {groupItems.map(item => {
                    globalIndex++;
                    const idx = globalIndex;
                    return (
                        <button
                            key={item.id}
                            className={`command-palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                            onClick={() => item.action()}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            data-selected={idx === selectedIndex}
                        >
                            <span className="item-icon">{item.icon}</span>
                            <span className="item-label">{item.label}</span>
                            {item.shortcut && <kbd className="item-shortcut">{item.shortcut}</kbd>}
                        </button>
                    );
                })}
            </div>
        );
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="command-palette-overlay"
                onClick={() => setOpen(false)}
                aria-hidden="true"
            />

            {/* Palette */}
            <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
                {/* Search Input */}
                <div className="command-palette-input">
                    <span style={{ fontSize: '1rem', opacity: 0.5 }}>🔍</span>
                    <input
                        ref={inputRef}
                        placeholder="Search pages, actions, tools..."
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        onKeyDown={handleInputKeyDown}
                        aria-label="Search command palette"
                        autoComplete="off"
                    />
                    <kbd className="item-shortcut">ESC</kbd>
                </div>

                {/* Results */}
                <div className="command-palette-results" ref={resultsRef} role="listbox">
                    {filtered.length === 0 ? (
                        <div className="command-palette-empty">
                            No results for &ldquo;{query}&rdquo;
                            <div className="text-sm text-muted" style={{ marginTop: 8 }}>
                                Try a different search term
                            </div>
                        </div>
                    ) : (
                        <>
                            {renderGroup('🕐 Recent', grouped.recent)}
                            {renderGroup('Pages', grouped.page)}
                            {renderGroup('Quick Actions', grouped.action)}
                            {renderGroup('Settings', grouped.setting)}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="command-palette-footer">
                    <span>↑↓ Navigate</span>
                    <span>↵ Open</span>
                    <span>ESC Close</span>
                    <span style={{ marginLeft: 'auto' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                </div>
            </div>
        </>
    );
}
