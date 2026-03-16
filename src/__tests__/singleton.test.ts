/**
 * Unit tests for createSingleton and createAsyncSingleton
 */
import { createSingleton, createAsyncSingleton } from '@/lib/singleton';

describe('createSingleton', () => {
    it('returns the same instance on multiple calls', () => {
        let callCount = 0;
        const get = createSingleton(() => ({ id: ++callCount }));

        const a = get();
        const b = get();
        const c = get();

        expect(a).toBe(b);
        expect(b).toBe(c);
        expect(callCount).toBe(1);
    });

    it('calls factory lazily (not at creation time)', () => {
        let called = false;
        createSingleton(() => { called = true; return 42; });
        expect(called).toBe(false);
    });

    it('recreates instance after TTL expires', () => {
        let callCount = 0;
        const get = createSingleton(() => ({ id: ++callCount }), 100); // 100ms TTL

        const a = get();
        expect(a.id).toBe(1);

        // Still within TTL
        const b = get();
        expect(b).toBe(a);
        expect(callCount).toBe(1);
    });

    it('refreshes instance after TTL via fake timers', () => {
        jest.useFakeTimers();
        let callCount = 0;
        const get = createSingleton(() => ({ id: ++callCount }), 100);

        const a = get();
        expect(a.id).toBe(1);

        jest.advanceTimersByTime(150); // Past TTL
        const b = get();
        expect(b.id).toBe(2);
        expect(b).not.toBe(a);

        jest.useRealTimers();
    });

    it('does not refresh when TTL is 0 or omitted', () => {
        jest.useFakeTimers();
        let callCount = 0;
        const get = createSingleton(() => ({ id: ++callCount }), 0);

        const a = get();
        jest.advanceTimersByTime(999999);
        const b = get();

        expect(a).toBe(b);
        expect(callCount).toBe(1);

        jest.useRealTimers();
    });
});

describe('createAsyncSingleton', () => {
    it('returns the same instance on multiple awaits', async () => {
        let callCount = 0;
        const get = createAsyncSingleton(async () => ({ id: ++callCount }));

        const a = await get();
        const b = await get();

        expect(a).toBe(b);
        expect(callCount).toBe(1);
    });

    it('deduplicates concurrent init calls', async () => {
        let callCount = 0;
        const get = createAsyncSingleton(async () => {
            callCount++;
            await new Promise(r => setTimeout(r, 50));
            return { id: callCount };
        });

        // Fire 3 concurrent calls
        const [a, b, c] = await Promise.all([get(), get(), get()]);

        expect(a).toBe(b);
        expect(b).toBe(c);
        expect(callCount).toBe(1); // Factory called only once
    });

    it('refreshes after TTL expires', async () => {
        jest.useFakeTimers();
        let callCount = 0;
        const get = createAsyncSingleton(async () => ({ id: ++callCount }), 100);

        const a = await get();
        expect(a.id).toBe(1);

        jest.advanceTimersByTime(150);
        const b = await get();
        expect(b.id).toBe(2);

        jest.useRealTimers();
    });
});
