/**
 * Tests for RequireMerchantOwnerGuard  (T24)
 *
 * The distinction this guard adds over RequireMerchantGuard is the one
 * [F6] never made: `merchant_staff` is a real merchant, for the right
 * salon, and must still be refused here.
 */
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequireMerchantOwnerGuard } from './require-merchant-owner.guard';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('RequireMerchantOwnerGuard', () => {
  const guard = new RequireMerchantOwnerGuard();

  it('allows a merchant owner', () => {
    expect(guard.canActivate(ctx({ accountRole: 'merchant_owner', merchantId: 'm_1' }))).toBe(true);
  });

  it('refuses merchant staff — the whole point of T24', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'merchant_staff', merchantId: 'm_1' }))).toThrow(ForbiddenException);
  });

  it('tells staff they lack the ROLE, not that they lack a merchant account', () => {
    // A staff member reading "requires a merchant account" would read it as
    // a bug — they are signed in to the right salon.
    expect(() => guard.canActivate(ctx({ accountRole: 'merchant_staff', merchantId: 'm_1' }))).toThrow(/owner account/);
  });

  it('refuses a consumer', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'consumer', accountId: 'u_1' }))).toThrow(ForbiddenException);
  });

  it('refuses an admin — admin is not a merchant owner', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'admin', accountId: 'a_1' }))).toThrow(ForbiddenException);
  });

  it('refuses a request with no role at all', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow(ForbiddenException);
  });

  it('refuses an owner role carrying NO merchantId [F29]', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'merchant_owner' }))).toThrow(/No merchant context/);
  });
});
