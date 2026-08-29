/**
 * Shared input-length limits  (T31)
 *
 * Before this, **no string field anywhere in the API had a maximum length**.
 * Every `@IsString()` accepted whatever fit inside the body-size limit, and
 * Prisma's `String` maps to Postgres `text`, which has no bound either. A
 * 100,000-character `name` was accepted by `POST /auth/signup` and written to
 * the database — verified live, then read back out of Postgres to confirm the
 * row really held 100,000 characters.
 *
 * That is not a dramatic vulnerability on its own; it is a slow one. Every
 * unbounded field is a way to fill the client's database, blow up every
 * response that includes the row, and put unbounded text into the emails
 * these fields are interpolated into. Express's 100kb JSON limit caps a
 * single request, not the total, and it is a coarse backstop rather than a
 * rule about what each field is *for*.
 *
 * The numbers are deliberately generous — the goal is a ceiling that no
 * legitimate user reaches, not a validation rule users have to think about.
 * A real salon name is not 300 characters, but nothing breaks if one is.
 *
 * `MAX_PASSWORD` is the exception, and it is not about storage: bcrypt
 * ignores everything past **72 bytes**, so a longer passphrase is silently
 * truncated and the user is never told. Refusing at 200 makes the truncation
 * point visible rather than surprising, while staying far above any real
 * passphrase.
 */

/** bcrypt's own floor for a usable password. Matches the consumer SignupDto. */
export const MIN_PASSWORD = 8;

/** See the note above — bcrypt silently ignores bytes past 72. */
export const MAX_PASSWORD = 200;

/** RFC 5321 caps an address at 254 characters. */
export const MAX_EMAIL = 254;

/** Person and business names. */
export const MAX_NAME = 200;

/** Phone numbers, with room for country codes, spaces and extensions. */
export const MAX_PHONE = 32;

/** Free-text a customer types: booking notes and similar. */
export const MAX_NOTES = 2_000;

/** Opaque single-use tokens (email verification, password reset, invites). */
export const MAX_TOKEN = 512;

/** Database ids — cuid is 25 chars; the ceiling just stops a novel-as-an-id. */
export const MAX_ID = 64;

/**
 * T83 — how many clients a salon can serve at once.
 *
 * The floor is 1, not 0: a salon with zero seats can never be booked, which is
 * a state nobody means to configure and which reads as an outage. The ceiling
 * is a sanity bound, not a business rule — it exists so a typo of 1000 cannot
 * make the availability grid offer a thousand concurrent appointments.
 */
export const SEATS_MIN = 1;
export const SEATS_MAX = 100;
