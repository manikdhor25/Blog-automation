// ============================================================
// RankMaster Pro - CRON endpoint auth
// Fail-closed verification for scheduler/automation endpoints that
// run privileged work (WordPress publishing, paid rank checks) under
// the service-role client.
// ============================================================

import { NextResponse } from 'next/server';

/**
 * Verify a request to a CRON-triggered endpoint.
 *
 * Fail-closed: in production a CRON_SECRET MUST be configured, and the
 * request must present it via either `Authorization: Bearer <secret>`
 * (Vercel Cron sends this automatically) or a `?secret=<secret>` query
 * param. Outside production, an unset secret is allowed so local dev and
 * tests can hit the endpoints.
 *
 * @returns a NextResponse to return immediately if auth fails, otherwise null.
 */
export function verifyCronAuth(request: Request): NextResponse | null {
    const secret = process.env.CRON_SECRET;
    const isProd = process.env.NODE_ENV === 'production';

    if (!secret) {
        if (isProd) {
            // Never run privileged work unauthenticated in production.
            return NextResponse.json(
                { error: 'CRON_SECRET not configured — endpoint disabled' },
                { status: 503 }
            );
        }
        return null; // dev/test convenience
    }

    const header = request.headers.get('authorization');
    let querySecret: string | null = null;
    try {
        querySecret = new URL(request.url).searchParams.get('secret');
    } catch {
        /* malformed URL — fall through to deny */
    }

    if (header === `Bearer ${secret}` || querySecret === secret) {
        return null;
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
