/**
 * Tests for API versioning  (T49)
 *
 * The interesting thing here is not `withVersion()` — that function is three
 * lines and obviously correct. It is that **four independent places have to
 * agree about the prefix**, and three of them match against the RAW URL, where
 * Nest's versioning does not reach:
 *
 *   - `app.module.ts`      — AuthMiddleware's exclusion list
 *   - `throttling.ts`      — `EXEMPT_PATHS`
 *   - `billing.module.ts`  — the `express.raw()` mount for the Stripe webhook
 *   - `health.controller`  — the one route that opts OUT, VERSION_NEUTRAL
 *
 * Each fails silently and differently: a missed exclusion makes a public route
 * demand a token, a missed exemption makes Stripe get 429'd (so Stripe
 * *retries*, manufacturing the load the limiter was shedding), a missed raw
 * mount 400s every webhook signature [F19], and prefixing health 401s every
 * uptime probe. None of them is a compile error and none shows up in a test
 * of the route's own service, which is why these read the source: the failure
 * mode is **drift between the four**, and a per-file test passes happily while
 * that is true. Same reasoning as T50's cross-controller shape tests.
 */
import 'reflect-metadata';
import { VERSION_NEUTRAL } from '@nestjs/common';
import { VERSION_METADATA } from '@nestjs/common/constants';
import { API_PREFIX, API_VERSION, withVersion } from './version';
import { isExemptPath } from '../common/throttling';
import { HealthController } from '../modules/health/health.controller';

const read = (rel: string) =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('fs').readFileSync(require('path').join(__dirname, '..', rel), 'utf8');

/**
 * `read` with comments stripped.
 *
 * Needed for the negative assertions only — "this file must NOT call
 * `.listen()`". These files explain at length *why* they avoid a thing, so the
 * forbidden pattern appears in the prose that documents it, and a naive
 * `not.toMatch` fails on a file that is entirely correct. Positive assertions
 * keep using `read`: matching a pattern that only exists in a comment is a far
 * less likely mistake than mentioning one you are avoiding.
 */
const readCode = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('withVersion (T49)', () => {
  it('derives the prefix from the version, so a bump is one edit', () => {
    expect(API_PREFIX).toBe(`v${API_VERSION}`);
  });

  it('prefixes a bare path', () => {
    expect(withVersion('billing/webhook')).toBe('v1/billing/webhook');
  });

  it('tolerates a leading slash rather than emitting a double one', () => {
    // Nest matches 'v1/x' and '/v1/x' alike, but 'v1//x' matches nothing —
    // a silent 401 on a route that reads correctly in the diff.
    expect(withVersion('/billing/webhook')).toBe('v1/billing/webhook');
    expect(withVersion('///merchants')).toBe('v1/merchants');
  });

  it('leaves a path pattern intact, because the exclusions use them', () => {
    expect(withVersion('business-hours/(.*)')).toBe('v1/business-hours/(.*)');
  });
});

describe('the raw-URL matchers all carry the prefix (T49)', () => {
  it('every AuthMiddleware exclusion is versioned EXCEPT the two health ones', () => {
    const src = read('app.module.ts');
    const exclusions = src.slice(src.indexOf('.exclude('), src.indexOf(".forRoutes('*')", src.indexOf('.exclude(')));
    const entries = exclusions.match(/\{\s*path:[\s\S]*?\}/g) ?? [];

    // 16 exclusions: 2 health (unversioned, deliberately) + 14 versioned.
    // T54 added the cron dispatcher, which must be excluded because Vercel
    // sends CRON_SECRET in the Authorization header AuthMiddleware parses.
    // T83 added merchants/(.*)/capacity — public, like the menu and hours.
    expect(entries).toHaveLength(17);

    const unversioned = entries.filter((e: string) => !e.includes('withVersion('));
    expect(unversioned).toHaveLength(2);
    // Health is VERSION_NEUTRAL, so its exclusion must NOT be prefixed —
    // prefixing it 401s every uptime probe. Named, not merely counted.
    expect(unversioned.every((e: string) => /path:\s*'health/.test(e))).toBe(true);
  });

  it("the Stripe webhook's express.raw() mount is versioned [F19]", () => {
    // Miss this and req.rawBody is never set, so constructEvent() fails the
    // signature on EVERY event, as a 400.
    const src = read('modules/billing/billing.module.ts');

    expect(src).toMatch(/forRoutes\(\{\s*path:\s*withVersion\('billing\/webhook'\)/);
    expect(src).not.toMatch(/path:\s*'billing\/webhook'/);
  });

  it('bootstraps URI versioning with the shared constant, not a literal', () => {
    // T56 — this moved out of main.ts into bootstrap.ts when the serverless
    // entry point was added. It is asserted on bootstrap.ts specifically
    // because that is now the ONE place both entry points configure the app.
    const src = read('bootstrap.ts');

    expect(src).toMatch(/enableVersioning\(\{[^}]*type:\s*VersioningType\.URI/);
    expect(src).toMatch(/defaultVersion:\s*API_VERSION/);
  });

  // T56 — the reason the assertion above is still meaningful. Versioning being
  // configured in bootstrap.ts only guarantees anything for an entry point
  // that actually GOES through bootstrap.ts. If a future edit re-inlines
  // NestFactory.create() into either entry point, that entry point silently
  // loses URI versioning — and every route on it moves back off /v1 — while
  // the test above keeps passing because bootstrap.ts is still correct.
  //
  // The serverless path is the dangerous half: nothing in the local dev loop
  // or the Jest suite exercises it, so on Vercel it would 404 every route and
  // locally everything would look fine.
  it.each(['main.ts', 'serverless.ts'])(
    'entry point %s builds the app through bootstrap.ts, never its own NestFactory',
    (entry) => {
      expect(read(entry)).toMatch(/from\s+'\.\/bootstrap'/);
      expect(read(entry)).toMatch(/createApp\(\)/);
      // The whole point: neither entry point may construct an app of its own.
      expect(readCode(entry)).not.toMatch(/NestFactory\.create/);
    },
  );

  it('the serverless entry initialises without listening', () => {
    // app.listen() on Vercel binds a port nothing routes to and holds the
    // invocation open; app.init() is the half that builds the DI container.
    expect(read('serverless.ts')).toMatch(/\.init\(\)/);
    expect(readCode('serverless.ts')).not.toMatch(/\.listen\(/);
  });

  it('the serverless entry caches the bootstrap promise, not the resolved app', () => {
    // A cold container can take concurrent requests before the first
    // bootstrap resolves. Caching the promise makes the later ones await the
    // in-flight bootstrap; caching only the resolved app lets each start its
    // own, racing several Prisma pools against connection_limit=1 (T52).
    expect(read('serverless.ts')).toMatch(/let\s+handlerPromise/);
    // Assigned before the await, so a second caller finds it already set.
    expect(read('serverless.ts')).toMatch(/handlerPromise\s*=\s*buildHandler\(\)/);
    expect(readCode('serverless.ts')).not.toMatch(/handlerPromise\s*=\s*await/);
  });
});

describe('isExemptPath tolerates the version prefix (T49)', () => {
  it('exempts the versioned Stripe webhook', () => {
    expect(isExemptPath(withVersion('/billing/webhook'))).toBe(true);
    expect(isExemptPath('/v1/billing/webhook')).toBe(true);
  });

  it('still exempts health UNVERSIONED, which is where it actually lives', () => {
    expect(isExemptPath('/health')).toBe(true);
    expect(isExemptPath('/health/ready')).toBe(true);
  });

  it('keeps working after a version bump, so /v2 is not a fresh outage', () => {
    // The prefix is optional in the pattern on purpose: health is genuinely
    // un-prefixed while the webhook is versioned, and one pattern that accepts
    // either survives the next bump instead of turning a missed edit into
    // Stripe receiving 429s.
    expect(isExemptPath('/v2/billing/webhook')).toBe(true);
    expect(isExemptPath('/v12/billing/webhook')).toBe(true);
  });

  it('exempts nothing else — the prefix must not have widened the match', () => {
    expect(isExemptPath('/v1/billing/checkout')).toBe(false);
    expect(isExemptPath('/v1/auth/login')).toBe(false);
    expect(isExemptPath('/v1/healthcheck')).toBe(false);
    expect(isExemptPath('/v1/admin/health')).toBe(false);
    // Not a version segment — 'vessels' must not read as 'v' + digits.
    expect(isExemptPath('/vessels/billing/webhook')).toBe(false);
    expect(isExemptPath('/v/billing/webhook')).toBe(false);
  });
});

describe('HealthController opts out of versioning (T49)', () => {
  it('is VERSION_NEUTRAL, so probes keep answering at /health', () => {
    // Read off the decorator rather than the source text: this is the metadata
    // Nest actually routes on. A liveness check that 404s the day the API goes
    // to /v2 is an outage that is not one.
    expect(Reflect.getMetadata(VERSION_METADATA, HealthController)).toBe(VERSION_NEUTRAL);
  });

  it('is the ONLY controller that opts out', () => {
    // A second VERSION_NEUTRAL controller is a route quietly left outside /v1
    // — the dual-serving this task exists to avoid — and it would be invisible
    // in every test of that route's own behaviour.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const src = path.join(__dirname, '..');

    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e: any) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return e.name.endsWith('.controller.ts') ? [full] : [];
      });

    const controllers = walk(src);
    // Guard the guard: a walk that silently found nothing would pass forever.
    expect(controllers.length).toBeGreaterThan(5);

    const neutral = controllers
      .filter((f: string) => /VERSION_NEUTRAL/.test(fs.readFileSync(f, 'utf8')))
      .map((f: string) => path.basename(f));

    expect(neutral).toEqual(['health.controller.ts']);
  });
});
