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

/**
 * M1 — a salon's street address line, city and region  (mobile spec R3.10)
 *
 * Generous on purpose, like every other bound in this file: the point is a
 * ceiling no real salon reaches, not a validation rule anyone has to think
 * about. A Canadian postal code is 7 characters; the bound is not about that,
 * it is about the field not being an unbounded text column on a row the public
 * directory serves.
 */
export const MAX_ADDRESS = 300;
export const MAX_CITY = 120;
export const MAX_REGION = 120;
export const MAX_POSTAL_CODE = 20;

/**
 * W3 — "a reasonable image file ... within a sensible file size limit".
 *
 * 2 MiB of DECODED image. The wire format is a base64 data URL, which is ~4/3
 * the size, so the route's body limit has to be higher than this number — see
 * `merchants.module.ts`, where that is set explicitly rather than left to the
 * global 100 kB JSON limit that would otherwise reject every logo as a bare
 * 413 with no message a salon owner could act on.
 *
 * Mirrored as a CHECK constraint on MerchantLogo.sizeBytes: the Supabase table
 * editor writes to these tables too and gets no DTO validation.
 */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * The base64 data URL carrying a logo, at its longest.
 *
 * base64 is 4 bytes per 3, plus the `data:image/jpeg;base64,` preamble. Sized
 * off MAX_LOGO_BYTES rather than written as a round number so the two cannot
 * drift: if the image limit moves, this moves with it, and a payload that
 * would have been rejected for its decoded size is rejected for its encoded
 * size first — cheaply, in the pipe, before anything is decoded.
 */
export const MAX_LOGO_DATA_URL = Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 64;

/**
 * An Expo push token  (R4.5).
 *
 * They look like `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]` — about 41
 * characters. The bound leaves room for the FCM/APNs raw forms a future
 * standalone build might send instead, without leaving the column open.
 */
export const MAX_PUSH_TOKEN = 256;
