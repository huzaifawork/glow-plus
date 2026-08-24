/**
 * Tests for RequireActiveSubscriptionGuard  (T29)
 *
 * The defect this replaces ([F30]) was not a wrong decision — the old
 * middleware's logic read correctly. It was that the code never ran, and that
 * PAST_DUE's "read-only" was a flag no handler ever checked. So these tests
 * assert on the two things that actually failed: that a refusal happens at
 * all, and that PAST_DUE refuses *writes specifically* rather than setting a
 * flag and continuing.
 */
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequireActiveSubscriptionGuard } from './require-active-subscription.guard';
import { PrismaService } from '../../prisma/prisma.service';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function guardFor(status: string | null) {
  const prisma = {
    merchant: { findUnique: jest.fn().mockResolvedValue(status === null ? null : { status }) },
  } as unknown as PrismaService;
  return new RequireActiveSubscriptionGuard(prisma);
}

describe('RequireActiveSubscriptionGuard', () => {
  it('allows an ACTIVE merchant to read and write', async () => {
    await expect(guardFor('ACTIVE').canActivate(ctx({ merchantId: 'm_1', method: 'GET' }))).resolves.toBe(true);
    await expect(guardFor('ACTIVE').canActivate(ctx({ merchantId: 'm_1', method: 'POST' }))).resolves.toBe(true);
  });

  it('allows a TRIALING merchant — a trial is a paying state', async () => {
    await expect(guardFor('TRIALING').canActivate(ctx({ merchantId: 'm_1', method: 'POST' }))).resolves.toBe(true);
  });

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

  it('PAST_DUE may read', async () => {
    const req = { merchantId: 'm_1', method: 'GET' } as Record<string, unknown>;
    await expect(guardFor('PAST_DUE').canActivate(ctx(req))).resolves.toBe(true);
    expect(req.readOnly).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('PAST_DUE refuses %s', async (method) => {
    await expect(guardFor('PAST_DUE').canActivate(ctx({ merchantId: 'm_1', method }))).rejects.toThrow(/read-only/);
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
