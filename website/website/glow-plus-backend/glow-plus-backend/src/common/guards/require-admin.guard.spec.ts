/**
 * Tests for RequireAdminGuard (T22) [F7]
 */
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequireAdminGuard } from './require-admin.guard';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('RequireAdminGuard', () => {
  const guard = new RequireAdminGuard();

  it('allows an admin', () => {
    expect(guard.canActivate(ctx({ accountRole: 'admin', accountId: 'a_1' }))).toBe(true);
  });

  it('refuses a consumer — the exact F31 leak vector (consumer token read /admin/merchants/pending)', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'consumer', accountId: 'u_1' }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a merchant owner', () => {
    expect(() =>
      guard.canActivate(ctx({ accountRole: 'merchant_owner', accountId: 'u_1', merchantId: 'm_1' })),
    ).toThrow(ForbiddenException);
  });

  it('refuses merchant staff', () => {
    expect(() =>
      guard.canActivate(ctx({ accountRole: 'merchant_staff', accountId: 'u_1', merchantId: 'm_1' })),
    ).toThrow(ForbiddenException);
  });

  it('refuses a request with no role at all', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow(ForbiddenException);
  });

  it('refuses an admin role carrying no accountId', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'admin' }))).toThrow(/No account context/);
  });
});
