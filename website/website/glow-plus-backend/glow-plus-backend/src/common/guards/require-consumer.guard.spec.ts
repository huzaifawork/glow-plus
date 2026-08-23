/**
 * Tests for RequireConsumerGuard (T18)
 */
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequireConsumerGuard } from './require-consumer.guard';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('RequireConsumerGuard', () => {
  const guard = new RequireConsumerGuard();

  it('allows a consumer', () => {
    expect(guard.canActivate(ctx({ accountRole: 'consumer', accountId: 'u_1' }))).toBe(true);
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

  it('refuses an admin', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'admin', accountId: 'a_1' }))).toThrow(ForbiddenException);
  });

  it('refuses a request with no role at all', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow(ForbiddenException);
  });

  it('refuses a consumer role carrying no accountId', () => {
    expect(() => guard.canActivate(ctx({ accountRole: 'consumer' }))).toThrow(/No account context/);
  });
});
