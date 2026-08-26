/**
 * Tests for admin team management (T77)
 *
 * Promotion is the ONLY way to gain an admin account through the API — creating
 * one outright is deliberately not exposed, and remains a Supabase/CLI action.
 * These cover the two properties that make promotion safe: the customer's
 * existing hash is reused rather than a new password being invented, and no
 * passwordHash is ever selected back out.
 */
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

function makeService(prisma: any) {
  return new AdminService(prisma, {} as MerchantsService);
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

    it('stores a new hash and revokes every other session together', async () => {
      const prisma = await prismaWithPassword();
      await expect(
        makeService(prisma).changeOwnPassword('a_1', {
          currentPassword: current,
          newPassword: 'newPassword1',
        }),
      ).resolves.toEqual({ ok: true });

      const newHash = (prisma.admin.update as jest.Mock).mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('newPassword1', newHash)).toBe(true);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: 'a_1', accountType: 'ADMIN', revokedAt: null },
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
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
});
