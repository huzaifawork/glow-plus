import { Injectable, ConflictException, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerificationService } from './email-verification.service';
import { sign } from '../../middleware/jwt.util';
import { SignupDto, LoginDto } from './dto';
import { encodePhone } from '../../common/pii-crypto';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
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

    const token = sign({ sub: user.id, role: 'consumer' });
    return { token, user: { id: user.id, name: user.name, emailVerified: !!user.emailVerifiedAt } };
  }

  async verifyEmail(token: string) {
    return this.emailVerification.verifyEmail(token);
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true }; // don't leak account existence
    if (user.emailVerifiedAt) return { ok: true };

    await this.emailVerification.sendVerificationEmail(user.id, 'CONSUMER', user.email);
    return { ok: true };
  }
}
