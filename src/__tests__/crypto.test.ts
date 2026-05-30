import { encryptSecret, decryptSecret, isEncrypted } from '@/lib/crypto';

describe('crypto secret encryption', () => {
    const KEY = 'a'.repeat(64); // 32 bytes hex

    describe('with ENCRYPTION_KEY set', () => {
        beforeEach(() => { process.env.ENCRYPTION_KEY = KEY; });
        afterEach(() => { delete process.env.ENCRYPTION_KEY; });

        it('round-trips a secret', () => {
            const secret = 'xxxx yyyy zzzz 1234';
            const enc = encryptSecret(secret);
            expect(enc).not.toEqual(secret);
            expect(isEncrypted(enc)).toBe(true);
            expect(decryptSecret(enc)).toBe(secret);
        });

        it('produces a different ciphertext each time (random IV)', () => {
            expect(encryptSecret('same')).not.toEqual(encryptSecret('same'));
        });

        it('passes through legacy plaintext on decrypt', () => {
            expect(decryptSecret('plain-legacy-password')).toBe('plain-legacy-password');
        });

        it('does not double-encrypt', () => {
            const once = encryptSecret('secret');
            expect(encryptSecret(once)).toBe(once);
        });

        it('throws on tampered ciphertext', () => {
            const enc = encryptSecret('secret');
            const tampered = enc.slice(0, -4) + 'AAAA';
            expect(() => decryptSecret(tampered)).toThrow();
        });

        it('handles empty values', () => {
            expect(encryptSecret('')).toBe('');
            expect(decryptSecret('')).toBe('');
        });
    });

    describe('without ENCRYPTION_KEY', () => {
        beforeEach(() => { delete process.env.ENCRYPTION_KEY; });

        it('stores plaintext (no-op) and reads it back', () => {
            const enc = encryptSecret('secret');
            expect(enc).toBe('secret');
            expect(decryptSecret('secret')).toBe('secret');
        });
    });
});
