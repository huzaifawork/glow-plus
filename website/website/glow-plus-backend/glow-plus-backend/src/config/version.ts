/**
 * API versioning  (T49)
 *
 * Every route is served under **`/v1`**, with one exception (below).
 *
 * **Why now:** a version prefix is free before anything is deployed and
 * expensive afterwards. Adding it later means either breaking both clients on
 * the same day or running two path trees indefinitely. The React Native app
 * reaches this API through `Constants.expoConfig.extra.apiBaseUrl`
 * (`client.js:4`), which is **configuration, not code** — so Order 2 absorbs
 * this by editing one string in `app.json`, and none of the paths inside
 * `client.js` change. That is the whole reason this is safe to do to an app
 * we are not allowed to edit.
 *
 * **Why not serve both `/x` and `/v1/x`:** T43 settled this exact question
 * when it removed `/merchants/public` rather than aliasing it — two paths
 * serving one thing is how two shapes eventually drift, and nothing is
 * deployed yet, so there is no migration to soften. A version that is optional
 * is not a version.
 *
 * **`/health` is deliberately VERSION_NEUTRAL** and stays at `/health`. It is
 * polled by uptime probes and by the platform, neither of which knows or
 * should care what version the API is on — and the whole point of T15's split
 * is that a probe answers "is this process alive", a question that outlives
 * any API version. A liveness check that 404s the day the API goes to `/v2` is
 * an outage that is not one.
 *
 * ⚠️ **Three path matchers in this codebase compare against the raw URL and
 * therefore have to know about the prefix.** They are the reason this constant
 * exists rather than the string being written out four times:
 *   - `app.module.ts` — AuthMiddleware's exclusion list. Miss one and a public
 *     route starts demanding a token.
 *   - `common/throttling.ts` — `EXEMPT_PATHS` for the Stripe webhook and
 *     health. Miss it and Stripe gets 429'd, which makes it *retry*.
 *   - `billing.module.ts` — the `express.raw()` mount for the webhook. Miss it
 *     and signature verification fails on every event, as a 400.
 */

/** The version number Nest's URI versioning appends after `v`. */
export const API_VERSION = '1';

/** The literal path segment: `v1`. Use this to build path matchers. */
export const API_PREFIX = `v${API_VERSION}`;

/**
 * Prefix a route path for a matcher that sees the raw URL.
 *
 * `withVersion('billing/webhook')` → `'v1/billing/webhook'`.
 */
export function withVersion(path: string): string {
  return `${API_PREFIX}/${path.replace(/^\/+/, '')}`;
}
