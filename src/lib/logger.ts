// ============================================================
// RankMaster Pro - Structured Logger
// JSON-formatted logging with request context for observability
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    route?: string;
    action?: string;
    userId?: string;
    siteId?: string;
    requestId?: string;
    duration?: number;
    [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...context,
        ...(error instanceof Error && {
            error: {
                name: error.name,
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            },
        }),
    };

    // JSON output for structured log aggregation (Vercel, Datadog, etc.)
    const json = JSON.stringify(entry);

    switch (level) {
        case 'error':
            console.error(json);
            break;
        case 'warn':
            console.warn(json);
            break;
        case 'debug':
            if (process.env.NODE_ENV === 'development') console.debug(json);
            break;
        default:
            console.log(json);
    }

    return entry;
}

/**
 * Structured logger for API routes and engines.
 *
 * Usage:
 * ```ts
 * const log = logger.child({ route: '/api/sites', userId: user.id });
 * log.info('Fetching sites');
 * log.error('Failed to fetch', error);
 * ```
 */
export const logger = {
    debug: (message: string, context?: LogContext) => formatLog('debug', message, context),
    info: (message: string, context?: LogContext) => formatLog('info', message, context),
    warn: (message: string, context?: LogContext, error?: unknown) => formatLog('warn', message, context, error),
    error: (message: string, context?: LogContext, error?: unknown) => formatLog('error', message, context, error),

    /**
     * Create a child logger with pre-bound context.
     */
    child: (baseContext: LogContext) => ({
        debug: (message: string, extra?: LogContext) => formatLog('debug', message, { ...baseContext, ...extra }),
        info: (message: string, extra?: LogContext) => formatLog('info', message, { ...baseContext, ...extra }),
        warn: (message: string, extra?: LogContext, error?: unknown) => formatLog('warn', message, { ...baseContext, ...extra }, error),
        error: (message: string, extra?: LogContext, error?: unknown) => formatLog('error', message, { ...baseContext, ...extra }, error),
    }),

    /**
     * Time an async operation and log its duration.
     */
    async time<T>(label: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            formatLog('info', `${label} completed`, { ...context, duration: Date.now() - start });
            return result;
        } catch (error) {
            formatLog('error', `${label} failed`, { ...context, duration: Date.now() - start }, error);
            throw error;
        }
    },
};

export default logger;
