'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
    {
        section: 'Overview',
        items: [
            { href: '/', label: 'Command Center', icon: '⚡' },
        ],
    },
    {
        section: 'Manage',
        items: [
            { href: '/sites', label: 'Sites', icon: '🌐' },
            { href: '/keywords', label: 'Keyword Intel', icon: '🔍' },
            { href: '/clusters', label: 'Topic Clusters', icon: '🏗️' },
            { href: '/rank-tracking', label: 'Rank Tracker', icon: '📈' },
        ],
    },
    {
        section: 'Content',
        items: [
            { href: '/create', label: 'Content Writer', icon: '📝' },
            { href: '/optimize', label: 'Optimizer', icon: '✏️' },
            { href: '/optimized', label: 'Optimized Content', icon: '📄' },
            { href: '/briefs', label: 'Content Briefs', icon: '📋' },
            { href: '/repurpose', label: 'Repurpose', icon: '🔄' },
            { href: '/image-seo', label: 'Image SEO', icon: '🖼️' },
            { href: '/programmatic', label: 'Programmatic SEO', icon: '⚡' },
            { href: '/syndication', label: 'Syndication', icon: '🔄' },
            { href: '/versions', label: 'Versioning', icon: '📜' },
            { href: '/queue', label: 'Publish Queue', icon: '📤' },
            { href: '/content-records', label: 'Content Records', icon: '📊' },
        ],
    },
    {
        section: 'Insights',
        items: [
            { href: '/decay', label: 'Decay Alerts', icon: '⏰' },
            { href: '/calendar', label: 'Content Calendar', icon: '📅' },
            { href: '/analytics', label: 'Analytics', icon: '📊' },
            { href: '/competitors', label: 'Competitors', icon: '🏢' },
            { href: '/backlinks', label: 'Backlinks', icon: '🔗' },
            { href: '/affiliates', label: 'Affiliates', icon: '💰' },
            { href: '/ab-tests', label: 'A/B Tests', icon: '🧪' },
            { href: '/audit', label: 'SEO Audit', icon: '🩺' },
            { href: '/cannibalization', label: 'Cannibalization', icon: '🎯' },
            { href: '/link-graph', label: 'Link Graph', icon: '🕸️' },
            { href: '/internal-links', label: 'Internal Links', icon: '🔗' },
            { href: '/gsc', label: 'Search Console', icon: '📈' },
            { href: '/theme-scanner', label: 'Theme Scanner', icon: '🎨' },
            { href: '/hreflang', label: 'Hreflang', icon: '🌐' },
        ],
    },
    {
        section: 'System',
        items: [
            { href: '/plagiarism', label: 'AI Detection', icon: '🔬' },
            { href: '/costs', label: 'API Costs', icon: '💰' },
            { href: '/export', label: 'Export', icon: '📥' },
            { href: '/webhooks', label: 'Webhooks', icon: '🔔' },
            { href: '/team', label: 'Team', icon: '👥' },
            { href: '/guide', label: 'Setup Guide', icon: '📖' },
            { href: '/settings', label: 'Settings', icon: '⚙️' },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [aiStatus, setAiStatus] = useState<{ provider: string; active: boolean }>({ provider: 'Not configured', active: false });
    const [mobileOpen, setMobileOpen] = useState(false);
    const [userEmail, setUserEmail] = useState('');

    // Close sidebar on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    // Fetch user email
    useEffect(() => {
        fetch('/api/auth/session')
            .then(r => r.json())
            .then(d => { if (d.user?.email) setUserEmail(d.user.email); })
            .catch(() => { });
    }, []);

    useEffect(() => {
        fetch('/api/settings')
            .then(r => r.json())
            .then(data => {
                const settings = data.settings || [];
                const defaultProvider = settings.find((s: { key: string }) => s.key === 'default_ai_provider');
                const providerNames: Record<string, string> = {
                    gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude',
                    groq: 'Groq', mistral: 'Mistral', deepseek: 'DeepSeek', cohere: 'Cohere',
                };

                // Check which providers have keys
                const configuredProviders = settings
                    .filter((s: { key: string; has_value: boolean }) => s.key.endsWith('_api_key') && s.has_value)
                    .map((s: { key: string }) => s.key.replace('_api_key', ''));

                if (defaultProvider?.value && configuredProviders.includes(defaultProvider.value)) {
                    setAiStatus({ provider: providerNames[defaultProvider.value] || defaultProvider.value, active: true });
                } else if (configuredProviders.length > 0) {
                    const first = configuredProviders[0];
                    setAiStatus({ provider: providerNames[first] || first, active: true });
                } else {
                    setAiStatus({ provider: 'Not configured', active: false });
                }
            })
            .catch(() => { });
    }, []);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
        } catch {
            router.push('/login');
        }
    };

    return (
        <>
            {/* Mobile hamburger toggle */}
            <button className={`sidebar-toggle ${mobileOpen ? 'active' : ''}`} onClick={() => setMobileOpen(!mobileOpen)}>
                <span /><span /><span />
            </button>
            {/* Mobile backdrop */}
            <div className={`sidebar-backdrop ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} />

            <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    <h1>RankMaster Pro</h1>
                    <span>SEO &bull; AEO &bull; GEO Automation</span>
                </div>

                {/* Quick Search trigger */}
                <button
                    onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: 'calc(100% - 24px)', margin: '0 12px 12px',
                        padding: '8px 12px', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        fontSize: '0.8rem', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                >
                    <span style={{ opacity: 0.5 }}>🔍</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>Search...</span>
                    <kbd style={{
                        fontSize: '0.6rem', padding: '1px 5px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 3, fontFamily: 'var(--font-mono)',
                    }}>⌘K</kbd>
                </button>

                <nav className="sidebar-nav">
                    {navItems.map((section) => (
                        <div key={section.section}>
                            <div className="nav-section-label">{section.section}</div>
                            {section.items.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    ))}
                </nav>

                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div className="text-sm text-muted" style={{ marginBottom: 4 }}>AI Status</div>
                    <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: aiStatus.active ? 'var(--accent-success)' : 'var(--accent-danger)', display: 'inline-block' }}></span>
                        <span className="text-sm">{aiStatus.provider} {aiStatus.active ? 'Active' : ''}</span>
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        marginBottom: 12, padding: '8px 0',
                    }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                        }}>
                            {userEmail ? userEmail[0].toUpperCase() : '?'}
                        </div>
                        <div style={{ overflow: 'hidden', flex: 1 }}>
                            <div className="text-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {userEmail || 'Not signed in'}
                            </div>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                        🚪 Logout
                    </button>
                </div>
            </aside>
        </>
    );
}
