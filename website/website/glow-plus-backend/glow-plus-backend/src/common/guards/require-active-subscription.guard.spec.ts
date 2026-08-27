/**
 * Tests for RequireActiveSubscriptionGuard  (T29, extended by T78)
 *
 * The defect T29 replaced ([F30]) was not a wrong decision — the old
 * middleware's logic read correctly. It was that the code never ran, and that
 * PAST_DUE's "read-only" was a flag no handler ever checked. So these tests
 * assert on the two things that actually failed: that a refusal happens at
 * all, and that PAST_DUE refuses *writes specifically* rather than setting a
 * flag and continuing.
 *
 * T78 adds the half that was still missing. Despite its name this guard never
 * looked at a subscription — it refused only SUSPENDED and CANCELLED, which a
 * salon can reach ONLY after having had a plan and losing it. A salon that
 * never subscribed was never refused. Verified against production before the
 * fix: a PENDING salon, never approved and never paid, created a service and
 * logged a visit that awarded loyalty points. Admin approval made it worse,
 * not better, because `approve()` sets ACTIVE with no billing check.
 *
 * The helper now takes BOTH halves of the real model — the merchant's status
 * and its plan's status — because the old one could express "a TRIALING
 * merchant", which is not a thing: TRIALING is a Subscription status, and
 * MerchantStatus has no such value.
 */
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequireActiveSubscriptionGuard } from './require-active-subscription.guard';
import { PrismaService } from '../../prisma/prisma.service';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

/** `merchantStatus === null` means the row is gone. `plan === null` means never subscribed. */
function guardFor(merchantStatus: string | null, plan: string | null = 'ACTIVE') {
  const prisma = {
    merchant: {
      findUnique: jest.fn().mockResolvedValue(
        merchantStatus === null
          ? null
          : { status: merchantStatus, subscription: plan === null ? null : { status: plan } },
      ),
    },
  } as unknown as PrismaService;
  return new RequireActiveSubscriptionGuard(prisma);
}

describe('RequireActiveSubscriptionGuard', () => {
  it('allows an ACTIVE merchant on an ACTIVE plan to read and write', async () => {
    await expect(guardFor('ACTIVE', 'ACTIVE').canActivate(ctx({ merchantId: 'm_1', method: 'GET' }))).resolves.toBe(true);
    await expect(guardFor('ACTIVE', 'ACTIVE').canActivate(ctx({ merchantId: 'm_1', method: 'POST' }))).resolves.toBe(true);
  });

  it('allows a TRIALING plan — the trial IS the free period, 7 days or 37 for founding salons', async () => {
    await expect(guardFor('ACTIVE', 'TRIALING').canActivate(ctx({ merchantId: 'm_1', method: 'POST' }))).resolves.toBe(true);
  });

  // ---------------------------------------------------------------------
  // T78 — never subscribed at all
  // ---------------------------------------------------------------------

  it('refuses a PENDING salon that has never paid — it created a service and logged points in production', async () => {
    await expect(
      guardFor('PENDING', null).canActivate(ctx({ merchantId: 'm_1', method: 'POST' })),
    ).rejects.toThrow(/does not have an active plan/);
  });

  it('refuses an ADMIN-APPROVED salon with no plan — approve() sets ACTIVE without any billing check', async () => {
    await expect(
      guardFor('ACTIVE', null).canActivate(ctx({ merchantId: 'm_1', method: 'POST' })),
    ).rejects.toThrow(/does not have an active plan/);
  });

  it('refuses reads too, not just writes — free access is free access', async () => {
    await expect(
      guardFor('ACTIVE', null).canActivate(ctx({ merchantId: 'm_1', method: 'GET' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a plan that ended — CANCELED subscription on a merchant still marked ACTIVE', async () => {
    await expect(
      guardFor('ACTIVE', 'CANCELED').canActivate(ctx({ merchantId: 'm_1', method: 'GET' })),
    ).rejects.toThrow(/does not have an active plan/);
  });

  // ---------------------------------------------------------------------
  // The original T29 cases
  // ---------------------------------------------------------------------

  it.each(['SUSPENDED', 'CANCELLED'])('refuses %s outright, reads included', async (status) => {
    await expect(guardFor(status).canActivate(ctx({ merchantId: 'm_1', method: 'GET' }))).rejects.toThrow(
      /Subscription inactive/,
    );
  });

  it('SUSPENDED refuses a write — this is [F30] exactly: POST /styles returned 201', async () => {
    await expect(guardFor('SUSPENDED').canActivate(ctx({ merchantId: 'm_1', method: 'POST' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('PAST_DUE may read, and keeps its read-only grace rather than falling into the no-plan refusal', async () => {
    const req = { merchantId: 'm_1', method: 'GET' } as Record<string, unknown>;
    await expect(guardFor('PAST_DUE', 'PAST_DUE').canActivate(ctx(req))).resolves.toBe(true);
    expect(req.readOnly).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('PAST_DUE refuses %s', async (method) => {
    await expect(guardFor('PAST_DUE', 'PAST_DUE').canActivate(ctx({ merchantId: 'm_1', method }))).rejects.toThrow(
      /read-only/,
    );
  });

  it('refuses when the merchant row is gone', async () => {
    await expect(guardFor(null).canActivate(ctx({ merchantId: 'm_1', method: 'GET' }))).rejects.toThrow(
      /Unknown merchant/,
    );
  });

  it('refuses with no merchant context — never queries with an undefined id [F29]', async () => {
    await expect(guardFor('ACTIVE').canActivate(ctx({ method: 'GET' }))).rejects.toThrow(/No merchant context/);
  });
});
