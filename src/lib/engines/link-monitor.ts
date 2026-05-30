// ============================================================
// RankMaster Pro - Broken Affiliate Link Monitor
// Crawls all affiliate links and checks HTTP status
// ============================================================

export interface LinkCheckResult {
    id: string;
    slug?: string;
    destination_url: string;
    label: string;
    status: 'ok' | 'broken' | 'redirect' | 'timeout' | 'unchecked';
    http_status: number | null;
    final_url: string | null;
    redirect_chain: string[];
    response_time_ms: number;
    error: string | null;
    checked_at: string;
}

export interface MonitorSummary {
    total: number;
    ok: number;
    broken: number;
    redirected: number;
    timeout: number;
    results: LinkCheckResult[];
}

const UA = 'Mozilla/5.0 (compatible; RankMaster/1.0)';
const MAX_REDIRECTS = 8;

// Single request, following redirects manually so we can record the chain.
// Affiliate/cloaked links are almost always redirects, so resolving to the
// FINAL status is what makes "broken link" detection meaningful. Falls back
// to GET when a host rejects HEAD (405/403) — common on Amazon and others.
async function checkUrl(url: string, timeoutMs = 8000): Promise<{
    httpStatus: number | null;
    finalUrl: string | null;
    redirectChain: string[];
    responseTimeMs: number;
    error: string | null;
}> {
    const start = Date.now();
    const redirectChain: string[] = [];
    let currentUrl = url;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const doFetch = (target: string, method: 'HEAD' | 'GET') => fetch(target, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': UA },
    });

    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            let res = await doFetch(currentUrl, 'HEAD');

            // Some hosts reject HEAD — retry the same URL with GET.
            if (res.status === 405 || res.status === 403 || res.status === 501) {
                res = await doFetch(currentUrl, 'GET');
            }

            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('location');
                if (!location) {
                    // Redirect with no Location — can't follow further.
                    clearTimeout(timer);
                    return { httpStatus: res.status, finalUrl: currentUrl, redirectChain, responseTimeMs: Date.now() - start, error: null };
                }
                // Resolve relative redirects against the current URL.
                const nextUrl = new URL(location, currentUrl).toString();
                redirectChain.push(nextUrl);
                currentUrl = nextUrl;
                continue;
            }

            // Terminal status (2xx / 4xx / 5xx).
            clearTimeout(timer);
            return { httpStatus: res.status, finalUrl: currentUrl, redirectChain, responseTimeMs: Date.now() - start, error: null };
        }

        // Exceeded redirect cap → treat as a redirect loop / broken.
        clearTimeout(timer);
        return { httpStatus: null, finalUrl: currentUrl, redirectChain, responseTimeMs: Date.now() - start, error: 'Too many redirects' };
    } catch (err: unknown) {
        clearTimeout(timer);
        const isTimeout = err instanceof Error && err.name === 'AbortError';
        return {
            httpStatus: null,
            finalUrl: null,
            redirectChain,
            responseTimeMs: Date.now() - start,
            error: isTimeout ? 'Timeout' : (err instanceof Error ? err.message : 'Unknown error'),
        };
    }
}

function classifyStatus(httpStatus: number | null, error: string | null, redirectChain: string[] = []): LinkCheckResult['status'] {
    if (error === 'Timeout') return 'timeout';
    if (error) return 'broken';
    if (!httpStatus) return 'broken';
    // httpStatus is the FINAL status after following redirects.
    if (httpStatus >= 200 && httpStatus < 300) {
        // Working, but flag links that resolved via a redirect chain.
        return redirectChain.length > 0 ? 'redirect' : 'ok';
    }
    if (httpStatus >= 300 && httpStatus < 400) return 'redirect'; // unresolved redirect (no Location / loop)
    if (httpStatus >= 400) return 'broken';
    return 'ok';
}

export async function checkLinks(
    links: Array<{ id: string; slug?: string; destination_url: string; label: string }>,
    concurrency = 5
): Promise<MonitorSummary> {
    const results: LinkCheckResult[] = [];

    // Process in batches of `concurrency`
    for (let i = 0; i < links.length; i += concurrency) {
        const batch = links.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(async (link) => {
                const check = await checkUrl(link.destination_url);
                const status = classifyStatus(check.httpStatus, check.error, check.redirectChain);
                return {
                    id: link.id,
                    slug: link.slug,
                    destination_url: link.destination_url,
                    label: link.label || link.slug || link.destination_url,
                    status,
                    http_status: check.httpStatus,
                    final_url: check.finalUrl,
                    redirect_chain: check.redirectChain,
                    response_time_ms: check.responseTimeMs,
                    error: check.error,
                    checked_at: new Date().toISOString(),
                } satisfies LinkCheckResult;
            })
        );
        results.push(...batchResults);
    }

    return {
        total: results.length,
        ok: results.filter(r => r.status === 'ok').length,
        broken: results.filter(r => r.status === 'broken').length,
        redirected: results.filter(r => r.status === 'redirect').length,
        timeout: results.filter(r => r.status === 'timeout').length,
        results,
    };
}
