/**
 * Tests for AuthService's consumer-only rule.
 *
 * `email` is `@unique` per table, not across them, so one address can be a
 * `User` row AND a `Merchant`/`MerchantStaff`/`Admin` row at the same time,
 * each with its own password. That is how a Glow+ admin ended up holding a
 * working consumer session in the mobile app: the admin row and the consumer
 * row were both real, and `loginConsumer` only ever looked at the consumer one.
 *
 * These pin both doors:
 *   · signup — a business address may not become a consumer account,
 *   · login  — a consumer account whose address LATER became a business one
 *              stops being able to sign in.
 *
 * The second is the case the first cannot cover: signup order can't be undone
 * retroactively, so the check has to exist at login too.
 */
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

/** Enough of PrismaService for these paths, with real cross-call state. */
function makePrisma() {
  const tables = {
    user: new Map<string, any>(),
    merchant: new Map<string, any>(),
    admin: new Map<string, any>(),
    merchantStaff: new Map<string, any>(),
  };

  const byEmail = (name: keyof typeof tables) => ({
    findUnique: async ({ where }: any) => tables[name].get(where.email) ?? null,
    create: async ({ data }: any) => {
      const row = { id: `${name}_${tables[name].size + 1}`, ...data };
      tables[name].set(data.email, row);
      return row;
    },
  });

  return {
    tables,
    user: byEmail('user'),
    merchant: byEmail('merchant'),
    admin: byEmail('admin'),
    merchantStaff: byEmail('merchantStaff'),
  };
}

const CONSUMER_EMAIL = 'customer@example.com';
const PASSWORD = 'correct horse battery';

describe('AuthService — only consumers may use the consumer app', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AuthService;
  let emailVerification: { sendVerificationEmail: jest.Mock };
  let refreshTokens: { issueSession: jest.Mock };

  beforeEach(() => {
    prisma = makePrisma();
    emailVerification = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
    refreshTokens = {
      issueSession: jest.fn().mockResolvedValue({ token: 't', refreshToken: 'r', expiresIn: 900 }),
    };
    service = new AuthService(prisma as any, emailVerification as any, refreshTokens as any);
  });

  /** A verified consumer row with a known password, as signup would leave it. */
  function seedConsumer(email = CONSUMER_EMAIL) {
    prisma.tables.user.set(email, {
      id: 'user_1',
      email,
      name: 'Muhammad Usman',
      passwordHash: bcrypt.hashSync(PASSWORD, 4),
      emailVerifiedAt: new Date(),
    });
  }

  describe('loginConsumer', () => {
    it('signs in a plain consumer', async () => {
      seedConsumer();

      const result = await service.loginConsumer({ email: CONSUMER_EMAIL, password: PASSWORD });

      expect(result.user.id).toBe('user_1');
      expect(refreshTokens.issueSession).toHaveBeenCalledWith('user_1', 'CONSUMER', {
        role: 'consumer',
      });
    });

    it.each([
      ['admin', 'admin'],
      ['merchant', 'merchant'],
      ['merchant staff', 'merchantStaff'],
    ] as const)(
      'refuses an address that is also a %s account, even with the right password',
      async (_label, table) => {
        seedConsumer();
        prisma.tables[table].set(CONSUMER_EMAIL, { id: 'biz_1', email: CONSUMER_EMAIL });

        await expect(
          service.loginConsumer({ email: CONSUMER_EMAIL, password: PASSWORD }),
        ).rejects.toBeInstanceOf(ConflictException);

        // The important half: no session was minted on the way out.
        expect(refreshTokens.issueSession).not.toHaveBeenCalled();
      },
    );

    it('still answers a wrong password with the generic 401, business account or not', async () => {
      seedConsumer();
      prisma.tables.admin.set(CONSUMER_EMAIL, { id: 'a_1', email: CONSUMER_EMAIL });

      // The account-existence oracle stays shut: a guesser must not learn that
      // this address is an admin by getting a different error than usual.
      await expect(
        service.loginConsumer({ email: CONSUMER_EMAIL, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('reports an unverified consumer as unverified, not as a conflict', async () => {
      prisma.tables.user.set(CONSUMER_EMAIL, {
        id: 'user_1',
        email: CONSUMER_EMAIL,
        name: 'Muhammad Usman',
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
        emailVerifiedAt: null,
      });

      await expect(
        service.loginConsumer({ email: CONSUMER_EMAIL, password: PASSWORD }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('signupConsumer', () => {
    it('creates a consumer for an address nothing else owns', async () => {
      const created = await service.signupConsumer({
        email: CONSUMER_EMAIL,
        password: PASSWORD,
        name: 'Muhammad Usman',
      });

      expect(created.email).toBe(CONSUMER_EMAIL);
      expect(emailVerification.sendVerificationEmail).toHaveBeenCalled();
    });

    it.each([
      ['admin', 'admin'],
      ['merchant', 'merchant'],
      ['merchant staff', 'merchantStaff'],
    ] as const)('refuses to create a consumer for an existing %s address', async (_label, table) => {
      prisma.tables[table].set(CONSUMER_EMAIL, { id: 'biz_1', email: CONSUMER_EMAIL });

      await expect(
        service.signupConsumer({
          email: CONSUMER_EMAIL,
          password: PASSWORD,
          name: 'Muhammad Usman',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.tables.user.size).toBe(0);
    });
  });
});
