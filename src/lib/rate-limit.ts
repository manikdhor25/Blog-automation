// ============================================================
// RankMaster Pro - In-Memory Rate Limiter
// Sliding-window per-user rate limiting for expensive endpoints
// ============================================================

import { NextResponse } from 'next/server';

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(t => now - t < 600_000);
        if (entry.timestamps.length === 0) store.delete(key);
    }
}, 300_000);

/**
 * Check rate limit for a user+route combination.
 *
 * @param userId - Authenticated user ID
 * @param route  - Route identifier (e.g. '/api/content/generate')
 * @param opts   - maxRequests per windowMs (defaults: 10 req / 60s)
 * @returns null if allowed, or a 429 NextResponse if rate-limited
 */
export function checkRateLimit(
    userId: string,
    route: string,
    opts?: { maxRequests?: number; windowMs?: number },
): NextResponse | null {
    const maxRequests = opts?.maxRequests ?? 10;
    const windowMs = opts?.windowMs ?? 60_000;
    const key = `${userId}:${route}`;
    const now = Date.now();

    const entry = store.get(key) || { timestamps: [] };

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
        const oldestInWindow = entry.timestamps[0];
        const retryAfterMs = windowMs - (now - oldestInWindow);
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);

        return NextResponse.json(
            {
                error: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s. Try again in ${retryAfterSec}s.`,
            },
            {
                status: 429,
                headers: { 'Retry-After': String(retryAfterSec) },
            },
        );
    }

    entry.timestamps.push(now);
    store.set(key, entry);
    return null;
}
