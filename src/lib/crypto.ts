// ============================================================
// RankMaster Pro - Secret encryption at rest (AES-256-GCM)
//
// Used for WordPress application passwords stored in sites.
// app_password_encrypted. Activated by setting ENCRYPTION_KEY in the
// environment (64 hex chars = 32 bytes, or any passphrase which is hashed
// to 32 bytes). When no key is set, values are stored as plaintext so
// local/dev flows keep working — the browser-leak fix is independent of
// this. decryptSecret() transparently passes through legacy plaintext
// rows, so encryption can be enabled without a data migration.
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer | null {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) return null;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    // Derive a stable 32-byte key from an arbitrary passphrase.
    return createHash('sha256').update(raw).digest();
}

/** True if a stored value is in the encrypted envelope format. */
export function isEncrypted(value: string | null | undefined): boolean {
    return Boolean(value && value.startsWith(PREFIX));
}

/**
 * Encrypt a secret for storage. No-op (returns plaintext) when
 * ENCRYPTION_KEY is unset or the value is empty/already encrypted.
 */
export function encryptSecret(plain: string | null | undefined): string {
    if (!plain) return plain || '';
    if (isEncrypted(plain)) return plain;
    const key = getKey();
    if (!key) return plain; // no key configured — store as-is
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt a stored secret. Legacy plaintext (no envelope prefix) is
 * returned unchanged so mixed encrypted/plaintext rows both work.
 */
export function decryptSecret(stored: string | null | undefined): string {
    if (!stored || !isEncrypted(stored)) return stored || '';
    const key = getKey();
    if (!key) throw new Error('ENCRYPTION_KEY not set but an encrypted secret was encountered');
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
