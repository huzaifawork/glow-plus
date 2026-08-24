import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Encryption at rest for personal data  (T31b)
 *
 * ## Why this exists
 *
 * The client's requirements document states, as fact, that *"phone numbers
 * are encrypted"* and that the environment holds an **`ENCRYPTION_KEY`**.
 * Neither was true. Verified before writing this: there was no
 * `ENCRYPTION_KEY` in `.env` or `.env.example`, no encryption code anywhere
 * in `src/`, and no `pgcrypto` extension in the database. A phone number
 * submitted through the live `POST /auth/signup` was read straight back out
 * of Postgres in clear text.
 *
 * That mattered more than a normal missing feature, because the same document
 * derives a **privacy-policy** obligation from the claim (T66). Left alone,
 * the client would publish a policy telling customers their phone numbers are
 * encrypted while they sat in plaintext. This file makes the claim true.
 *
 * ## The problem encryption creates, and how it is solved
 *
 * `User.phone` was `String? @unique`, and the original website design looks
 * customers up *by* phone number ("Enter your phone number to pull up your
 * points"). Proper authenticated encryption uses a **random IV**, so the same
 * number encrypts to a different ciphertext every time — which destroys both
 * the unique constraint and any ability to search.
 *
 * So two columns, which is the standard answer:
 *
 * - **`phone`** holds the AES-256-GCM ciphertext. Random IV, authenticated,
 *   never searchable — this is the value that protects the data.
 * - **`phoneFingerprint`** holds a **deterministic HMAC-SHA256 blind index**
 *   and carries the `@unique` constraint. Equal numbers produce equal
 *   fingerprints, so uniqueness and lookup-by-phone still work, but the
 *   fingerprint is not reversible without the key.
 *
 * `phoneFingerprint` is not a new idea invented here — the column already
 * existed in the delivered schema with **zero code references** (noted in
 * T13). A "fingerprint" column alongside a phone number is exactly this
 * design, so the original developer evidently intended it and never built it.
 *
 * ## What a blind index does and does not buy
 *
 * Stated plainly rather than oversold: a deterministic index **leaks
 * equality**. Anyone with the database can tell that two rows share a phone
 * number, and can confirm a *guessed* number by computing its fingerprint —
 * but only if they also hold `ENCRYPTION_KEY`, since the HMAC is keyed. It
 * does not leak the number itself, and the ciphertext remains unreadable.
 * That is the accepted trade for keeping a phone number usable as an
 * identifier. If lookup-by-phone is ever dropped, drop the fingerprint too.
 *
 * ## Format
 *
 * `v1:<iv>:<authTag>:<ciphertext>`, all base64url. The `v1` prefix is what
 * makes key rotation and algorithm changes possible later without guessing at
 * what a stored value is — and it is also how `decryptPii` recognises a
 * **legacy plaintext** row and returns it untouched instead of throwing.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits — the size GCM is specified for
const KEY_BYTES = 32; // AES-256

/** Separate HMAC context, so the blind index can never collide with any other use of the key. */
const FINGERPRINT_CONTEXT = 'glow-plus:pii-fingerprint:v1';

let cachedKey: Buffer | null = null;

/**
 * Accepts hex (64 chars) or base64 — whichever `openssl rand` produced —
 * and insists on a real 32-byte key. A short key here is not a soft failure:
 * it silently weakens every value written from that moment on, and nothing
 * downstream would ever notice.
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Personal data cannot be encrypted or decrypted without it.',
    );
  }

  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        'Generate one with: openssl rand -hex 32',
    );
  }

  cachedKey = key;
  return key;
}

/** Test seam — the key is cached, so a test that changes the env must clear it. */
export function resetEncryptionKeyCache(): void {
  cachedKey = null;
}

const b64u = (buf: Buffer) => buf.toString('base64url');

/** True for a value this module produced. Anything else is legacy plaintext. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`) && value.split(':').length === 4;
}

/**
 * AES-256-GCM. GCM rather than CBC because it authenticates: a tampered
 * ciphertext fails to decrypt instead of returning attacker-influenced bytes.
 */
export function encryptPii(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return [VERSION, b64u(iv), b64u(cipher.getAuthTag()), b64u(ciphertext)].join(':');
}

/**
 * Reverses `encryptPii`.
 *
 * A value that is not in our format is returned **unchanged** rather than
 * throwing. That is deliberate and load-bearing: rows written before T31b
 * hold plaintext, and this migration is deployed without a backfill window.
 * Throwing would turn every pre-existing customer record into a 500 on read.
 * `isEncrypted()` makes the distinction explicit rather than implicit in a
 * try/catch, so nobody later mistakes the tolerance for sloppiness.
 */
export function decryptPii(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  const [, ivPart, tagPart, dataPart] = stored.split(':');

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Normalisation for the blind index only — the **encrypted** value keeps
 * exactly what the user typed.
 *
 * Without this, `+254 712 345 678` and `+254712345678` are different people
 * as far as the unique constraint is concerned. The original prototype did
 * the same thing (`normPhone(p){ return (p||'').replace(/\D/g,''); }`), so
 * this matches the behaviour the design already assumed.
 *
 * Digits only, and a single leading `00` international prefix is folded to
 * match the `+` form of the same number.
 */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('00') ? digits.slice(2) : digits;
}

/**
 * Keyed, deterministic index for equality lookups on an encrypted column.
 *
 * HMAC rather than a bare hash: a plain SHA-256 of a phone number is trivially
 * reversed by enumerating the (small) space of valid numbers. Keying it means
 * an attacker needs `ENCRYPTION_KEY` as well as the database.
 */
export function fingerprintPhone(phone: string): string {
  return createHmac('sha256', getEncryptionKey())
    .update(`${FINGERPRINT_CONTEXT}:${normalisePhone(phone)}`)
    .digest('hex');
}

/** Constant-time compare, for anywhere a fingerprint is checked in code rather than by the DB index. */
export function fingerprintsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * The pair that goes into a Prisma `data` object. Returns `undefined` for both
 * columns when there is no phone, so an absent number stays absent rather than
 * becoming an encrypted empty string — and, critically, so `phoneFingerprint`
 * stays NULL. Postgres treats NULLs as distinct under a unique index, which is
 * what lets many users have no phone number at all.
 */
export function encodePhone(phone?: string | null): { phone?: string; phoneFingerprint?: string } {
  if (!phone?.trim()) return {};

  return { phone: encryptPii(phone.trim()), phoneFingerprint: fingerprintPhone(phone) };
}
