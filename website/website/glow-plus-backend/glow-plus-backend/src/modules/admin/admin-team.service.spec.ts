/**
 * Tests for admin team management (T77)
 *
 * Promotion is the ONLY way to gain an admin account through the API — creating
 * one outright is deliberately not exposed, and remains a Supabase/CLI action.
 * These cover the two properties that make promotion safe: the customer's
 * existing hash is reused rather than a new password being invented, and no
 * passwordHash is ever selected back out.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    admin: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'a_new', ...data })),
      count: jest.fn().mockResolvedValue(2),
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

/** The third dependency is only reached on an email change; a stub suffices. */
function makeService(prisma: any, emailVerification: any = { sendVerificationEmail: jest.fn() }) {
  return new AdminService(prisma, {} as MerchantsService, emailVerification);
}

describe('AdminService — team management (T77)', () => {
  describe('promoteUser', () => {
    function withUser(prisma: any, role = 'CONSUMER') {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u_1', email: 'c@y.com', role });
    }

    it('sets User.role and lets the trigger create the Admin row — the same gesture as the Supabase dropdown', async () => {
      const prisma = makePrisma();
      withUser(prisma);
      await makeService(prisma).promoteUser({ userId: 'u_1' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u_1' },
        data: { role: 'ADMIN' },
      });
      // The service must NOT write the Admin table itself; two mechanisms
      // doing the same job is how they drift apart.
      expect(prisma.admin.create).not.toHaveBeenCalled();
    });

    it('defaults a promoted customer to ADMIN, never OWNER', async () => {
      const prisma = makePrisma();
      withUser(prisma);
      await makeService(prisma).promoteUser({ userId: 'u_1' });
      expect((prisma.user.update as jest.Mock).mock.calls[0][0].data.role).toBe('ADMIN');
    });

    it('honours an explicit OWNER', async () => {
      const prisma = makePrisma();
      withUser(prisma);
      await makeService(prisma).promoteUser({ userId: 'u_1', role: 'OWNER' });
      expect((prisma.user.update as jest.Mock).mock.calls[0][0].data.role).toBe('OWNER');
    });

    it('404s on an unknown user', async () => {
      const prisma = makePrisma();
      await expect(makeService(prisma).promoteUser({ userId: 'nope' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses someone who is already an admin, without touching the row', async () => {
      const prisma = makePrisma();
      withUser(prisma, 'ADMIN');
      await expect(makeService(prisma).promoteUser({ userId: 'u_1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('changeOwnPassword', () => {
    const current = 'currentPassword1';

    async function prismaWithPassword() {
      const prisma = makePrisma();
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue({
        id: 'a_1',
        passwordHash: await bcrypt.hash(current, 4),
      });
      return prisma;
    }

    it('rejects a wrong current password — a stolen token must not become permanent ownership', async () => {
      const prisma = await prismaWithPassword();
      await expect(
        makeService(prisma).changeOwnPassword('a_1', {
          currentPassword: 'wrong',
          newPassword: 'newPassword1',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes the USER row when the admin was promoted from a customer — one person, one password', async () => {
      const prisma = await prismaWithPassword();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u_1' });

      await expect(
        makeService(prisma).changeOwnPassword('a_1', {
          currentPassword: current,
          newPassword: 'newPassword1',
        }),
      ).resolves.toEqual({ ok: true });

      // User is written; the sync trigger updates the Admin copy. Writing
      // Admin here instead would leave the panel on the new password and the
      // customer account on the old one.
      const newHash = (prisma.user.update as jest.Mock).mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('newPassword1', newHash)).toBe(true);
      expect(prisma.admin.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('falls back to the Admin row for a standalone admin with no customer account', async () => {
      const prisma = await prismaWithPassword();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await makeService(prisma).changeOwnPassword('a_1', {
        currentPassword: current,
        newPassword: 'newPassword1',
      });

      const newHash = (prisma.admin.update as jest.Mock).mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('newPassword1', newHash)).toBe(true);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('revokes BOTH sessions when the two accounts share a password', async () => {
      const prisma = await prismaWithPassword();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u_1' });
      await makeService(prisma).changeOwnPassword('a_1', {
        currentPassword: current,
        newPassword: 'newPassword1',
      });
      expect((prisma.refreshToken.updateMany as jest.Mock).mock.calls[0][0].where.accountId.in.sort())
        .toEqual(['a_1', 'u_1']);
    });
  });

  describe('listAdmins / listUsers', () => {
    it('never selects passwordHash out of Admin', async () => {
      const prisma = makePrisma();
      makeService(prisma).listAdmins();
      const { select } = (prisma.admin.findMany as jest.Mock).mock.calls[0][0];
      expect(select).not.toHaveProperty('passwordHash');
      expect(Object.keys(select).sort()).toEqual(['createdAt', 'email', 'id', 'role']);
    });

    it('never selects passwordHash or the encrypted phone out of User', async () => {
      const prisma = makePrisma();
      makeService(prisma).listUsers();
      const { select } = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(select).not.toHaveProperty('passwordHash');
      expect(select).not.toHaveProperty('phone');
    });

    it('does surface role, so the picker can tell who is already an admin', async () => {
      const prisma = makePrisma();
      makeService(prisma).listUsers();
      expect((prisma.user.findMany as jest.Mock).mock.calls[0][0].select.role).toBe(true);
    });

    it('caps the user list so it cannot become a full customer export', async () => {
      const prisma = makePrisma();
      makeService(prisma).listUsers('ann');
      expect((prisma.user.findMany as jest.Mock).mock.calls[0][0].take).toBe(50);
    });
  });

  /**
   * Changing the email is changing the LOGIN (T79) — `AdminAuthService.login`
   * finds the account by email and nothing else. These cover the two ways it
   * can go wrong quietly: leaving the Admin and User rows on different
   * addresses, which unlinks them from the `user_role_sync_admin` trigger, and
   * moving onto an address some other account already holds.
   */
  describe('changeOwnEmail', () => {
    const current = 'currentPassword1';
    const OLD = 'old@glowplus.com';
    const NEW = 'new@glowplus.com';

    async function prismaWithEmail() {
      const prisma = makePrisma();
      const passwordHash = await bcrypt.hash(current, 4);
      // One mock serves two different lookups: "who am I" (by id) and "is this
      // address taken" (by email). Answer them apart, or the uniqueness check
      // finds the caller's own row and every rename is a conflict.
      (prisma.admin.findUnique as jest.Mock).mockImplementation(({ where }: any) =>
        where.id ? { id: 'a_1', email: OLD, passwordHash } : null,
      );
      return prisma;
    }

    /** The customer row, if any, that shares the admin's address. */
    function withCustomer(prisma: any, atOldEmail: { id: string } | null, atNewEmail: { id: string } | null = null) {
      (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: any) =>
        where.email === OLD ? atOldEmail : atNewEmail,
      );
    }

    it('rejects a wrong current password — an open session must not be able to move the login', async () => {
      const prisma = await prismaWithEmail();
      await expect(
        makeService(prisma).changeOwnEmail('a_1', { currentPassword: 'wrong', newEmail: NEW }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('moves the Admin and User rows together — they are linked by email and nothing else', async () => {
      const prisma = await prismaWithEmail();
      withCustomer(prisma, { id: 'u_1' });

      await expect(
        makeService(prisma).changeOwnEmail('a_1', { currentPassword: current, newEmail: NEW }),
      ).resolves.toEqual({ ok: true, email: NEW });

      expect(prisma.admin.update).toHaveBeenCalledWith({ where: { id: 'a_1' }, data: { email: NEW } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u_1' },
        // The old verification was of the old address.
        data: { email: NEW, emailVerifiedAt: null },
      });
      // Both writes in ONE transaction: half a rename unlinks the two rows.
      expect((prisma.$transaction as jest.Mock).mock.calls[0][0]).toHaveLength(2);
    });

    it('writes only the Admin row for a standalone admin with no customer account', async () => {
      const prisma = await prismaWithEmail();
      withCustomer(prisma, null);

      await makeService(prisma).changeOwnEmail('a_1', { currentPassword: current, newEmail: NEW });

      expect(prisma.admin.update).toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect((prisma.$transaction as jest.Mock).mock.calls[0][0]).toHaveLength(1);
    });

    it('refuses an address another admin already holds', async () => {
      const prisma = await prismaWithEmail();
      (prisma.admin.findUnique as jest.Mock).mockImplementation(({ where }: any) =>
        where.id ? { id: 'a_1', email: OLD, passwordHash: bcrypt.hashSync(current, 4) } : { id: 'a_2' },
      );
      await expect(
        makeService(prisma).changeOwnEmail('a_1', { currentPassword: current, newEmail: NEW }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses another customer's address — the sync trigger would overwrite this admin's password", async () => {
      const prisma = await prismaWithEmail();
      withCustomer(prisma, null, { id: 'u_someone_else' });
      await expect(
        makeService(prisma).changeOwnEmail('a_1', { currentPassword: current, newEmail: NEW }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses the address the admin already has, rather than reporting a rename that did nothing', async () => {
      const prisma = await prismaWithEmail();
      await expect(
        makeService(prisma).changeOwnEmail('a_1', { currentPassword: current, newEmail: OLD }),
      ).rejects.toThrow(ConflictException);
    });

    it('does NOT revoke sessions — tokens carry the account id, not the address', async () => {
      const prisma = await prismaWithEmail();
      withCustomer(prisma, { id: 'u_1' });
      await makeService(prisma).changeOwnEmail('a_1', { currentPassword: current, newEmail: NEW });
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // T80 — demoting and removing
  // -------------------------------------------------------------------------
  describe('setAdminRole / removeAdmin', () => {
    function withAdmin(prisma: any, role: string, linked: boolean, id = 'a_2') {
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue({ id, email: 'x@y.com', role });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(linked ? { id: 'u_2' } : null);
    }

    it('demotes a PROMOTED admin by writing User.role — the trigger updates the Admin row', async () => {
      const prisma = makePrisma();
      withAdmin(prisma, 'OWNER', true);
      await makeService(prisma).setAdminRole('a_2', 'a_1', 'ADMIN');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u_2' }, data: { role: 'ADMIN' } });
      expect(prisma.admin.update).not.toHaveBeenCalled();
    });

    it('demotes a STANDALONE admin directly — no User row means no trigger will fire', async () => {
      const prisma = makePrisma();
      withAdmin(prisma, 'OWNER', false);
      await makeService(prisma).setAdminRole('a_2', 'a_1', 'ADMIN');
      expect(prisma.admin.update).toHaveBeenCalledWith({ where: { id: 'a_2' }, data: { role: 'ADMIN' } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to demote yourself', async () => {
      const prisma = makePrisma();
      withAdmin(prisma, 'OWNER', true, 'a_1');
      await expect(makeService(prisma).setAdminRole('a_1', 'a_1', 'ADMIN')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to demote the LAST owner — nobody could grant admin access again', async () => {
      const prisma = makePrisma();
      withAdmin(prisma, 'OWNER', true);
      (prisma.admin.count as jest.Mock).mockResolvedValue(1);
      await expect(makeService(prisma).setAdminRole('a_2', 'a_1', 'ADMIN')).rejects.toThrow(
        /last owner/,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows demoting an owner while another owner remains', async () => {
      const prisma = makePrisma();
      withAdmin(prisma, 'OWNER', true);
      (prisma.admin.count as jest.Mock).mockResolvedValue(2);
      await makeService(prisma).setAdminRole('a_2', 'a_1', 'ADMIN');
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('refuses a no-op role change', async () => {
      const prisma = makePrisma();
      withAdmin(prisma, 'ADMIN', true);
      await expect(makeService(prisma).setAdminRole('a_2', 'a_1', 'ADMIN')).rejects.toThrow(
        ConflictException,
      );
    });

    it('removing a PROMOTED admin keeps the customer account — only role goes back to CONSUMER', async () => {
      const prisma = makePrisma();
      withAdmin(prisma, 'ADMIN', true);
      const res = await makeService(prisma).removeAdmin('a_2', 'a_1');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u_2' }, data: { role: 'CONSUMER' } });
      expect(prisma.admin.delete).not.toHaveBeenCalled();
      expect(res.keptCustomerAccount).toBe(true);
    });

    it('removing a STANDALONE admin deletes the row — the trigger does not reach it', async () => {
      const prisma = makePrisma();
      withAdmin(prisma, 'ADMIN', false);
      const res = await makeService(prisma).removeAdmin('a_2', 'a_1');
      expect(prisma.admin.delete).toHaveBeenCalledWith({ where: { id: 'a_2' } });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(res.keptCustomerAccount).toBe(false);
    });

    it('revokes their sessions in the same transaction, both paths', async () => {
      for (const linked of [true, false]) {
        const prisma = makePrisma();
        withAdmin(prisma, 'ADMIN', linked);
        await makeService(prisma).removeAdmin('a_2', 'a_1');
        expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { accountId: 'a_2', accountType: 'ADMIN', revokedAt: null },
          }),
        );
        expect(prisma.$transaction).toHaveBeenCalled();
      }
    });

    it('refuses to remove yourself, and refuses to remove the last owner', async () => {
      const p1 = makePrisma();
      withAdmin(p1, 'ADMIN', true, 'a_1');
      await expect(makeService(p1).removeAdmin('a_1', 'a_1')).rejects.toThrow(BadRequestException);

      const p2 = makePrisma();
      withAdmin(p2, 'OWNER', true);
      (p2.admin.count as jest.Mock).mockResolvedValue(1);
      await expect(makeService(p2).removeAdmin('a_2', 'a_1')).rejects.toThrow(/last owner/);
    });

    it('404s on an admin that does not exist', async () => {
      const prisma = makePrisma();
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(makeService(prisma).removeAdmin('nope', 'a_1')).rejects.toThrow(NotFoundException);
    });
  });

});
