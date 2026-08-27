import {
  Injectable,
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerificationService } from './email-verification.service';
import { RefreshTokenService } from './refresh-token.service';
import { SignupDto, LoginDto } from './dto';
import { encodePhone } from '../../common/pii-crypto';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * T31 — two fixes here, both for defects proven live.
   *
   * **1. [F28]: the duplicate check was a check-then-create race.** A
   * `findUnique` followed by a `create` with nothing between them: six
   * concurrent signups on one fresh email all passed the check, then five
   * lost at the unique index. T16's filter maps `P2002` to a 409, so it
   * *degraded* safely — but the pre-check was never the thing enforcing
   * uniqueness, the index was. The pre-check is gone; the constraint is now
   * the only claim of truth, and catching `P2002` here turns it into the same
   * ConflictException the pre-check used to raise. One less round-trip, and
   * correct under concurrency instead of correct-by-luck.
   *
   * **2. [F27]'s structural half: a failed verification email must not fail
   * the signup.** The email send was awaited, unguarded, *after* the row had
   * committed. When Resend answered non-2xx the caller got a **500** for an
   * account that had in fact been created — and could not retry, because the
   * second attempt hit the duplicate check and returned 409. T60 removed the
   * *trigger* (an unverified sending domain) and F27 was marked resolved, but
   * the shape was still there: reproduced again during this task's probe, and
   * any transient Resend outage reproduces it in production.
   *
   * The account is the thing the user asked for; the email is a follow-up
   * that has its own retry path (`POST /auth/resend-verification`). So it is
   * logged and swallowed. Deliberately NOT moved inside a transaction —
   * holding a database transaction open across a third-party HTTP call is
   * worse, and a rollback would not un-send a mail that already went.
   */
  async signupConsumer(dto: SignupDto) {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    let user;
    try {
      user = await this.prisma.user.create({
        // T31b — `phone` is written as AES-256-GCM ciphertext and
        // `phoneFingerprint` as a keyed blind index, so the number stays
        // unique and findable without being readable in the database.
        // Both are omitted entirely when no phone was given.
        data: { email: dto.email, passwordHash, name: dto.name, ...encodePhone(dto.phone) },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }

    try {
      await this.emailVerification.sendVerificationEmail(user.id, 'CONSUMER', user.email);
    } catch (err) {
      this.logger.error(
        `Signup succeeded for ${user.id} but the verification email failed to send`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return { id: user.id, email: user.email, name: user.name };
  }

  async loginConsumer(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // T81 — an unverified address cannot sign in.
    //
    // Checked AFTER the password, never before: answering "verify your email"
    // to a wrong password would confirm that the address has an account here,
    // turning the login form into an account-existence oracle. The generic
    // "Invalid email or password" has to stay the only reply to bad
    // credentials.
    //
    // 403 rather than 401 on purpose. The credentials were RIGHT; the account
    // is simply not usable yet. A 401 would be indistinguishable from a bad
    // password to any client, and `lib/api.js` discards the session on 401 —
    // which is meaningless here, since no session was ever issued.
    //
    // Signup sends the link and POST /auth/resend-verification issues another,
    // so this is a door with a key, not a wall.
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Please verify your email address before signing in. We sent you a link when you signed up — check your inbox, or request a new one.',
      );
    }

    // T47 — `token` keeps its name and stays first; `refreshToken` and
    // `expiresIn` are additive, so a client that reads only `token` (the RN
    // app does exactly that, client.js:99) is unaffected.
    const session = await this.refreshTokens.issueSession(user.id, 'CONSUMER', { role: 'consumer' });
    return {
      ...session,
      user: { id: user.id, name: user.name, emailVerified: !!user.emailVerifiedAt },
    };
  }

  async verifyEmail(token: string) {
    return this.emailVerification.verifyEmail(token);
  }

  // T35 — was consumer-only: `prisma.user.findUnique` returns null for a
  // merchant email, which fell straight into the account-enumeration guard
  // below and silently reported success without ever resending anything.
  // Mirrors PasswordResetService.forgotPassword's dual-table lookup, since
  // this is the same "one endpoint serves both account types" shape.
  async resendVerification(email: string) {
    const [user, merchant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.merchant.findUnique({ where: { email } }),
    ]);
    if (!user && !merchant) return { ok: true }; // don't leak account existence

    // Same failure mode as signupConsumer's send (T31/[F27]): a provider
    // error here must not 500 a request whose only job is "try again to
    // send the email" — that would be no more reliable than the send it's
    // retrying. Logged and swallowed for the same reason.
    if (user && !user.emailVerifiedAt) {
      try {
        await this.emailVerification.sendVerificationEmail(user.id, 'CONSUMER', user.email);
      } catch (err) {
        this.logger.error(
          `resendVerification failed to send for ${user.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    if (merchant && !merchant.emailVerifiedAt) {
      try {
        await this.emailVerification.sendVerificationEmail(merchant.id, 'MERCHANT', merchant.email);
      } catch (err) {
        this.logger.error(
          `resendVerification failed to send for ${merchant.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    return { ok: true };
  }
}
