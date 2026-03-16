'use client';

import useSWR, { SWRConfiguration } from 'swr';

// Universal JSON fetcher
const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        const error = new Error('Fetch failed');
        try {
            const body = await res.json();
            (error as Error & { info?: unknown }).info = body;
        } catch { /* ignore */ }
        throw error;
    }
    return res.json();
};

/**
 * Reusable SWR-powered data fetching hook.
 *
 * Usage:
 *   const { data, error, isLoading, mutate } = useFetch<{ keywords: Keyword[] }>('/api/keywords');
 *   const keywords = data?.keywords || [];
 *
 * Features:
 * - Auto-revalidation on focus
 * - Deduplication of identical requests
 * - Stale-while-revalidate caching
 * - Error retry with exponential backoff
 * - mutate() for optimistic updates
 */
export function useFetch<T = unknown>(
    url: string | null,
    options?: SWRConfiguration
) {
    const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
        url,
        fetcher,
        {
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            dedupingInterval: 5000,
            errorRetryCount: 3,
            ...options,
        }
    );

    return {
        data,
        error,
        isLoading,
        isValidating,
        mutate,
    };
}

/**
 * POST-based SWR hook for mutations that need query params.
 * Uses SWR for caching but the key includes query params.
 */
export function useFetchWithParams<T = unknown>(
    baseUrl: string | null,
    params?: Record<string, string>,
    options?: SWRConfiguration
) {
    const url = baseUrl && params
        ? `${baseUrl}?${new URLSearchParams(params).toString()}`
        : baseUrl;

    return useFetch<T>(url, options);
}

export { fetcher };
export default useFetch;
