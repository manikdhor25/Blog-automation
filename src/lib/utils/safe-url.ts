// ============================================================
// RankMaster Pro - SSRF guard for server-side fetches of user URLs
//
// Many routes fetch arbitrary user-supplied URLs (price/product scrape,
// link checking, SERP, RSS, audits). Without a guard an attacker can point
// these at internal services or the cloud metadata endpoint
// (169.254.169.254) — classic SSRF. Validate scheme + resolved IP before
// fetching, and reject private/reserved address space.
// ============================================================

import { lookup } from 'dns/promises';
import net from 'net';

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'metadata.google.internal',
    'metadata',
]);

/** True for loopback / private / link-local / reserved IPs (v4 + v6). */
export function isPrivateIp(ip: string): boolean {
    const type = net.isIP(ip);
    if (type === 4) {
        const p = ip.split('.').map(Number);
        if (p.length !== 4 || p.some(n => Number.isNaN(n))) return true;
        const [a, b] = p;
        if (a === 0) return true;                       // 0.0.0.0/8
        if (a === 10) return true;                      // 10/8
        if (a === 127) return true;                     // loopback
        if (a === 169 && b === 254) return true;        // link-local + metadata
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
        if (a === 192 && b === 168) return true;        // 192.168/16
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
        if (a >= 224) return true;                      // multicast/reserved
        return false;
    }
    if (type === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;     // loopback / unspecified
        if (lower.startsWith('fe80')) return true;              // link-local
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
        // IPv4-mapped (::ffff:a.b.c.d) — extract and re-check
        const m = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (m) return isPrivateIp(m[1]);
        return false;
    }
    return true; // not a valid IP literal — be safe
}

export interface UrlCheck { ok: boolean; reason?: string; url?: URL; }

/**
 * Validate that a URL is safe to fetch server-side: http(s) only, not a
 * blocked hostname, and its resolved IP is publicly routable.
 *
 * Note: there is still a TOCTOU/DNS-rebinding gap between this lookup and
 * the actual fetch. For full safety the resolved IP should be pinned for
 * the connection; this guard blocks the common SSRF vectors.
 */
export async function validatePublicUrl(raw: string): Promise<UrlCheck> {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { ok: false, reason: 'Invalid URL' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, reason: 'Only http/https URLs are allowed' };
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (BLOCKED_HOSTNAMES.has(host)) {
        return { ok: false, reason: 'Blocked host' };
    }
    // Literal IP in the URL — check directly.
    if (net.isIP(host)) {
        if (isPrivateIp(host)) return { ok: false, reason: 'Private/reserved IP not allowed' };
        return { ok: true, url };
    }
    // Resolve the hostname and reject if any record is private.
    try {
        const records = await lookup(host, { all: true });
        if (records.length === 0) return { ok: false, reason: 'Host did not resolve' };
        for (const r of records) {
            if (isPrivateIp(r.address)) return { ok: false, reason: 'Resolves to private/reserved IP' };
        }
    } catch {
        return { ok: false, reason: 'DNS resolution failed' };
    }
    return { ok: true, url };
}

/**
 * fetch() wrapper that rejects SSRF-unsafe URLs before connecting.
 * Throws on an unsafe URL so callers' existing try/catch treat it as a
 * failed fetch.
 */
export async function safeFetch(raw: string, init?: RequestInit): Promise<Response> {
    const check = await validatePublicUrl(raw);
    if (!check.ok) throw new Error(`Blocked URL: ${check.reason}`);
    return fetch(raw, init);
}
