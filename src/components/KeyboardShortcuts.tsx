'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// --- Types ---
interface Shortcut {
    /** Unique key combo string, e.g. 'Ctrl+K' */
    keys: string;
    /** Human-readable description */
    description: string;
    /** Category for grouping in the help modal */
    category: 'navigation' | 'action' | 'general';
}

interface ShortcutsContextType {
    /** Show the shortcuts help modal */
    showHelp: () => void;
    /** Hide the shortcuts help modal */
    hideHelp: () => void;
    /** Whether the help modal is currently visible */
    isHelpOpen: boolean;
    /** All registered shortcuts */
    shortcuts: Shortcut[];
}

// --- Shortcut Definitions ---
const SHORTCUTS: Shortcut[] = [
    { keys: 'Ctrl+K', description: 'Open Command Palette', category: 'general' },
    { keys: 'Ctrl+N', description: 'Create new post', category: 'navigation' },
    { keys: 'Ctrl+B', description: 'Toggle sidebar', category: 'action' },
    { keys: 'Ctrl+/', description: 'Show keyboard shortcuts', category: 'general' },
];

// --- Context ---
const ShortcutsContext = createContext<ShortcutsContextType>({
    showHelp: () => {},
    hideHelp: () => {},
    isHelpOpen: false,
    shortcuts: SHORTCUTS,
});

/**
 * Hook to access the keyboard shortcuts context.
 *
 * Usage:
 *   const { showHelp, shortcuts } = useShortcuts();
 */
export function useShortcuts(): ShortcutsContextType {
    return useContext(ShortcutsContext);
}

/**
 * Keyboard shortcuts provider.
 * Registers global key listeners for navigation and actions.
 *
 * Shortcuts:
 * - Ctrl+K: Command Palette (handled by CommandPalette, listed in help only)
 * - Ctrl+N: Navigate to /create
 * - Ctrl+B: Toggle sidebar (dispatches 'toggle-sidebar' custom event)
 * - Ctrl+/: Show shortcuts help modal
 */
export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const router = useRouter();

    const showHelp = useCallback(() => setIsHelpOpen(true), []);
    const hideHelp = useCallback(() => setIsHelpOpen(false), []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrl = e.ctrlKey || e.metaKey;
            if (!isCtrl) return;

            // Don't intercept when typing in inputs/textareas (except for our shortcuts)
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            switch (e.key) {
                case 'n':
                case 'N':
                    // Ctrl+N: Navigate to create page
                    e.preventDefault();
                    router.push('/create');
                    break;

                case 'b':
                case 'B':
                    // Ctrl+B: Toggle sidebar
                    // Skip if user is in a rich text editor where Ctrl+B = bold
                    if (isInput) return;
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('toggle-sidebar'));
                    break;

                case '/':
                    // Ctrl+/: Show shortcuts help
                    e.preventDefault();
                    setIsHelpOpen(prev => !prev);
                    break;

                // Ctrl+K is handled by CommandPalette — we don't intercept it here
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router]);

    // Close on Escape
    useEffect(() => {
        if (!isHelpOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setIsHelpOpen(false);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isHelpOpen]);

    const contextValue: ShortcutsContextType = {
        showHelp,
        hideHelp,
        isHelpOpen,
        shortcuts: SHORTCUTS,
    };

    return (
        <ShortcutsContext.Provider value={contextValue}>
            {children}
            {isHelpOpen && <ShortcutsHelp onClose={hideHelp} />}
        </ShortcutsContext.Provider>
    );
}

// --- Category labels ---
const CATEGORY_LABELS: Record<Shortcut['category'], string> = {
    general: 'General',
    navigation: 'Navigation',
    action: 'Actions',
};

// --- Help Modal ---
function ShortcutsHelp({ onClose }: { onClose: () => void }) {
    // Group shortcuts by category
    const grouped = SHORTCUTS.reduce<Record<string, Shortcut[]>>((acc, shortcut) => {
        const cat = shortcut.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(shortcut);
        return acc;
    }, {});

    const categoryOrder: Shortcut['category'][] = ['general', 'navigation', 'action'];

    return (
        <>
            {/* Overlay */}
            <div
                className="modal-overlay"
                onClick={onClose}
                style={{ zIndex: 9990 }}
            />

            {/* Modal */}
            <div
                className="modal"
                role="dialog"
                aria-label="Keyboard shortcuts"
                style={{
                    zIndex: 9991,
                    maxWidth: 480,
                    width: '90vw',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 20,
                }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <span>⌨️</span>
                        Keyboard Shortcuts
                    </h2>
                    <button
                        onClick={onClose}
                        className="btn btn-secondary btn-sm"
                        aria-label="Close shortcuts help"
                    >
                        ESC
                    </button>
                </div>

                {/* Shortcut Groups */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {categoryOrder.map(category => {
                        const items = grouped[category];
                        if (!items || items.length === 0) return null;
                        return (
                            <div key={category}>
                                <div style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    color: 'var(--text-muted)',
                                    marginBottom: 8,
                                }}>
                                    {CATEGORY_LABELS[category]}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {items.map(shortcut => (
                                        <ShortcutRow key={shortcut.keys} shortcut={shortcut} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer Tip */}
                <div style={{
                    marginTop: 20,
                    paddingTop: 16,
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                }}>
                    Press <kbd style={{
                        padding: '2px 6px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                    }}>Ctrl</kbd> + <kbd style={{
                        padding: '2px 6px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                    }}>/</kbd> to toggle this panel
                </div>
            </div>
        </>
    );
}

// --- Shortcut Row ---
function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
    const keys = shortcut.keys.split('+');

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            transition: 'background 0.15s',
        }}>
            <span style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                fontWeight: 500,
            }}>
                {shortcut.description}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {keys.map((key, i) => (
                    <React.Fragment key={key}>
                        {i > 0 && (
                            <span style={{
                                fontSize: '0.65rem',
                                color: 'var(--text-muted)',
                                opacity: 0.5,
                            }}>+</span>
                        )}
                        <kbd style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 28,
                            padding: '3px 8px',
                            fontSize: '0.7rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 6,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }}>
                            {key}
                        </kbd>
                    </React.Fragment>
                ))}
            </span>
        </div>
    );
}
