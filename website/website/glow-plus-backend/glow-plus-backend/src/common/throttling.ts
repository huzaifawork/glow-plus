import { ExecutionContext } from '@nestjs/common';
import { Throttle, ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * API-wide rate limiting  (T26) [F3]
 *
 * Before this file nothing in the API was rate limited. `rateLimit.middleware.ts`
 * existed and read plausibly, but it had **zero references** — and it could not
 * have been wired up as written: its constructor takes `windowMs`, `max` and a
 * `keyOf` function, so `consumer.apply(RateLimitMiddleware)` makes Nest try to
 * resolve `Number`, `Number` and `Function` from the DI container and fail at
 * boot. It has been deleted rather than left next to the working limiter.
 *
 * Three named tiers run on every request. They are deliberately different
 * shapes, because one bucket cannot answer both "is this host hammering us?"
 * and "is someone brute-forcing one account?":
 *
 *   global    — per client IP, ONE bucket for the whole API. A scraper that
 *               spreads its load over twenty endpoints still hits this.
 *               Enforced as MIDDLEWARE, not in the guard — see
 *               middleware/globalRateLimit.middleware.ts for why (short
 *               version: guards run after AuthMiddleware's 401, so a
 *               guard-only limiter leaves every protected route floodable
 *               by anonymous traffic).
 *   default   — per client IP, per handler. The normal per-endpoint ceiling,
 *               tightened on credential and email-sending routes below. Named
 *               `default` deliberately: @nestjs/throttler suffixes the response
 *               headers with every tier name except that one, so this is the
 *               tier that emits the standard `X-RateLimit-*` and `Retry-After`
 *               a real HTTP client actually reads (`Retry-After-route` is a
 *               header nothing on earth honours).
 *   identity  — per EMAIL IN THE REQUEST BODY, per handler; skipped entirely
 *               when the body carries no email. This is the one that stops
 *               credential stuffing: an attacker rotating IPs still converges
 *               on one victim's email, and the per-IP tiers never see it.
 *               (The deleted middleware's own doc-comment named "request body
 *               email" as the intended key — this is that idea, working.)
 *
 * ⚠️ Storage is in-process. On one long-running server that is exact. On
 * Vercel (T53) each warm lambda keeps its own counters, so the effective limit
 * is roughly `limit × concurrent instances` — a real weakening, not a
 * theoretical one. The fix is a shared store (`ThrottlerStorageRedisService`),
 * which is a config swap in app.module.ts and nothing else. Recorded in
 * TASKS.md against T53 so it is not discovered in production.
 */

const MINUTE = 60_000;

/** One wording for a refusal, wherever it is issued from. */
export const THROTTLE_MESSAGE = 'Too many requests — please wait a moment and try again.';

/** Per-tier defaults. Per-route overrides live in the decorators below. */
export const THROTTLE_DEFAULTS = {
  global: { ttl: MINUTE, limit: 300 },
  default: { ttl: MINUTE, limit: 120 },
  identity: { ttl: 15 * MINUTE, limit: 20 },
} as const;

/**
 * Credential endpoints — login, signup, and the token-swallowing routes
 * (verify-email, reset-password, accept-invite), which are guessable in
 * exactly the same way a password is.
 *
 * The per-IP number is deliberately looser than the per-email one. A salon is
 * one NAT'd office: owner and three staff signing in on a bad morning must not
 * lock the building out. The per-email tier is where the brute-force defence
 * actually lives, and 5 attempts per 15 minutes against a single account is
 * far below anything useful to an attacker.
 */
export const ThrottleCredentials = () =>
  Throttle({
    default: { limit: 20, ttl: 5 * MINUTE, blockDuration: 10 * MINUTE },
    identity: { limit: 5, ttl: 15 * MINUTE, blockDuration: 15 * MINUTE },
  });

/**
 * Endpoints whose whole job is to send an email to an address the caller
 * names. Unlimited, these are a free inbox-flooding tool pointed at a victim
 * who never signed up for anything — and every send costs the client money at
 * Resend. Tighter than credentials, and tightest per target address.
 */
export const ThrottleEmailSend = () =>
  Throttle({
    default: { limit: 10, ttl: 15 * MINUTE, blockDuration: 15 * MINUTE },
    identity: { limit: 3, ttl: 15 * MINUTE, blockDuration: 30 * MINUTE },
  });

/**
 * Routes that must never be throttled.
 *
 * - `billing/webhook` is Stripe. It legitimately bursts (a batch of invoices
 *   fires many events at once), it is already authenticated by signature, and
 *   a 429 makes Stripe *retry* — so throttling it manufactures the load it was
 *   meant to shed, and risks dropping a real subscription state change.
 * - `health` is polled by uptime probes and by Vercel. Answering 429 there
 *   reads as an outage. Same reasoning as AuthMiddleware's own exclusion.
 */
const EXEMPT_PATHS = [/^\/?billing\/webhook\/?$/i, /^\/?health(\/.*)?$/i];

export function isExemptPath(path: string): boolean {
  return EXEMPT_PATHS.some((re) => re.test(path));
}

/**
 * The path to match exemptions against.
 *
 * `req.path` is WRONG here and the live tests caught it: Nest applies
 * `forRoutes('*')` middleware as `app.use('*', fn)`, and Express strips the
 * matched mount prefix from `req.url` — with a `*` mount the whole path is the
 * prefix, so inside the middleware `req.path` is just `/`. Every exemption
 * silently missed, and `/health` and the Stripe webhook were both being
 * throttled while the unit tests (which pass a path directly) stayed green.
 * `originalUrl` is never rewritten; the query string has to come off it.
 */
export function requestPath(req: Record<string, any>): string {
  const url: string | undefined = req?.originalUrl ?? req?.url;
  if (typeof url === 'string' && url.length) return url.split('?')[0];
  return req?.path ?? '';
}

/**
 * The IP we count against.
 *
 * X-Forwarded-For is trusted ONLY when TRUST_PROXY_HEADER is on. That switch
 * is not ceremony: the header is caller-supplied, so trusting it on a directly
 * exposed server lets anyone send a random value per request and mint a fresh
 * bucket every time — the limiter would still return 200s forever and look
 * like it worked. Off locally; on in Vercel, where the platform overwrites the
 * header and the socket address is Vercel's own proxy (without it every
 * visitor on earth would share one bucket instead).
 */
export function clientIp(req: Record<string, any>): string {
  if (process.env.TRUST_PROXY_HEADER === '1' || process.env.TRUST_PROXY_HEADER === 'true') {
    const xff = req?.headers?.['x-forwarded-for'];
    const raw = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff.split(',')[0] : undefined;
    const ip = raw?.trim();
    if (ip) return ip;
  }
  return req?.ip ?? req?.socket?.remoteAddress ?? 'unknown';
}

/**
 * The account the request is *about*, taken from the body — not from the
 * bearer token, which a credential-stuffing attacker does not have.
 * Normalised, because `Bob@X.com` and `bob@x.com` are one account to Prisma
 * and must be one bucket here too.
 */
export function bodyEmail(req: Record<string, any>): string | undefined {
  const email = req?.body?.email;
  if (typeof email !== 'string') return undefined;
  const normalised = email.trim().toLowerCase();
  return normalised.length ? normalised : undefined;
}

function requestOf(context: ExecutionContext): Record<string, any> {
  return context.switchToHttp().getRequest();
}

function skipCommon(context: ExecutionContext): boolean {
  const req = requestOf(context);
  // CORS preflight is the browser asking permission, not the app doing work.
  // Counting it would halve every real limit for cross-origin callers — which
  // is every browser client this API has.
  if (req?.method === 'OPTIONS') return true;
  return isExemptPath(requestPath(req));
}

export const throttlerOptions: ThrottlerModuleOptions = {
  errorMessage: THROTTLE_MESSAGE,
  skipIf: skipCommon,
  throttlers: [
    // NOTE: the `global` tier is NOT here. It is enforced by
    // middleware/globalRateLimit.middleware.ts, which runs *before*
    // AuthMiddleware and therefore also sees the unauthenticated requests a
    // guard never gets to. Listing it here as well would double-count every
    // authenticated request and halve the real limit. THROTTLE_DEFAULTS.global
    // is still its source of truth.
    {
      name: 'default',
      ...THROTTLE_DEFAULTS.default,
      getTracker: (req) => clientIp(req),
    },
    {
      name: 'identity',
      ...THROTTLE_DEFAULTS.identity,
      getTracker: (req) => bodyEmail(req) ?? 'anonymous',
      // A per-throttler skipIf REPLACES the common one (see ThrottlerGuard's
      // `namedThrottler.skipIf || this.commonOptions.skipIf`), so the exempt
      // paths have to be re-checked here or the webhook loses its exemption.
      skipIf: (context) => skipCommon(context) || !bodyEmail(requestOf(context)),
    },
  ],
};
