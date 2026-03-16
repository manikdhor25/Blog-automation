'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface PaletteItem {
    id: string;
    label: string;
    icon: string;
    shortcut?: string;
    category: 'page' | 'action' | 'setting';
    action: () => void;
}

export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const navigate = useCallback((path: string) => {
        setOpen(false);
        setQuery('');
        router.push(path);
    }, [router]);

    const items: PaletteItem[] = [
        // Pages
        { id: 'dashboard', label: 'Command Center (Dashboard)', icon: '🏠', category: 'page', action: () => navigate('/') },
        { id: 'create', label: 'Create Content', icon: '✍️', shortcut: 'C', category: 'page', action: () => navigate('/create') },
        { id: 'optimize', label: 'Optimize Content', icon: '⚡', category: 'page', action: () => navigate('/optimize') },
        { id: 'keywords', label: 'Keyword Intelligence', icon: '🔑', shortcut: 'K', category: 'page', action: () => navigate('/keywords') },
        { id: 'sites', label: 'Site Manager', icon: '🌐', category: 'page', action: () => navigate('/sites') },
        { id: 'analytics', label: 'Analytics', icon: '📊', category: 'page', action: () => navigate('/analytics') },
        { id: 'competitors', label: 'Competitor Analysis', icon: '🎯', category: 'page', action: () => navigate('/competitors') },
        { id: 'rank-tracking', label: 'Rank Tracking', icon: '📈', category: 'page', action: () => navigate('/rank-tracking') },
        { id: 'queue', label: 'Publish Queue', icon: '📋', category: 'page', action: () => navigate('/queue') },
        { id: 'calendar', label: 'Content Calendar', icon: '📅', category: 'page', action: () => navigate('/calendar') },
        { id: 'clusters', label: 'Topic Clusters', icon: '🧩', category: 'page', action: () => navigate('/clusters') },
        { id: 'decay', label: 'Content Decay', icon: '📉', category: 'page', action: () => navigate('/decay') },
        { id: 'backlinks', label: 'Backlink Intelligence', icon: '🔗', category: 'page', action: () => navigate('/backlinks') },
        { id: 'audit', label: 'Technical SEO Audit', icon: '🔍', category: 'page', action: () => navigate('/audit') },
        { id: 'cannibalization', label: 'Keyword Cannibalization', icon: '🎯', category: 'page', action: () => navigate('/cannibalization') },
        { id: 'briefs', label: 'Content Briefs', icon: '📋', category: 'page', action: () => navigate('/briefs') },
        { id: 'repurpose', label: 'Content Repurposing', icon: '🔄', category: 'page', action: () => navigate('/repurpose') },
        { id: 'programmatic', label: 'Programmatic SEO', icon: '⚡', category: 'page', action: () => navigate('/programmatic') },
        { id: 'link-graph', label: 'Link Graph', icon: '🕸️', category: 'page', action: () => navigate('/link-graph') },
        { id: 'image-seo', label: 'Image SEO', icon: '🖼️', category: 'page', action: () => navigate('/image-seo') },
        { id: 'versions', label: 'Content Versioning', icon: '📜', category: 'page', action: () => navigate('/versions') },
        { id: 'theme-scanner', label: 'Theme SEO Scanner', icon: '🎨', category: 'page', action: () => navigate('/theme-scanner') },
        { id: 'hreflang', label: 'Hreflang & Multi-Language', icon: '🌐', category: 'page', action: () => navigate('/hreflang') },
        { id: 'gsc', label: 'Google Search Console', icon: '📈', category: 'page', action: () => navigate('/gsc') },
        { id: 'plagiarism', label: 'AI Detection', icon: '🔬', category: 'page', action: () => navigate('/plagiarism') },
        { id: 'webhooks', label: 'Webhooks', icon: '🔔', category: 'page', action: () => navigate('/webhooks') },
        { id: 'team', label: 'Team & Collaboration', icon: '👥', category: 'page', action: () => navigate('/team') },
        { id: 'costs', label: 'API Cost Tracking', icon: '💰', category: 'page', action: () => navigate('/costs') },
        { id: 'export', label: 'Export Center', icon: '📦', category: 'page', action: () => navigate('/export') },

        // Settings
        { id: 'settings', label: 'Settings', icon: '⚙️', shortcut: 'S', category: 'setting', action: () => navigate('/settings') },

        // Actions
        { id: 'new-content', label: 'Write New Article', icon: '📝', category: 'action', action: () => navigate('/create') },
        { id: 'discover-kw', label: 'Discover Keywords', icon: '🤖', category: 'action', action: () => navigate('/keywords') },
        { id: 'run-audit', label: 'Run SEO Audit', icon: '🔍', category: 'action', action: () => navigate('/audit') },
        { id: 'check-ranks', label: 'Check Rankings', icon: '📊', category: 'action', action: () => navigate('/rank-tracking') },
    ];

    // Filter items
    const filtered = query.trim()
        ? items.filter(item =>
            item.label.toLowerCase().includes(query.toLowerCase()) ||
            item.id.toLowerCase().includes(query.toLowerCase())
        )
        : items;

    // Keyboard handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Open with Ctrl+K or Cmd+K
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            setOpen(prev => !prev);
            setQuery('');
            setSelectedIndex(0);
        }
        // Close with Escape
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
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Navigate with arrow keys + enter within the palette
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

    const grouped = {
        page: filtered.filter(i => i.category === 'page'),
        action: filtered.filter(i => i.category === 'action'),
        setting: filtered.filter(i => i.category === 'setting'),
    };

    let globalIndex = -1;

    const renderGroup = (title: string, items: PaletteItem[]) => {
        if (items.length === 0) return null;
        return (
            <div>
                <div style={{
                    fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: 'var(--text-muted)', padding: '8px 16px 4px',
                }}>{title}</div>
                {items.map(item => {
                    globalIndex++;
                    const idx = globalIndex;
                    return (
                        <button
                            key={item.id}
                            onClick={() => item.action()}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                width: '100%', padding: '10px 16px', border: 'none',
                                background: idx === selectedIndex ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                color: 'var(--text-primary)', cursor: 'pointer',
                                fontSize: '0.875rem', textAlign: 'left',
                                borderRadius: 8, transition: 'background 0.1s',
                            }}
                            onMouseEnter={() => setSelectedIndex(idx)}
                        >
                            <span style={{ fontSize: '1.1rem', width: 24, textAlign: 'center' }}>{item.icon}</span>
                            <span style={{ flex: 1, fontWeight: 500 }}>{item.label}</span>
                            {item.shortcut && (
                                <kbd style={{
                                    fontSize: '0.65rem', padding: '2px 6px',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 4, color: 'var(--text-muted)',
                                    fontFamily: 'var(--font-mono)',
                                }}>{item.shortcut}</kbd>
                            )}
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
                onClick={() => setOpen(false)}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(4px)',
                    animation: 'fadeIn 0.15s ease',
                }}
            />

            {/* Palette */}
            <div style={{
                position: 'fixed',
                top: '20%', left: '50%', transform: 'translateX(-50%)',
                width: 520, maxWidth: '90vw', maxHeight: '60vh',
                zIndex: 9999,
                background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.98), rgba(15, 15, 25, 0.99))',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 16,
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
                display: 'flex', flexDirection: 'column',
                animation: 'paletteIn 0.2s ease',
                overflow: 'hidden',
            }}>
                {/* Search Input */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '14px 16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                }}>
                    <span style={{ fontSize: '1rem', opacity: 0.5 }}>🔍</span>
                    <input
                        ref={inputRef}
                        placeholder="Search pages, actions..."
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        onKeyDown={handleInputKeyDown}
                        style={{
                            flex: 1, background: 'transparent', border: 'none',
                            color: 'var(--text-primary)', fontSize: '0.95rem',
                            outline: 'none', fontFamily: 'var(--font-primary)',
                        }}
                    />
                    <kbd style={{
                        fontSize: '0.6rem', padding: '2px 6px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 4, color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                    }}>ESC</kbd>
                </div>

                {/* Results */}
                <div style={{ overflowY: 'auto', padding: '8px', maxHeight: 400 }}>
                    {filtered.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: 32,
                            color: 'var(--text-muted)', fontSize: '0.875rem',
                        }}>
                            No results for &ldquo;{query}&rdquo;
                        </div>
                    ) : (
                        <>
                            {renderGroup('Pages', grouped.page)}
                            {renderGroup('Actions', grouped.action)}
                            {renderGroup('Settings', grouped.setting)}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '8px 16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex', gap: 16, alignItems: 'center',
                    fontSize: '0.7rem', color: 'var(--text-muted)',
                }}>
                    <span>↑↓ Navigate</span>
                    <span>↵ Open</span>
                    <span>ESC Close</span>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes paletteIn {
                    from { opacity: 0; transform: translateX(-50%) scale(0.96) translateY(-8px); }
                    to { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
                }
            `}</style>
        </>
    );
}
