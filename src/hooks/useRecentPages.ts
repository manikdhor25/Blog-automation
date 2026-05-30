'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// --- Types ---
interface RecentPage {
    path: string;
    title: string;
    timestamp: number;
}

const STORAGE_KEY = 'recent_pages';
const MAX_PAGES = 10;

/**
 * Derive a human-readable title from a pathname.
 * e.g. '/rank-tracking' → 'Rank Tracking', '/' → 'Dashboard'
 */
function titleFromPathname(pathname: string): string {
    if (pathname === '/') return 'Dashboard';
    const segment = pathname.split('/').filter(Boolean).pop() || '';
    return segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Read recent pages from localStorage, returning an empty array on failure.
 */
function readStoredPages(): RecentPage[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch {
        return [];
    }
}

/**
 * Write recent pages to localStorage.
 */
function writeStoredPages(pages: RecentPage[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    } catch {
        // Storage full or unavailable — silently ignore
    }
}

/**
 * Hook that tracks recently visited pages.
 *
 * Usage:
 *   const { recentPages, addPage, clearPages } = useRecentPages();
 *
 * Features:
 * - Stores up to 10 recent pages in localStorage
 * - Deduplicates by path (same path updates timestamp)
 * - Returns pages sorted most-recent-first
 * - Auto-records current page on mount via usePathname()
 */
export function useRecentPages() {
    const pathname = usePathname();
    const [recentPages, setRecentPages] = useState<RecentPage[]>([]);

    // Load stored pages on mount
    useEffect(() => {
        setRecentPages(readStoredPages());
    }, []);

    /**
     * Add or update a page visit. If the path already exists,
     * its timestamp is updated and it moves to the top.
     */
    const addPage = useCallback((path: string, title: string) => {
        setRecentPages(prev => {
            const now = Date.now();
            // Remove existing entry for this path (dedup)
            const filtered = prev.filter(p => p.path !== path);
            // Prepend new entry and cap at MAX_PAGES
            const updated = [{ path, title, timestamp: now }, ...filtered].slice(0, MAX_PAGES);
            writeStoredPages(updated);
            return updated;
        });
    }, []);

    /**
     * Clear all recent pages.
     */
    const clearPages = useCallback(() => {
        setRecentPages([]);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    }, []);

    // Auto-record current pathname on mount / pathname change
    useEffect(() => {
        if (pathname) {
            const title = titleFromPathname(pathname);
            addPage(pathname, title);
        }
    }, [pathname, addPage]);

    // Always return sorted by most recent first
    const sorted = [...recentPages].sort((a, b) => b.timestamp - a.timestamp);

    return {
        recentPages: sorted,
        addPage,
        clearPages,
    };
}

export type { RecentPage };
export default useRecentPages;
