/**
 * Tests for encryption at rest of personal data  (T31b)
 *
 * The properties that matter are the ones a reviewer would want proven before
 * believing the phrase "phone numbers are encrypted" — which the client's
 * requirements document already asserts, and which was **false** until T31b:
 * a phone number submitted to the live API was read straight back out of
 * Postgres in clear text.
 *
 * So these assert on the *stored form*, not just on round-tripping.
 */
import {
  encryptPii,
  decryptPii,
  isEncrypted,
  fingerprintPhone,
  fingerprintsMatch,
  normalisePhone,
  encodePhone,
  getEncryptionKey,
  resetEncryptionKeyCache,
} from './pii-crypto';

const PHONE = '+254712345678';

describe('pii-crypto: encryption', () => {
  it('round-trips a value', () => {
    expect(decryptPii(encryptPii(PHONE))).toBe(PHONE);
  });

  it('the stored form does NOT contain the plaintext anywhere', () => {
    // The whole point. Before T31b this string WAS the phone number.
    const stored = encryptPii(PHONE);

    expect(stored).not.toContain(PHONE);
    expect(stored).not.toContain('254712345678');
    expect(stored).not.toContain('712345678');
  });

  it('produces a DIFFERENT ciphertext each time (random IV)', () => {
    // This is what makes the column unsearchable, and why phoneFingerprint
    // has to exist at all.
    const a = encryptPii(PHONE);
    const b = encryptPii(PHONE);

    expect(a).not.toBe(b);
    expect(decryptPii(a)).toBe(decryptPii(b));
  });

  it('uses the versioned format so key rotation is possible later', () => {
    const parts = encryptPii(PHONE).split(':');

    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    expect(isEncrypted(encryptPii(PHONE))).toBe(true);
  });

  it('refuses a tampered ciphertext instead of returning garbage (GCM auth)', () => {
    const [v, iv, tag, data] = encryptPii(PHONE).split(':');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 0xff;

    expect(() => decryptPii([v, iv, tag, flipped.toString('base64url')].join(':'))).toThrow();
  });

  it('refuses a forged auth tag', () => {
    const [v, iv, , data] = encryptPii(PHONE).split(':');
    const fakeTag = Buffer.alloc(16, 7).toString('base64url');

    expect(() => decryptPii([v, iv, fakeTag, data].join(':'))).toThrow();
  });

  it('returns pre-T31b PLAINTEXT rows unchanged rather than throwing', () => {
    // Deployed without a backfill window: rows written before the migration
    // hold a bare phone number. Throwing would 500 every legacy customer.
    expect(isEncrypted(PHONE)).toBe(false);
    expect(decryptPii(PHONE)).toBe(PHONE);
    expect(decryptPii('')).toBe('');
  });

  it('handles unicode and long values', () => {
    const odd = 'ré+254‑712 345 678 ☎️';
    expect(decryptPii(encryptPii(odd))).toBe(odd);
    const long = 'x'.repeat(5000);
    expect(decryptPii(encryptPii(long))).toBe(long);
  });
});

describe('pii-crypto: blind index', () => {
  it('is deterministic, which is what preserves uniqueness and lookup', () => {
    expect(fingerprintPhone(PHONE)).toBe(fingerprintPhone(PHONE));
  });

  it('does not contain the phone number', () => {
    const fp = fingerprintPhone(PHONE);

    expect(fp).not.toContain('712345678');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats differently-formatted spellings of one number as the same', () => {
    // The unique index has to agree with what a human considers one number,
    // or the same customer signs up twice. Matches the prototype's normPhone.
    const spellings = ['+254712345678', '+254 712 345 678', '254-712-345-678', '00254712345678'];
    const fps = new Set(spellings.map(fingerprintPhone));

    expect(fps.size).toBe(1);
  });

  it('gives different numbers different fingerprints', () => {
    expect(fingerprintPhone('+254712345678')).not.toBe(fingerprintPhone('+254712345679'));
  });

  it('normalises to digits, folding a leading 00', () => {
    expect(normalisePhone('+254 712 345 678')).toBe('254712345678');
    expect(normalisePhone('00254712345678')).toBe('254712345678');
  });

  it('compares in constant time', () => {
    const fp = fingerprintPhone(PHONE);

    expect(fingerprintsMatch(fp, fp)).toBe(true);
    expect(fingerprintsMatch(fp, fingerprintPhone('+254700000000'))).toBe(false);
    expect(fingerprintsMatch(fp, 'ab')).toBe(false); // length mismatch must not throw
  });

  it('is KEYED — a different key gives a different fingerprint', () => {
    // A bare SHA-256 of a phone number is trivially reversed by enumeration.
    const withTestKey = fingerprintPhone(PHONE);
    const original = process.env.ENCRYPTION_KEY;

    try {
      process.env.ENCRYPTION_KEY = 'f'.repeat(64);
      resetEncryptionKeyCache();
      expect(fingerprintPhone(PHONE)).not.toBe(withTestKey);
    } finally {
      process.env.ENCRYPTION_KEY = original;
      resetEncryptionKeyCache();
    }
  });
});

describe('pii-crypto: encodePhone (what reaches Prisma)', () => {
  it('returns BOTH columns for a real number', () => {
    const out = encodePhone(PHONE);

    expect(isEncrypted(out.phone as string)).toBe(true);
    expect(decryptPii(out.phone as string)).toBe(PHONE);
    expect(out.phoneFingerprint).toBe(fingerprintPhone(PHONE));
  });

  it.each([undefined, null, '', '   '])('returns NEITHER column for %p', (value) => {
    // phoneFingerprint must stay NULL, not become an encrypted empty string —
    // Postgres treats NULLs as distinct under a unique index, which is what
    // lets many users have no phone at all.
    expect(encodePhone(value as string | null | undefined)).toEqual({});
  });

  it('trims before encrypting so " +254…" and "+254…" match', () => {
    expect(encodePhone(`  ${PHONE}  `).phoneFingerprint).toBe(encodePhone(PHONE).phoneFingerprint);
  });
});

describe('pii-crypto: key handling', () => {
  const original = process.env.ENCRYPTION_KEY;
  afterEach(() => {
    process.env.ENCRYPTION_KEY = original;
    resetEncryptionKeyCache();
  });

  it('accepts a 64-char hex key', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    resetEncryptionKeyCache();
    expect(getEncryptionKey()).toHaveLength(32);
  });

  it('accepts a base64 key', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    resetEncryptionKeyCache();
    expect(getEncryptionKey()).toHaveLength(32);
  });

  it('throws when the key is missing — never silently uses a default', () => {
    delete process.env.ENCRYPTION_KEY;
    resetEncryptionKeyCache();
    expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY is not set/);
  });

  it('throws on a key that is not 32 bytes', () => {
    process.env.ENCRYPTION_KEY = 'abc123';
    resetEncryptionKeyCache();
    expect(() => getEncryptionKey()).toThrow(/32 bytes/);
  });
});
