/**
 * Tests for PasswordResetService — the reset half.  ([F61], and T21/T47's
 * existing guarantees pinned alongside it)
 *
 * The live run proved a reset now verifies the address. These pin the parts
 * that would still *look* like a working reset if they broke, because the
 * password would change either way and nothing on screen would differ:
 *
 *   1. a completed reset marks an unverified address verified — without it a
 *      walk-in [F56] can never clear the "verify your email" banner, because
 *      no other control in the product can send them a verification mail,
 *   2. an address verified long ago keeps its ORIGINAL timestamp — the fix
 *      must not rewrite history on every unrelated password change,
 *   3. the merchant branch does the same thing as the consumer branch,
 *   4. a spent or expired token still cannot be used, and
 *   5. every write lands in ONE transaction, so a reset can never commit the
 *      password while losing the revocation (T47) or the verification.
 *
 * The Prisma double is an in-memory store rather than `jest.fn()`s for the
 * same reason refresh-token.service.spec.ts uses one: the properties above are
 * about the state left behind, not about which calls were made.
 */
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PasswordResetService } from './password-reset.service';

jest.mock('../notifications/email.provider', () => ({ sendEmail: jest.fn(async () => undefined) }));

const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

type Account = { id: string; email: string; passwordHash: string; emailVerifiedAt: Date | null };
type Reset = {
  id: string;
  accountId: string;
  accountType: string;
  email: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
};

function makePrisma() {
  const users = new Map<string, Account>();
  const merchants = new Map<string, Account>();
  const resets: Reset[] = [];
  const refreshTokens: { accountId: string; accountType: string; revokedAt: Date | null }[] = [];
  /** Every query handed to $transaction, so "one transaction" is assertable. */
  let batches: unknown[][] = [];

  // Prisma's builders are lazy in real life too — each returns a thunk that
  // $transaction runs. Applying them eagerly here would let a write land even
  // when it was never passed to the transaction, which is exactly property 5.
  const table = (store: Map<string, Account>) => ({
    update: ({ where, data }: any) => () => {
      const row = store.get(where.id);
      if (row) Object.assign(row, data);
    },
    updateMany: ({ where, data }: any) => () => {
      const row = store.get(where.id);
      if (!row) return;
      // Only the NULL-guard is used by this service; honour it literally.
      if ('emailVerifiedAt' in where && where.emailVerifiedAt === null && row.emailVerifiedAt !== null) return;
      Object.assign(row, data);
    },
    findUnique: async ({ where }: any) =>
      [...store.values()].find((r) => (where.id ? r.id === where.id : r.email === where.email)) ?? null,
  });

  return {
    users,
    merchants,
    resets,
    refreshTokens,
    batches: () => batches,
    user: table(users),
    merchant: table(merchants),
    passwordReset: {
      findUnique: async ({ where }: any) => resets.find((r) => r.token === where.token) ?? null,
      create: async ({ data }: any) => {
        const row = { id: 'pr' + resets.length, usedAt: null, ...data };
        resets.push(row);
        return row;
      },
      update: ({ where, data }: any) => () => {
        const row = resets.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
      },
    },
    refreshToken: {
      updateMany: ({ where, data }: any) => () => {
        refreshTokens
          .filter((r) => r.accountId === where.accountId && r.accountType === where.accountType && r.revokedAt === null)
          .forEach((r) => Object.assign(r, data));
      },
    },
    $transaction: async (queries: any[]) => {
      batches.push(queries);
      return queries.map((q) => q());
    },
    resetBatches: () => {
      batches = [];
    },
  };
}

function setup() {
  const prisma = makePrisma();
  const service = new PasswordResetService(prisma as any);
  return { prisma, service };
}

/** Puts a live, unspent token in front of the service, as an email would. */
function issue(prisma: ReturnType<typeof makePrisma>, account: Account, accountType: string, raw: string, over: Partial<Reset> = {}) {
  prisma.resets.push({
    id: 'pr' + prisma.resets.length,
    accountId: account.id,
    accountType,
    email: account.email,
    token: sha256(raw),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    ...over,
  });
}

const consumer = (over: Partial<Account> = {}): Account => ({
  id: 'u1',
  email: 'walkin@example.com',
  passwordHash: 'old-hash',
  emailVerifiedAt: null,
  ...over,
});

describe('PasswordResetService.resetPassword', () => {
  describe('[F61] a completed reset proves the address', () => {
    it('verifies an account that was never verified', async () => {
      const { prisma, service } = setup();
      const account = consumer();
      prisma.users.set(account.id, account);
      issue(prisma, account, 'CONSUMER', 'raw-token');

      await service.resetPassword('raw-token', 'NewPassw0rd!');

      // The whole point: a walk-in has no other route to a verification mail.
      expect(account.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('does NOT rewrite a timestamp the account already had', async () => {
      const { prisma, service } = setup();
      const verifiedOn = new Date('2026-01-15T10:00:00.000Z');
      const account = consumer({ emailVerifiedAt: verifiedOn });
      prisma.users.set(account.id, account);
      issue(prisma, account, 'CONSUMER', 'raw-token');

      await service.resetPassword('raw-token', 'NewPassw0rd!');

      // A password change months later is not a new verification event.
      expect(account.emailVerifiedAt).toBe(verifiedOn);
    });

    it('verifies a MERCHANT account too, not just a consumer', async () => {
      const { prisma, service } = setup();
      const account = consumer({ id: 'm1', email: 'salon@example.com' });
      prisma.merchants.set(account.id, account);
      issue(prisma, account, 'MERCHANT', 'raw-token');

      await service.resetPassword('raw-token', 'NewPassw0rd!');

      expect(account.emailVerifiedAt).toBeInstanceOf(Date);
      expect(prisma.users.size).toBe(0);
    });

    it('stamps the token, the verification and the password in one instant', async () => {
      const { prisma, service } = setup();
      const account = consumer();
      prisma.users.set(account.id, account);
      issue(prisma, account, 'CONSUMER', 'raw-token');

      await service.resetPassword('raw-token', 'NewPassw0rd!');

      // Three separate `new Date()` calls would date one event apart.
      expect(account.emailVerifiedAt!.getTime()).toBe(prisma.resets[0].usedAt!.getTime());
    });
  });

  describe('the guarantees the fix must not have loosened', () => {
    it('actually changes the password hash', async () => {
      const { prisma, service } = setup();
      const account = consumer();
      prisma.users.set(account.id, account);
      issue(prisma, account, 'CONSUMER', 'raw-token');

      await service.resetPassword('raw-token', 'NewPassw0rd!');

      expect(account.passwordHash).not.toBe('old-hash');
      expect(account.passwordHash.startsWith('$2')).toBe(true);
    });

    it('revokes sessions predating the reset (T47)', async () => {
      const { prisma, service } = setup();
      const account = consumer();
      prisma.users.set(account.id, account);
      prisma.refreshTokens.push({ accountId: 'u1', accountType: 'CONSUMER', revokedAt: null });
      issue(prisma, account, 'CONSUMER', 'raw-token');

      await service.resetPassword('raw-token', 'NewPassw0rd!');

      expect(prisma.refreshTokens[0].revokedAt).toBeInstanceOf(Date);
    });

    it('puts every write in a SINGLE transaction', async () => {
      const { prisma, service } = setup();
      const account = consumer();
      prisma.users.set(account.id, account);
      issue(prisma, account, 'CONSUMER', 'raw-token');

      await service.resetPassword('raw-token', 'NewPassw0rd!');

      // A verification that could commit without the password — or a password
      // that could commit without the revocation — is the failure this stops.
      expect(prisma.batches()).toHaveLength(1);
      expect(prisma.batches()[0].length).toBe(4);
    });

    it('marks the token used, so it cannot be spent twice', async () => {
      const { prisma, service } = setup();
      const account = consumer();
      prisma.users.set(account.id, account);
      issue(prisma, account, 'CONSUMER', 'raw-token');

      await service.resetPassword('raw-token', 'NewPassw0rd!');
      expect(prisma.resets[0].usedAt).toBeInstanceOf(Date);

      await expect(service.resetPassword('raw-token', 'Another1!')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an expired token, and leaves the account untouched', async () => {
      const { prisma, service } = setup();
      const account = consumer();
      prisma.users.set(account.id, account);
      issue(prisma, account, 'CONSUMER', 'raw-token', { expiresAt: new Date(Date.now() - 1000) });

      await expect(service.resetPassword('raw-token', 'NewPassw0rd!')).rejects.toBeInstanceOf(BadRequestException);

      // An expired token must not verify the address as a side effect.
      expect(account.emailVerifiedAt).toBeNull();
      expect(account.passwordHash).toBe('old-hash');
    });

    it('refuses an unknown token', async () => {
      const { service } = setup();
      await expect(service.resetPassword('never-issued', 'NewPassw0rd!')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never stores the raw token — only its SHA-256', async () => {
      const { prisma, service } = setup();
      const account = consumer();
      prisma.users.set(account.id, account);
      await service.forgotPassword(account.email);

      expect(prisma.resets).toHaveLength(1);
      expect(prisma.resets[0].token).toHaveLength(64);
      expect(prisma.resets[0].token).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
