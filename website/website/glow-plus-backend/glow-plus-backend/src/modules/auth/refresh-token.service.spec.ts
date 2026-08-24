/**
 * Tests for RefreshTokenService  (T47, closing [F12])
 *
 * The live run proved the flow works. These pin the four properties that would
 * still *look* like a working flow if they broke — the ones where the happy
 * path is unchanged and only the security behaviour is gone:
 *
 *   1. the raw token is never what is stored,
 *   2. a spent token cannot be spent again,
 *   3. a replay revokes the whole lineage, not just the row presented,
 *   4. claims come from the account row, not from the refresh token.
 *
 * The Prisma double below is a small in-memory store rather than a pile of
 * `jest.fn()`s, because three of those four are about state *across* calls —
 * rotate-then-replay, revoke-then-refresh — and per-call mocks assert the
 * calls happened rather than that the rule holds.
 */
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RefreshTokenService } from './refresh-token.service';
import { verify } from '../../middleware/jwt.util';

type Row = {
  id: string;
  token: string;
  accountId: string;
  accountType: string;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
};

/** Enough of PrismaService for this service, with real cross-call state. */
function makePrisma() {
  const rows: Row[] = [];
  let seq = 0;

  const matches = (row: Row, where: Record<string, any>) =>
    Object.entries(where).every(([k, v]) => {
      const actual = (row as any)[k];
      return v === null ? actual === null : actual === v;
    });

  const accounts = {
    user: new Map<string, any>(),
    merchant: new Map<string, any>(),
    admin: new Map<string, any>(),
    merchantStaff: new Map<string, any>(),
  };

  const table = (name: keyof typeof accounts) => ({
    findUnique: async ({ where }: any) => accounts[name].get(where.id) ?? null,
  });

  return {
    rows,
    accounts,
    user: table('user'),
    merchant: table('merchant'),
    admin: table('admin'),
    merchantStaff: table('merchantStaff'),
    refreshToken: {
      create: async ({ data }: any) => {
        const row: Row = {
          id: `rt_${++seq}`,
          usedAt: null,
          revokedAt: null,
          ...data,
        };
        rows.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => rows.find((r) => r.token === where.token) ?? null,
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
  };
}

const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

describe('RefreshTokenService (T47)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: RefreshTokenService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new RefreshTokenService(prisma as any);
    prisma.accounts.user.set('user_1', { id: 'user_1' });
    prisma.accounts.merchant.set('m_1', { id: 'm_1' });
    prisma.accounts.admin.set('a_1', { id: 'a_1' });
    prisma.accounts.merchantStaff.set('s_1', { role: 'OWNER', merchantId: 'm_1' });
  });

  describe('issuing a session', () => {
    it('returns the access token under the name both clients already read', async () => {
      const session = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });

      // `client.js:99` does `await saveToken(result.token)`. If this key is
      // ever renamed, Order 2 stops being able to log in.
      expect(typeof session.token).toBe('string');
      expect(verify(session.token).sub).toBe('user_1');
      expect(verify(session.token).role).toBe('consumer');
    });

    it('adds refreshToken and expiresIn alongside it', async () => {
      const session = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });

      expect(session.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(session.expiresIn).toBe(15 * 60);
    });

    it('stores the SHA-256 of the token, never the token', async () => {
      const session = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });

      expect(prisma.rows).toHaveLength(1);
      expect(prisma.rows[0].token).not.toBe(session.refreshToken);
      expect(prisma.rows[0].token).toBe(sha256(session.refreshToken));
    });

    it('gives every login its own family', async () => {
      await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });

      expect(prisma.rows[0].familyId).not.toBe(prisma.rows[1].familyId);
    });

    it('carries merchantId into the access token when there is one', async () => {
      const session = await service.issueSession('m_1', 'MERCHANT' as any, {
        role: 'merchant_owner',
        merchantId: 'm_1',
      });

      expect(verify(session.token).merchantId).toBe('m_1');
    });
  });

  describe('rotating', () => {
    it('mints a new pair and keeps the caller signed in', async () => {
      const first = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });

      const second = await service.rotate(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(verify(second.token).sub).toBe('user_1');
      expect(second.expiresIn).toBe(15 * 60);
    });

    it('marks the spent token used and keeps the replacement in the same family', async () => {
      const first = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });

      const second = await service.rotate(first.refreshToken);

      const spent = prisma.rows.find((r) => r.token === sha256(first.refreshToken))!;
      const fresh = prisma.rows.find((r) => r.token === sha256(second.refreshToken))!;
      expect(spent.usedAt).not.toBeNull();
      expect(fresh.familyId).toBe(spent.familyId);
    });

    it('refuses an unknown token', async () => {
      await expect(service.rotate('f'.repeat(64))).rejects.toThrow(UnauthorizedException);
    });

    it('refuses an expired token', async () => {
      const first = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      prisma.rows[0].expiresAt = new Date(Date.now() - 1000);

      await expect(service.rotate(first.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('says the same thing for every failure, so it is not an oracle', async () => {
      const first = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      await service.rotate(first.refreshToken);

      const unknown = await service.rotate('f'.repeat(64)).catch((e) => e.message);
      const spent = await service.rotate(first.refreshToken).catch((e) => e.message);

      // "never existed" and "already spent" are the difference between a guess
      // and a confirmed leak. The caller learns neither.
      expect(unknown).toBe(spent);
      expect(unknown).toBe('Invalid refresh token');
    });
  });

  describe('replay detection', () => {
    it('refuses a token that has already been spent', async () => {
      const first = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      await service.rotate(first.refreshToken);

      await expect(service.rotate(first.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the WHOLE family, not just the replayed row', async () => {
      const first = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      const second = await service.rotate(first.refreshToken);
      const third = await service.rotate(second.refreshToken);

      await service.rotate(first.refreshToken).catch(() => {});

      // The legitimate holder's current token is dead too. That is the point:
      // the server cannot tell the thief from the victim, so it ends both.
      await expect(service.rotate(third.refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.rows.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it('leaves a DIFFERENT session of the same account alone', async () => {
      const laptop = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      const phone = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      await service.rotate(laptop.refreshToken);

      await service.rotate(laptop.refreshToken).catch(() => {});

      // Signing out every device on one leaked token would be its own bug —
      // the family is the session, not the account.
      await expect(service.rotate(phone.refreshToken)).resolves.toBeDefined();
    });
  });

  describe('claims are re-derived from the account, not replayed', () => {
    it('gives a demoted OWNER the staff role at the next refresh', async () => {
      const session = await service.issueSession('s_1', 'STAFF' as any, {
        role: 'merchant_owner',
        merchantId: 'm_1',
      });
      expect(verify(session.token).role).toBe('merchant_owner');

      // The owner demotes them through the API; the refresh token is untouched.
      prisma.accounts.merchantStaff.set('s_1', { role: 'STAFF', merchantId: 'm_1' });

      const refreshed = await service.rotate(session.refreshToken);

      // If this ever reads `merchant_owner`, T24's owner/staff split has a
      // 30-day hole in it.
      expect(verify(refreshed.token).role).toBe('merchant_staff');
      expect(verify(refreshed.token).merchantId).toBe('m_1');
    });

    it('refuses to refresh a session whose account is gone', async () => {
      const session = await service.issueSession('s_1', 'STAFF' as any, {
        role: 'merchant_owner',
        merchantId: 'm_1',
      });
      prisma.accounts.merchantStaff.delete('s_1');

      await expect(service.rotate(session.refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.rows.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it.each([
      ['CONSUMER', 'user_1', 'consumer', undefined],
      ['MERCHANT', 'm_1', 'merchant_owner', 'm_1'],
      ['ADMIN', 'a_1', 'admin', undefined],
    ])('re-derives %s claims correctly', async (accountType, accountId, role, merchantId) => {
      const session = await service.issueSession(accountId, accountType as any, {
        role: role as any,
        merchantId,
      });

      const refreshed = await service.rotate(session.refreshToken);

      expect(verify(refreshed.token).role).toBe(role);
      expect(verify(refreshed.token).merchantId).toBe(merchantId);
    });
  });

  describe('logout', () => {
    it('revokes the session so it cannot be continued', async () => {
      const session = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });

      await expect(service.revoke(session.refreshToken)).resolves.toEqual({ ok: true });
      await expect(service.rotate(session.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the whole lineage, not only the token handed in', async () => {
      const first = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      const second = await service.rotate(first.refreshToken);

      await service.revoke(second.refreshToken);

      expect(prisma.rows.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it('answers ok for a token that never existed', async () => {
      // Logging out is unauthenticated, so a truthful 404 here would tell an
      // attacker whether a stolen token is still live.
      await expect(service.revoke('f'.repeat(64))).resolves.toEqual({ ok: true });
    });

    it('leaves the account other sessions alone', async () => {
      const laptop = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });
      const phone = await service.issueSession('user_1', 'CONSUMER' as any, { role: 'consumer' });

      await service.revoke(laptop.refreshToken);

      await expect(service.rotate(phone.refreshToken)).resolves.toBeDefined();
    });
  });
});
