/**
 * Integration tests  (T65)
 *
 * **What makes these different from the other 29 suites.** Those mock Prisma
 * and assert one unit's behaviour. These boot the **real** Nest application
 * over a **real** Postgres and drive it by **real HTTP**, so they exercise the
 * seams the unit tests cannot see: middleware ordering, the guard chain, URI
 * versioning, the exception envelope, bcrypt, AES-GCM encryption at rest, and
 * foreign keys.
 *
 * That distinction is the entire subject of this engagement — *"functionality
 * that exists vs. functionality that's been validated"*. Every bug T63 found on
 * production (the ungated fetches, the missing admin path) lived in exactly
 * that gap: each unit passed, and the assembled system still misbehaved.
 *
 * **Safety.** These CREATE AND DELETE ROWS, so they refuse to run against
 * anything but an obviously-local database unless `E2E_ALLOW_REMOTE=1` is set
 * explicitly. Same guard, and the same reasoning, as `prisma/seed.ts`.
 *
 * **They SKIP rather than fail when no database is reachable**, so
 * `npm test` stays runnable on a laptop with Docker stopped — which is how it
 * is usually run. CI provides a Postgres service container, so there they run
 * for real.
 */
import 'reflect-metadata';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createApp } from './bootstrap';

const url = process.env.DATABASE_URL ?? '';
const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres)[:/]/.test(url);
const allowed = isLocal || process.env.E2E_ALLOW_REMOTE === '1';

/** Unique per run, so a crashed run never collides with the next one. */
const TAG = `e2e${Date.now()}`;
const CONSUMER = `${TAG}.consumer@glowplus.test`;
const MERCHANT = `${TAG}.salon@glowplus.test`;

let app: INestApplication | undefined;
let server: http.Server | undefined;
let base = '';
let prisma: PrismaClient | undefined;
let reachable = false;

async function req(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; json: any; headers: http.IncomingHttpHeaders }> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request(
      `${base}${path}`,
      {
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (d) => (text += d));
        res.on('end', () => {
          let json: any = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = text;
          }
          resolve({ status: res.statusCode ?? 0, json, headers: res.headers });
        });
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

beforeAll(async () => {
  if (!allowed) return;
  try {
    prisma = new PrismaClient();
    await prisma.$queryRawUnsafe('select 1');
    reachable = true;
  } catch (err) {
    reachable = false;
    // ⚠️ In CI this MUST be fatal. A suite that quietly passes because it never
    // reached a database is worse than no suite at all: it reports green for
    // exactly the integration it failed to test. `E2E_REQUIRE=1` is set in the
    // workflow, so a broken service container fails the build instead of
    // pretending 15 tests passed.
    if (process.env.E2E_REQUIRE === '1') {
      throw new Error(
        `E2E_REQUIRE=1 but the database is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // eslint-disable-next-line no-console
    console.warn('\n⚠  e2e: no database reachable — integration tests did NOT run.\n');
    return;
  }
  app = await createApp();
  await app.init();
  server = http.createServer(app.getHttpAdapter().getInstance() as never);
  await new Promise<void>((r) => server!.listen(0, r));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  if (prisma && reachable) {
    // Scoped to this run's tag. Children before parents.
    const u = await prisma.user.findUnique({ where: { email: CONSUMER } });
    const m = await prisma.merchant.findUnique({ where: { email: MERCHANT } });
    if (u) {
      await prisma.redemption.deleteMany({ where: { userId: u.id } });
      await prisma.booking.deleteMany({ where: { userId: u.id } });
      await prisma.visit.deleteMany({ where: { userId: u.id } });
      await prisma.refreshToken.deleteMany({ where: { accountId: u.id } });
    }
    if (m) {
      await prisma.booking.deleteMany({ where: { merchantId: m.id } });
      await prisma.visit.deleteMany({ where: { merchantId: m.id } });
      await prisma.rewardRule.deleteMany({ where: { merchantId: m.id } });
      await prisma.businessHours.deleteMany({ where: { merchantId: m.id } });
      await prisma.style.deleteMany({ where: { merchantId: m.id } });
      await prisma.subscription.deleteMany({ where: { merchantId: m.id } });
      await prisma.refreshToken.deleteMany({ where: { accountId: m.id } });
    }
    await prisma.emailVerification.deleteMany({ where: { OR: [{ email: CONSUMER }, { email: MERCHANT }] } });
    if (m) await prisma.merchant.delete({ where: { id: m.id } }).catch(() => undefined);
    if (u) await prisma.user.delete({ where: { id: u.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  if (app) await app.close();
}, 60_000);

// `describe` body runs at collection time, before beforeAll, so the skip has to
// be decided here from configuration rather than from `reachable`.
const run = allowed ? describe : describe.skip;

run('integration: the whole stack over real HTTP and real Postgres (T65)', () => {
  const state: Record<string, string> = {};

  const it_ = (name: string, fn: () => Promise<void>, timeout = 30_000) =>
    it(name, async () => {
      if (!reachable) return; // database went away between collection and run
      await fn();
    }, timeout);

  describe('auth', () => {
    it_('signs a consumer up, rejects the duplicate, and logs them in', async () => {
      const signup = await req('POST', '/v1/auth/signup', {
        email: CONSUMER, password: 'E2ePassword123!', name: 'E2E Consumer', phone: '+14165550000',
      });
      expect(signup.status).toBe(201);

      const dupe = await req('POST', '/v1/auth/signup', {
        email: CONSUMER, password: 'E2ePassword123!', name: 'Dupe',
      });
      expect(dupe.status).toBe(409);

      // ⚠️ T81 — an unverified address cannot sign in, and this suite cannot
      // click a link in an email. Marked verified directly, which is the only
      // honest option: the alternative is reading the token out of
      // EmailVerification and calling the confirm route, which would make
      // every test below depend on the email flow rather than on the thing it
      // is actually testing. Verification has its own coverage.
      //
      // This is what broke CI on 2026-08-28 and kept it red: T81 landed after
      // T65 wrote this test, login started answering 403, and every test after
      // it cascaded because `state.consumerToken` was never set.
      await prisma!.user.update({
        where: { email: CONSUMER },
        data: { emailVerifiedAt: new Date() },
      });

      const login = await req('POST', '/v1/auth/login', { email: CONSUMER, password: 'E2ePassword123!' });
      expect(login.status).toBe(201);
      state.consumerToken = login.json.token;
      expect(typeof state.consumerToken).toBe('string');
    });

    it_('refuses the wrong password without revealing which field was wrong', async () => {
      const bad = await req('POST', '/v1/auth/login', { email: CONSUMER, password: 'WrongPassword123!' });
      expect(bad.status).toBe(401);
      // Same message as an unknown email — the enumeration guard.
      expect(String(bad.json.message)).toMatch(/invalid email or password/i);
    });

    it_('stores the password as bcrypt and the phone as ciphertext, never plaintext', async () => {
      // Raw SQL: going through the Prisma model could let application-layer
      // decryption hide what is actually on disk.
      const rows: any[] = await prisma!.$queryRawUnsafe(
        `select "passwordHash", phone, "phoneFingerprint" from "User" where email = $1`, CONSUMER,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(rows[0].passwordHash).not.toContain('E2ePassword123!');
      expect(rows[0].phone).not.toContain('4165550000');
      expect(String(rows[0].phone)).toMatch(/^v\d+:/);
      expect(rows[0].phoneFingerprint).toBeTruthy();
    });
  });

  describe('authz', () => {
    it_('refuses a protected route with no token, a junk token, and a foreign role', async () => {
      expect((await req('GET', '/v1/me')).status).toBe(401);
      expect((await req('GET', '/v1/me', undefined, 'not-a-jwt')).status).toBe(401);
      // A consumer token must not open a merchant-only route.
      expect((await req('GET', '/v1/merchants/me', undefined, state.consumerToken)).status).toBe(403);
    });

    it_('accepts the right token on the right route', async () => {
      const me = await req('GET', '/v1/me', undefined, state.consumerToken);
      expect(me.status).toBe(200);
      expect(me.json.email).toBe(CONSUMER);
    });
  });

  describe('merchant lifecycle and public visibility', () => {
    it_('creates a salon PENDING and keeps it out of the public directory', async () => {
      // ⚠️ The salon row is created directly rather than through
      // `POST /merchants/signup`, and that is not laziness.
      //
      // That endpoint calls `stripe.customers.create()` BEFORE writing the
      // row, so it needs a live Stripe key and network access. Requiring one
      // here would mean this suite could not run from a fork, from the
      // client's copy of the repo, or offline — for the sake of one call whose
      // behaviour T63 already verified against production.
      //
      // Worth recording as a property of the system rather than of this test:
      // **a Stripe outage blocks every salon signup.** The verification email
      // beside it is wrapped in try/catch precisely so a Resend outage cannot;
      // the Stripe call has no such guard. Deferring customer creation to
      // checkout would remove that dependency, and is a design decision for
      // the client rather than a defect to fix silently.
      const bcrypt = await import('bcryptjs');
      const created = await prisma!.merchant.create({
        data: {
          businessName: 'E2E Salon',
          email: MERCHANT,
          passwordHash: await bcrypt.hash('E2eSalon123!', 12),
          status: 'PENDING',
          stripeCustomerId: `cus_e2e_${TAG}`,
          foundingMember: true,
          // T81, same reason as the consumer above: merchant login refuses an
          // unverified address too.
          emailVerifiedAt: new Date(),
        },
      });
      state.merchantId = created.id;
      expect(created.status).toBe('PENDING');

      // [F74] — approval alone is no longer enough to be shown to customers;
      // `LISTABLE_MERCHANT_WHERE` also requires a paying subscription. That
      // rule landed after this test was written, so the salon could never
      // appear in the directory however ACTIVE it became, and
      // `assertMerchantVisible` 404'd its booking routes for the same reason.
      //
      // TRIALING rather than ACTIVE deliberately: it is the state a real salon
      // is in for its first week, so the suite exercises the case that
      // actually occurs rather than the tidiest one.
      await prisma!.subscription.create({
        data: {
          merchantId: created.id,
          stripeSubscriptionId: `sub_e2e_${TAG}`,
          plan: 'MONTHLY',
          priceCents: 4999,
          status: 'TRIALING',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Login DOES go through the real endpoint — it touches no third party.
      const login = await req('POST', '/v1/merchants/login', { email: MERCHANT, password: 'E2eSalon123!' });
      expect(login.status).toBe(201);
      state.merchantToken = login.json.token;
      expect(typeof state.merchantToken).toBe('string');

      const dir = await req('GET', '/v1/merchants');
      expect(dir.json.some((m: any) => m.id === state.merchantId)).toBe(false);
    });

    it_('publishes the salon once it is ACTIVE', async () => {
      await prisma!.merchant.update({ where: { id: state.merchantId }, data: { status: 'ACTIVE' } });
      const dir = await req('GET', '/v1/merchants');
      expect(dir.json.some((m: any) => m.id === state.merchantId)).toBe(true);
    });

    it_('hides it again the moment it is SUSPENDED', async () => {
      await prisma!.merchant.update({ where: { id: state.merchantId }, data: { status: 'SUSPENDED' } });
      const dir = await req('GET', '/v1/merchants');
      expect(dir.json.some((m: any) => m.id === state.merchantId)).toBe(false);
      // And the paywall closes on writes.
      const blocked = await req('POST', '/v1/styles',
        { name: 'Blocked', type: 'HAIR', pointsPerVisit: 5 }, state.merchantToken);
      expect(blocked.status).toBe(403);
      await prisma!.merchant.update({ where: { id: state.merchantId }, data: { status: 'ACTIVE' } });
    });
  });

  describe('rewards', () => {
    it_('accrues points across visits and unlocks the rule at its threshold', async () => {
      const style = await req('POST', '/v1/styles',
        { name: 'E2E Blowout', type: 'HAIR', pointsPerVisit: 10 }, state.merchantToken);
      expect(style.status).toBe(201);
      state.styleId = style.json.id;

      const rule = await req('POST', '/v1/reward-rules', {
        name: 'E2E 20% off', triggerType: 'VISIT_COUNT', triggerValue: 3,
        rewardType: 'PERCENT_OFF', rewardValue: 20,
      }, state.merchantToken);
      expect(rule.status).toBe(201);
      state.ruleId = rule.json.id;

      for (let i = 0; i < 3; i++) {
        const v = await req('POST', '/v1/visits',
          { clientEmail: CONSUMER, clientName: 'E2E Consumer', styleId: state.styleId }, state.merchantToken);
        expect(v.status).toBe(201);
      }

      const rewards = await req('GET', '/v1/me/rewards', undefined, state.consumerToken);
      expect(rewards.json.totalPoints).toBe(30);
      const block = rewards.json.merchants.find((m: any) => m.merchantId === state.merchantId);
      expect(block.rewards.find((r: any) => r.ruleId === state.ruleId).eligible).toBe(true);
    });

    it_('redeems once and refuses the second attempt at the same milestone', async () => {
      const first = await req('POST', '/v1/redemptions', { rewardRuleId: state.ruleId }, state.consumerToken);
      expect(first.status).toBe(201);
      const second = await req('POST', '/v1/redemptions', { rewardRuleId: state.ruleId }, state.consumerToken);
      expect(second.status).toBe(400);
    });
  });

  describe('bookings', () => {
    it_('enforces opening hours on the WRITE path, not just the slot grid [F64]', async () => {
      const days = [...Array(7)].map((_, d) => ({ dayOfWeek: d, openTime: '09:00', closeTime: '17:00', closed: d === 0 }));
      expect((await req('PUT', '/v1/business-hours', { days }, state.merchantToken)).status).toBe(200);

      // ⚠️ The `+ 7` is load-bearing. JavaScript's % keeps the sign of the
      // dividend, so (1 - 3) % 7 is -2, not 5 — without it "next Monday"
      // resolves to Monday of THIS week, in the past, and the API correctly
      // offers no slots for a day that has already gone. That failed the
      // booking test honestly and, worse, made the closed-Sunday test PASS for
      // the wrong reason, since a past date also returns [].
      const nextDow = (dow: number) => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + (((dow - d.getUTCDay() + 7) % 7) || 7));
        return d.toISOString().slice(0, 10);
      };
      const sunday = nextDow(0);
      const monday = nextDow(1);

      const post = (startTime: string) =>
        req('POST', '/v1/bookings', { merchantId: state.merchantId, styleId: state.styleId, startTime }, state.consumerToken);

      // A slot grid is a suggestion; the write path must refuse these itself.
      expect((await post(`${sunday}T14:00:00.000Z`)).status).toBe(400); // closed day
      expect((await post(`${monday}T07:00:00.000Z`)).status).toBe(400); // before opening
      expect((await post(`${monday}T21:00:00.000Z`)).status).toBe(400); // past closing

      const slots = await req('GET', `/v1/bookings/availability?merchantId=${state.merchantId}&styleId=${state.styleId}&date=${monday}`);
      expect(slots.json.length).toBeGreaterThan(0);

      const good = await post(slots.json[0].startTime);
      expect(good.status).toBe(201);
      // The same slot twice must lose to the conflict check, which runs first.
      expect((await post(slots.json[0].startTime)).status).toBe(400);
    });

    it_('offers no slots on a closed day', async () => {
      // Same `+ 7` as above, and for a sharper reason here: with the negative
      // modulo this test asked about a Sunday in the PAST and passed on that,
      // proving nothing about the closed-day rule it exists to check.
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + (((0 - d.getUTCDay() + 7) % 7) || 7));
      const date = d.toISOString().slice(0, 10);
      const slots = await req('GET',
        `/v1/bookings/availability?merchantId=${state.merchantId}&styleId=${state.styleId}&date=${date}`);
      expect(slots.json).toEqual([]);
      // Prove the date really is a future Sunday, so this can never again pass
      // because the day had simply gone by.
      expect(new Date(`${date}T12:00:00Z`).getUTCDay()).toBe(0);
      expect(new Date(`${date}T12:00:00Z`).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('billing webhook', () => {
    it_('refuses an unsigned event and one with a bad signature', async () => {
      const unsigned = await req('POST', '/v1/billing/webhook', { id: 'evt_x', type: 'checkout.session.completed' });
      expect(unsigned.status).toBe(400);
      expect(JSON.stringify(unsigned.json)).toMatch(/signature/i);
    });
  });

  describe('the error envelope every client renders', () => {
    it_('is { statusCode, message, error } with message always a string', async () => {
      const bad = await req('POST', '/v1/auth/login', { email: 'nope' });
      expect(bad.status).toBe(400);
      expect(typeof bad.json.message).toBe('string');
      expect(bad.json).toHaveProperty('statusCode', 400);
      expect(bad.json).toHaveProperty('error');
      // ValidationPipe's array moves to `details`, because the RN client
      // renders body.message directly.
      expect(Array.isArray(bad.json.details)).toBe(true);
    });

    it_('carries the security headers on an error response too', async () => {
      const r = await req('GET', '/v1/me');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['x-powered-by']).toBeUndefined();
    });
  });
});
