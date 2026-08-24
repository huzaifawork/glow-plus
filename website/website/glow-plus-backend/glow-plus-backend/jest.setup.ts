/**
 * Jest environment setup  (T27)
 *
 * jwt.util used to fall back to a hardcoded `'dev-secret-change-me'` when
 * JWT_SECRET was unset, which is what let the test suite run without any
 * configuration — and is also exactly the [F20] hazard T27 removed. With the
 * fallback gone the suite has to supply its own key, which is the honest
 * arrangement anyway: a test signing with a *known published* constant is
 * testing something the app must never do.
 *
 * `??=`, not `=`, so a real .env-loaded secret still wins if one is present.
 */
process.env.JWT_SECRET ??= 'test-only-jwt-secret-not-used-anywhere-real-0123456789';

/**
 * T31b — the same arrangement for the PII encryption key. `pii-crypto` has no
 * fallback either (a default key would mean "encrypted" data anyone could
 * read), so the suite supplies a real 32-byte one. Deliberately NOT the same
 * value as JWT_SECRET: env.validation rejects that pairing, and a test fixture
 * that models a rejected configuration teaches the wrong thing.
 */
process.env.ENCRYPTION_KEY ??= '0'.repeat(63) + '1'; // 64 hex chars = 32 bytes
