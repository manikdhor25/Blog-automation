'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

// --- Types ---
type Theme = 'dark' | 'light';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

// --- Context ---
const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    toggleTheme: () => {},
});

/**
 * Hook to access the current theme and toggle function.
 *
 * Usage:
 *   const { theme, toggleTheme } = useTheme();
 */
export function useTheme(): ThemeContextType {
    return useContext(ThemeContext);
}

/**
 * Theme provider that wraps the app to supply dark/light mode.
 *
 * Features:
 * - Detects system preference via prefers-color-scheme
 * - Persists user choice to localStorage ('theme' key)
 * - Sets `data-theme` attribute on <html> for CSS variable switching
 * - Adds `.theme-transitioning` class on <body> for 300ms during toggle
 * - Defaults to 'dark' when no preference or stored value exists
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    // Read stored preference or detect system preference on mount
    useEffect(() => {
        const stored = localStorage.getItem('theme') as Theme | null;
        if (stored === 'dark' || stored === 'light') {
            setTheme(stored);
        } else {
            const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
            setTheme(prefersLight ? 'light' : 'dark');
        }
        setMounted(true);
    }, []);

    // Sync theme to DOM and localStorage whenever it changes
    useEffect(() => {
        if (!mounted) return;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme, mounted]);

    // Listen for system preference changes while no stored value
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

        const handleChange = (e: MediaQueryListEvent) => {
            const stored = localStorage.getItem('theme');
            // Only follow system if user hasn't explicitly chosen
            if (!stored) {
                setTheme(e.matches ? 'light' : 'dark');
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const toggleTheme = () => {
        // Add transition class for smooth CSS transitions
        document.body.classList.add('theme-transitioning');
        setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
        setTimeout(() => {
            document.body.classList.remove('theme-transitioning');
        }, 300);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
