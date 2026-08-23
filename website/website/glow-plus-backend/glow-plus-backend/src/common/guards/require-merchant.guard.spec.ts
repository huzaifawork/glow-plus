/**
 * Tests for RequireMerchantGuard  (T17)
 *
 * Reproduces the auth error T17 is about: a consumer's token reaching a
 * merchant-only billing route. Before the guard that produced a bare 500,
 * because `req.merchantId` was undefined and Prisma rejected the query.
 */
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequireMerchantGuard } from './require-merchant.guard';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('RequireMerchantGuard', () => {
  const guard = new RequireMerchantGuard();

  it('allows a merchant owner', () => {
    expect(guard.canActivate(ctx({ accountRole: 'merchant_owner', merchantId: 'm_1' }))).toBe(true);
  });

  it('allows merchant staff', () => {
    expect(guard.canActivate(ctx({ accountRole: 'merchant_staff', merchantId: 'm_1' }))).toBe(true);
  });

  it('refuses a consumer — this is the bug T17 reproduces', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'consumer', accountId: 'u_1' }))).toThrow(ForbiddenException);
  });

  it('refuses an admin — admin is not a merchant, and has no merchant context', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'admin', accountId: 'a_1' }))).toThrow(ForbiddenException);
  });

  it('refuses a request with no role at all', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow(ForbiddenException);
  });

  it('refuses a merchant role carrying NO merchantId', () => {
    // Should be impossible, but an undefined merchantId silently widens every
    // downstream `where` clause to the whole table rather than failing [F29].
    expect(() => guard.canActivate(ctx({ accountRole: 'merchant_owner' }))).toThrow(/No merchant context/);
  });
});
