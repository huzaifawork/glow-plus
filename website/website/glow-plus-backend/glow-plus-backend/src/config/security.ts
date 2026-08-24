/**
 * HTTP security headers and CORS  (T28)
 *
 * Two separate jobs, in one file because they are the same decision seen from
 * two sides: **who may talk to this API from a browser, and what a browser is
 * allowed to do with the answer.**
 *
 * Before this file, the live API answered every request with:
 *
 *     X-Powered-By: Express                 <- names the stack for free
 *     Access-Control-Allow-Credentials: true
 *
 * and nothing else. No `X-Content-Type-Options`, no `X-Frame-Options`, no
 * `Referrer-Policy`, no CSP, no HSTS. `Access-Control-Allow-Credentials: true`
 * was on **every** response, including ones to origins that were refused —
 * pointless, because auth here is token-only by contract (`lib/api.js`, and
 * the RN app has no cookie jar), and actively dangerous later: it is the exact
 * header that turns a future "let's just use a session cookie" into a CSRF
 * hole, invisibly, because the server was already advertising support for it.
 *
 * Everything below is a pure function of the environment so it can be unit
 * tested without booting Nest. `main.ts` only wires it up.
 */
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { HelmetOptions } from 'helmet';

import { isProductionEnv } from './env.validation';

/**
 * The methods this API actually routes. Reflecting whatever a browser asks for
 * (the `cors` default) means the preflight for `TRACE` or `CONNECT` is
 * answered with a cheerful yes for a method no controller implements.
 * `PUT` is here for `PUT /business-hours`; without it the merchant's opening
 * hours silently stop saving cross-origin.
 */
export const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];

/**
 * The only request headers any client sends: `Content-Type` on a JSON body and
 * `Authorization` on a bearer token — grepped from both clients
 * (`glow-plus-web/src/lib/api.js`, `glow-plus-mobile app/src/api/client.js`),
 * not assumed. Stripe's `Stripe-Signature` is absent on purpose: the webhook is
 * server-to-server, has no Origin, and never preflights.
 */
export const ALLOWED_HEADERS = ['Content-Type', 'Authorization'];

/**
 * Response headers a cross-origin browser client is allowed to *read*.
 *
 * This matters more than it looks. By default a cross-origin `fetch()` can see
 * only the CORS-safelisted response headers — so every one of T26's rate limit
 * headers was invisible to the website, and a 429 could not tell the UI how
 * long to wait. Without this list the limiter is enforced but unreadable, and
 * the frontend's only option is to guess.
 *
 * The `-global` suffix is `GlobalRateLimitMiddleware`'s own tier and
 * `-identity` is @nestjs/throttler's named tier; the unsuffixed pair is the
 * `default` tier, which is why that tier is named `default` (see throttling.ts).
 */
export const EXPOSED_HEADERS = [
  'Retry-After',
  'Retry-After-global',
  'Retry-After-identity',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'X-RateLimit-Limit-global',
  'X-RateLimit-Remaining-global',
  'X-RateLimit-Reset-global',
  // T44 — the paginated public lists (`GET /merchants`, T43, and
  // `GET /styles/public/:merchantId`) report their unpaged total here rather
  // than in an `{ items, total }` envelope, because the RN app maps the body
  // directly and an envelope would break Order 2.
  //
  // **It is listed here rather than set per route, and that reverses a T43
  // decision on purpose.** T43 called `res.setHeader('Access-Control-Expose-
  // Headers', 'X-Total-Count')` inside the handler, on the reasonable grounds
  // that the exposure belongs next to the header it exposes. But `setHeader`
  // REPLACES, so on those routes the whole list above was overwritten with
  // this one name: verified live, `GET /merchants` answered
  // `Access-Control-Expose-Headers: X-Total-Count` and nothing else, while
  // still *sending* `X-RateLimit-Remaining: 119` that the browser could no
  // longer read. Enforced but unreadable is the exact failure this list was
  // written to prevent — see the note above it. Nothing in the website reads
  // the rate-limit headers yet, so this was latent rather than live, and the
  // 429 path was never affected (the throttler guard answers before any
  // handler runs). Listing the name globally costs nothing: a header is only
  // exposed on responses that actually send it.
  'X-Total-Count',
];

/** How long a browser may cache a preflight result. 10 minutes. */
export const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Split `ALLOWED_ORIGINS` into origins that can actually match.
 *
 * An Origin header is *scheme + host + port and nothing else* — no path, no
 * trailing slash. `https://glowplusmember.com/` is a natural thing to paste
 * into a Vercel dashboard and it never matches anything, so the site's API
 * calls fail CORS in production while the variable looks correctly set. Same
 * for the space in `a.com, b.com`: the second entry becomes ` b.com`.
 *
 * Both are normalised here rather than being someone's outage.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}

/**
 * Where the dev servers run. Used ONLY when `ALLOWED_ORIGINS` is unset outside
 * production.
 *
 * T51 — the two Expo entries are for **Expo web**, and only Expo web. The
 * native app needs nothing here: Expo Go and a built binary send **no Origin
 * header at all**, and `isOriginAllowed` already returns true for those (see
 * its comment — refusing an origin-less request blocks every non-browser
 * client while stopping no attacker). CORS is a browser rule; React Native is
 * not a browser.
 *
 * Two ports because Expo has two web dev servers and SDK 51 can run either:
 * **8081** is Metro, the default since SDK 49, and **19006** is the older
 * `@expo/webpack-config` one that plenty of tutorials and existing configs
 * still use. Guessing one and being wrong presents as a CORS error in a
 * console the backend developer is not looking at, so both are listed.
 */
export const DEV_FALLBACK_ORIGINS = [
  'http://localhost:3000', // glow-plus-web (Vite, strictPort)
  'http://localhost:8081', // Expo web — Metro (SDK 49+)
  'http://localhost:19006', // Expo web — webpack (legacy)
];

/**
 * The origin list actually used, and whether it came from a fallback.
 *
 * The old `?? ['http://localhost:3000']` in main.ts was a *silent* fallback of
 * exactly the kind T27 removed everywhere else — a production deploy that
 * forgot the variable would boot green and trust localhost. That cannot happen
 * now (`ALLOWED_ORIGINS` is in env.validation's production-required list, so
 * the process refuses to start), which is what makes it safe to keep a
 * convenience fallback *locally*, where a fresh clone with no `.env` would
 * otherwise fail every browser call with an error that says nothing about the
 * cause. `usedFallback` is returned so main.ts can say so out loud — the
 * problem was never the default, it was that nothing announced it.
 */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv = process.env): {
  origins: string[];
  usedFallback: boolean;
} {
  const configured = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (configured.length || isProductionEnv(env)) {
    return { origins: configured, usedFallback: false };
  }
  return { origins: [...DEV_FALLBACK_ORIGINS], usedFallback: true };
}

/**
 * Whether to echo `Access-Control-Allow-Origin` back.
 *
 * A request with **no** Origin is allowed: that is curl, the React Native app,
 * a server-to-server call and Stripe's webhook. CORS is a browser rule about
 * *reading a response cross-origin* — refusing an origin-less request would
 * block every non-browser client while stopping no attacker, since anything
 * without a browser simply omits the header.
 *
 * Matching is exact, case-insensitive: no prefix matching, no `endsWith`.
 * `https://glowplusmember.com.evil.test` passes a naive `startsWith` and
 * `https://evil-glowplusmember.com` passes a naive `endsWith`; both fail here.
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  const candidate = origin.trim().replace(/\/+$/, '').toLowerCase();
  return allowed.some((entry) => entry.toLowerCase() === candidate);
}

/**
 * CORS for a token-only API.
 *
 * `credentials` is **false**, deliberately and as a change from what shipped.
 * Nothing in either client sends a cookie; leaving it on advertises a mode the
 * app does not use and cannot safely use without CSRF protection it does not
 * have. It is the header that would quietly make a future "let's just use a
 * session cookie" exploitable on day one.
 *
 * A refused origin is answered **without** the allow-origin header rather than
 * with an error. Throwing would turn a browser-side policy decision into a 500
 * for callers CORS does not even apply to — and the browser's own message
 * ("blocked by CORS policy") is far more useful to whoever is debugging it
 * than a masked 500 would be.
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const { origins: allowed } = resolveAllowedOrigins(env);

  return {
    origin(origin, callback) {
      callback(null, isOriginAllowed(origin, allowed));
    },
    credentials: false,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
    // 204 rather than 200 for the preflight, and never pass it to a handler:
    // no controller routes OPTIONS, so letting it fall through would answer a
    // preflight with this API's 404 envelope.
    optionsSuccessStatus: 204,
    preflightContinue: false,
  };
}

/**
 * Helmet, configured for an API that serves **only JSON**.
 *
 * Verified before choosing these: grepping `useStaticAssets`, `sendFile` and
 * `text/html` across `src/` returns nothing. There is no HTML, no template
 * engine, no static directory — so the defaults, which are tuned for a server
 * that renders pages, can be tightened rather than merely accepted.
 *
 *   contentSecurityPolicy — `default-src 'none'` is the honest policy for a
 *     server that never intends its output to be rendered as a document. It
 *     matters in the one case that actually happens: a response a browser is
 *     tricked into treating as HTML. With `nosniff` and this, a reflected
 *     value in an error message has nowhere to execute. `frame-ancestors` is
 *     the modern `X-Frame-Options` and covers browsers that ignore the legacy
 *     header.
 *
 *   crossOriginResourcePolicy — set to **cross-origin**, the one place the
 *     API-shaped answer is *looser* than helmet's default. Helmet defaults to
 *     `same-origin`; this API is consumed cross-origin by design (the site and
 *     the API are different hosts), so the default describes a deployment this
 *     project does not have.
 *
 *   strictTransportSecurity — production only. Locally the API is plain HTTP
 *     on :4000; browsers ignore HSTS from a non-secure origin, but anyone
 *     putting the dev server behind an HTTPS tunnel would pin their own
 *     machine to HTTPS for six months for a header that buys nothing in dev.
 *     `preload` is off on purpose: it is a one-way door — submitting a domain
 *     to the browsers' preload list is effectively irreversible, and that is
 *     the client's call about their own domain, not a default to inherit.
 */
export function buildHelmetOptions(env: NodeJS.ProcessEnv = process.env): HelmetOptions {
  const production = isProductionEnv(env);

  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    // DENY, not helmet's default SAMEORIGIN: nothing here is meant to be
    // framed at all, including by our own pages.
    frameguard: { action: 'deny' },
    hsts: production ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
    // Off. It is a long-dead IE/legacy-Chrome filter that browsers removed
    // because it introduced vulnerabilities of its own; helmet's own default
    // is to send `0` for the same reason. Named here so nobody "fixes" its
    // absence by turning it back on.
    xssFilter: false,
  };
}
