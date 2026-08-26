/**
 * Tests for RequireAdminOwnerGuard (T77)
 *
 * The interesting cases here are not "does it check a string" — they are the
 * two ways this guard is deliberately stricter than reading the JWT would be:
 * a demoted admin loses the power immediately rather than when their token
 * expires, and a deleted admin is refused even though their token is still
 * cryptographically valid for up to 15 minutes.
 */
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequireAdminOwnerGuard } from './require-admin-owner.guard';
import { PrismaService } from '../../prisma/prisma.service';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

/** Only the one call the guard makes. */
function prismaWith(admin: { role: string } | null) {
  return {
    admin: { findUnique: jest.fn().mockResolvedValue(admin) },
  } as unknown as PrismaService;
}

describe('RequireAdminOwnerGuard', () => {
  it('allows an OWNER', async () => {
    const guard = new RequireAdminOwnerGuard(prismaWith({ role: 'OWNER' }));
    await expect(guard.canActivate(ctx({ accountRole: 'admin', accountId: 'a_1' }))).resolves.toBe(
      true,
    );
  });

  it('refuses a plain ADMIN — approving a salon and choosing who administers the platform are different powers', async () => {
    const guard = new RequireAdminOwnerGuard(prismaWith({ role: 'ADMIN' }));
    await expect(
      guard.canActivate(ctx({ accountRole: 'admin', accountId: 'a_2' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses an admin whose row no longer exists, though the token is still valid', async () => {
    const guard = new RequireAdminOwnerGuard(prismaWith(null));
    await expect(
      guard.canActivate(ctx({ accountRole: 'admin', accountId: 'a_deleted' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a consumer', async () => {
    const guard = new RequireAdminOwnerGuard(prismaWith({ role: 'OWNER' }));
    await expect(
      guard.canActivate(ctx({ accountRole: 'consumer', accountId: 'u_1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a merchant owner — a different kind of "owner" entirely', async () => {
    const guard = new RequireAdminOwnerGuard(prismaWith({ role: 'OWNER' }));
    await expect(
      guard.canActivate(ctx({ accountRole: 'merchant_owner', accountId: 'u_1', merchantId: 'm_1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses an admin role carrying no accountId — the empty-string id case', async () => {
    const guard = new RequireAdminOwnerGuard(prismaWith({ role: 'OWNER' }));
    await expect(guard.canActivate(ctx({ accountRole: 'admin', accountId: '' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('does not hit the database before establishing the role', async () => {
    const prisma = prismaWith({ role: 'OWNER' });
    const guard = new RequireAdminOwnerGuard(prisma);
    await expect(
      guard.canActivate(ctx({ accountRole: 'consumer', accountId: 'u_1' })),
    ).rejects.toThrow(ForbiddenException);
    expect((prisma.admin.findUnique as jest.Mock)).not.toHaveBeenCalled();
  });
});
