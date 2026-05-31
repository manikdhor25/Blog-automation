import { isPrivateIp, validatePublicUrl } from '@/lib/utils/safe-url';

describe('isPrivateIp', () => {
    it.each([
        '127.0.0.1', '10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.1.1',
        '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', 'fc00::1', 'fd12::1',
        '::ffff:127.0.0.1', '224.0.0.1',
    ])('flags %s as private/reserved', (ip) => {
        expect(isPrivateIp(ip)).toBe(true);
    });

    it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])(
        'allows public %s', (ip) => {
            expect(isPrivateIp(ip)).toBe(false);
        });

    it('treats non-IP strings as unsafe', () => {
        expect(isPrivateIp('not-an-ip')).toBe(true);
    });
});

describe('validatePublicUrl', () => {
    it('rejects non-http(s) schemes', async () => {
        expect((await validatePublicUrl('file:///etc/passwd')).ok).toBe(false);
        expect((await validatePublicUrl('ftp://example.com')).ok).toBe(false);
    });

    it('rejects localhost and metadata hosts', async () => {
        expect((await validatePublicUrl('http://localhost/x')).ok).toBe(false);
        expect((await validatePublicUrl('http://metadata.google.internal/')).ok).toBe(false);
    });

    it('rejects literal private IPs', async () => {
        expect((await validatePublicUrl('http://169.254.169.254/latest/meta-data/')).ok).toBe(false);
        expect((await validatePublicUrl('http://10.0.0.5:8080/')).ok).toBe(false);
        expect((await validatePublicUrl('http://[::1]/')).ok).toBe(false);
    });

    it('rejects malformed URLs', async () => {
        expect((await validatePublicUrl('not a url')).ok).toBe(false);
    });
});
