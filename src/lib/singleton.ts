// ============================================================
// Singleton Factory — Standardized lazy-init with optional TTL
// Use for all engine singletons to ensure consistent lifecycle
// ============================================================

/**
 * Creates a lazy-initialized singleton with optional TTL.
 *
 * @param factory  - Zero-arg function that creates the instance
 * @param ttlMs    - Optional time-to-live in ms. After TTL expires,
 *                   the next `get()` call creates a fresh instance.
 *                   Useful for engines that cache API keys at init
 *                   (e.g. AI router, SERP intelligence).
 *                   Omit or set to 0 for permanent singletons.
 *
 * @example
 * ```ts
 * const getWriter = createSingleton(() => new ContentWriter());
 * const writer = getWriter();
 * ```
 *
 * @example With TTL (refreshes every 10 minutes):
 * ```ts
 * const getRouter = createSingleton(() => new AIRouter(), 10 * 60_000);
 * const router = getRouter(); // re-creates after 10 min
 * ```
 */
export function createSingleton<T>(factory: () => T, ttlMs?: number): () => T {
    let instance: T | null = null;
    let createdAt = 0;

    return () => {
        const now = Date.now();
        if (instance === null || (ttlMs && ttlMs > 0 && now - createdAt > ttlMs)) {
            instance = factory();
            createdAt = now;
        }
        return instance;
    };
}

/**
 * Like `createSingleton` but for factories that return a Promise.
 * Perfect for engines that need `await init()` on first creation.
 *
 * @example
 * ```ts
 * const getEngine = createAsyncSingleton(async () => {
 *     const e = new BacklinkEngine();
 *     await e.init();
 *     return e;
 * });
 * const engine = await getEngine();
 * ```
 */
export function createAsyncSingleton<T>(factory: () => Promise<T>, ttlMs?: number): () => Promise<T> {
    let instance: T | null = null;
    let createdAt = 0;
    let pending: Promise<T> | null = null;

    return () => {
        const now = Date.now();
        if (instance !== null && !(ttlMs && ttlMs > 0 && now - createdAt > ttlMs)) {
            return Promise.resolve(instance);
        }
        // Deduplicate concurrent init calls
        if (!pending) {
            pending = factory().then(inst => {
                instance = inst;
                createdAt = Date.now();
                pending = null;
                return inst;
            });
        }
        return pending;
    };
}
