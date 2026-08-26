/**
 * Tests for admin team management (T77)
 *
 * Covers the refusals that keep the platform recoverable — you cannot delete
 * yourself, and you cannot delete the last owner — plus the two properties
 * that make promotion safe: the customer's existing hash is reused rather than
 * a new password being invented, and no passwordHash is ever selected back out.
 */
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
    user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
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
  describe('createAdmin', () => {
    it('refuses a duplicate email before spending bcrypt on it', async () => {
      const prisma = makePrisma();
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue({ id: 'a_1' });
      await expect(
        makeService(prisma).createAdmin({ email: 'x@y.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.admin.create).not.toHaveBeenCalled();
    });

    it('lowercases the email — login is case-sensitive, so a capital would create an unreachable account', async () => {
      const prisma = makePrisma();
      await makeService(prisma).createAdmin({ email: '  Mixed@Case.COM ', password: 'password123' });
      expect((prisma.admin.create as jest.Mock).mock.calls[0][0].data.email).toBe('mixed@case.com');
    });

    it('stores a bcrypt hash, never the password', async () => {
      const prisma = makePrisma();
      await makeService(prisma).createAdmin({ email: 'x@y.com', password: 'password123' });
      const { passwordHash } = (prisma.admin.create as jest.Mock).mock.calls[0][0].data;
      expect(passwordHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', passwordHash)).toBe(true);
    });

    it('defaults to the WEAKER role when none is asked for', async () => {
      const prisma = makePrisma();
      await makeService(prisma).createAdmin({ email: 'x@y.com', password: 'password123' });
      expect((prisma.admin.create as jest.Mock).mock.calls[0][0].data.role).toBe('ADMIN');
    });

    it('honours an explicit OWNER', async () => {
      const prisma = makePrisma();
      await makeService(prisma).createAdmin({ email: 'x@y.com', password: 'password123', role: 'OWNER' });
      expect((prisma.admin.create as jest.Mock).mock.calls[0][0].data.role).toBe('OWNER');
    });
  });

  describe('promoteUser', () => {
    it('reuses the customer’s existing hash — no password is generated or transmitted', async () => {
      const prisma = makePrisma();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u_1',
        email: 'c@y.com',
        passwordHash: '$2b$12$theirExistingHash',
      });
      await makeService(prisma).promoteUser({ userId: 'u_1' });
      const { data } = (prisma.admin.create as jest.Mock).mock.calls[0][0];
      expect(data.passwordHash).toBe('$2b$12$theirExistingHash');
      expect(data.email).toBe('c@y.com');
    });

    it('404s on an unknown user', async () => {
      const prisma = makePrisma();
      await expect(makeService(prisma).promoteUser({ userId: 'nope' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to promote someone who is already an admin', async () => {
      const prisma = makePrisma();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u_1',
        email: 'c@y.com',
        passwordHash: 'h',
      });
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue({ id: 'a_1' });
      await expect(makeService(prisma).promoteUser({ userId: 'u_1' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('deleteAdmin', () => {
    it('refuses self-deletion — the likeliest way to lock a platform out', async () => {
      const prisma = makePrisma();
      await expect(makeService(prisma).deleteAdmin('a_1', 'a_1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to delete the LAST owner, which would make admin access ungrantable forever', async () => {
      const prisma = makePrisma();
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue({ id: 'a_2', role: 'OWNER' });
      (prisma.admin.count as jest.Mock).mockResolvedValue(1);
      await expect(makeService(prisma).deleteAdmin('a_2', 'a_1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows deleting an owner when another owner remains', async () => {
      const prisma = makePrisma();
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue({ id: 'a_2', role: 'OWNER' });
      (prisma.admin.count as jest.Mock).mockResolvedValue(2);
      await expect(makeService(prisma).deleteAdmin('a_2', 'a_1')).resolves.toEqual({ ok: true });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('revokes their refresh tokens in the SAME transaction as the delete', async () => {
      const prisma = makePrisma();
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue({ id: 'a_2', role: 'ADMIN' });
      await makeService(prisma).deleteAdmin('a_2', 'a_1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: 'a_2', accountType: 'ADMIN', revokedAt: null },
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('404s on an unknown admin', async () => {
      const prisma = makePrisma();
      await expect(makeService(prisma).deleteAdmin('nope', 'a_1')).rejects.toThrow(
        NotFoundException,
      );
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

    it('caps the user list so it cannot become a full customer export', async () => {
      const prisma = makePrisma();
      makeService(prisma).listUsers('ann');
      expect((prisma.user.findMany as jest.Mock).mock.calls[0][0].take).toBe(50);
    });
  });
});
