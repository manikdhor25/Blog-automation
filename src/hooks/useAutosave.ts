'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// --- Types ---
type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutosaveOptions<T> {
    /** The data to autosave. Saves are triggered when this value changes. */
    data: T;
    /** Async function called to persist the data. */
    onSave: (data: T) => Promise<void>;
    /** Debounce delay in milliseconds. Default: 2000. */
    delay?: number;
    /** Whether autosave is enabled. Default: true. */
    enabled?: boolean;
}

interface UseAutosaveReturn {
    /** Current save status. */
    status: AutosaveStatus;
    /** Timestamp of the last successful save, or null if never saved. */
    lastSaved: Date | null;
}

/**
 * Debounced autosave hook.
 *
 * Usage:
 *   const { status, lastSaved } = useAutosave({
 *       data: formData,
 *       onSave: async (data) => { await fetch('/api/save', { method: 'POST', body: JSON.stringify(data) }); },
 *       delay: 2000,
 *       enabled: isDirty,
 *   });
 *
 * Features:
 * - Debounces saves by `delay` ms (default 2000)
 * - Reports status: 'idle' → 'saving' → 'saved' (3s) → 'idle'
 * - Catches errors and sets status to 'error'
 * - Skips initial render (won't save on mount)
 * - Cleans up timers on unmount
 */
export function useAutosave<T>({
    data,
    onSave,
    delay = 2000,
    enabled = true,
}: UseAutosaveOptions<T>): UseAutosaveReturn {
    const [status, setStatus] = useState<AutosaveStatus>('idle');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // Track whether we've mounted (skip save on first render)
    const isFirstRender = useRef(true);
    // Keep latest onSave in a ref to avoid re-triggering the effect
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;
    // Timer refs for cleanup
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const performSave = useCallback(async (dataToSave: T) => {
        setStatus('saving');
        try {
            await onSaveRef.current(dataToSave);
            setLastSaved(new Date());
            setStatus('saved');

            // Reset to idle after 3 seconds
            if (savedTimer.current) clearTimeout(savedTimer.current);
            savedTimer.current = setTimeout(() => {
                setStatus('idle');
            }, 3000);
        } catch {
            setStatus('error');
        }
    }, []);

    useEffect(() => {
        // Skip save on initial mount
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        if (!enabled) return;

        // Clear any pending debounce
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // Schedule a new save
        debounceTimer.current = setTimeout(() => {
            performSave(data);
        }, delay);

        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, [data, delay, enabled, performSave]);

    // Cleanup all timers on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            if (savedTimer.current) clearTimeout(savedTimer.current);
        };
    }, []);

    return { status, lastSaved };
}

export type { AutosaveStatus, UseAutosaveOptions, UseAutosaveReturn };
export default useAutosave;
