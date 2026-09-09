import {
  Injectable,
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerificationService } from './email-verification.service';
import { RefreshTokenService } from './refresh-token.service';
import { SignupDto, LoginDto } from './dto';
import { SupabaseIdentityService } from './supabase-identity.service';
import { encodePhone } from '../../common/pii-crypto';
import { hasBusinessAccount } from '../../common/business-account';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly supabaseIdentity: SupabaseIdentityService,
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
    if (await hasBusinessAccount(this.prisma, dto.email)) {
      throw new ConflictException(
        'This email is registered as a Glow+ business or admin account. Sign in at the Glow+ website, or use a different email to create a customer account.',
      );
    }

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

    // This consumer row is genuine and the password is right, but the same
    // email is ALSO a business account — added as staff/admin after this
    // consumer account already existed, since `signupConsumer` refuses the
    // reverse order. 409, not 403: this is a conflict between two accounts
    // sharing an address, not "right password, account not ready yet" (that's
    // the emailVerifiedAt case below), and it keeps this out of SignInScreen's
    // "resend verification" branch, which triggers on 403 specifically.
    if (await hasBusinessAccount(this.prisma, dto.email)) {
      throw new ConflictException(
        'This email is registered as a Glow+ business or admin account and cannot sign in to the customer app. Sign in at the Glow+ website instead.',
      );
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

  /**
   * Sign in with Google, by way of Supabase Auth.
   *
   * The app has already sent the user through Google's consent screen (via
   * Supabase's `/auth/v1/authorize`) and holds a Supabase access token. This
   * turns that into a normal Glow+ consumer session — the SAME session
   * `loginConsumer` issues, with the same shape, the same 15-minute access
   * token and the same refresh lineage. Nothing downstream of here can tell
   * how the user signed in, which is the point: every existing screen, guard
   * and endpoint keeps working untouched.
   *
   * ── Accounts are matched on the EMAIL ADDRESS ──────────────────────────
   * Not on a stored Google id, and there is no new column for one. Google has
   * verified that this person controls this mailbox, and a Glow+ account IS
   * its email address — `User.email` is the unique key the whole platform
   * identifies a consumer by. So someone who created their account with a
   * password last year and taps "Continue with Google" today lands in *their*
   * account with their points and bookings intact, rather than a stranded
   * duplicate that the salon they visit sees as a different customer.
   *
   * The safety of that rests entirely on the address being Google-verified,
   * which is `SupabaseIdentityService.verify`'s job and is checked twice
   * there — the provider must be Google, and the address must be confirmed.
   *
   * ── The password hash on a Google-created account ──────────────────────
   * `User.passwordHash` is NOT NULL, and this user has no password. Rather
   * than a migration that makes the column nullable — which would weaken a
   * constraint every other login path depends on — the row gets a bcrypt hash
   * of 32 random bytes that is never stored anywhere else and never shown to
   * anyone. `bcrypt.compare` against it cannot succeed, so `loginConsumer`
   * answers its usual "Invalid email or password". The route back is the one
   * that already exists for anyone who has forgotten a password:
   * POST /auth/forgot-password sets one.
   */
  async signInWithGoogle(accessToken: string) {
    const identity = await this.supabaseIdentity.verify(accessToken);

    // The same rule, and the same wording, as `loginConsumer`. A salon owner
    // whose Google address is also their business login must not be able to
    // get a consumer session by coming through a different door.
    if (await hasBusinessAccount(this.prisma, identity.email)) {
      throw new ConflictException(
        'This email is registered as a Glow+ business or admin account and cannot sign in to the customer app. Sign in at the Glow+ website instead.',
      );
    }

    const user = await this.findOrCreateGoogleUser(identity.email, identity.name);

    // T81's verification gate does not apply, and must not: the whole reason
    // it exists is to prove the person controls the address, and Google has
    // just done exactly that. An account that signed up with a password and
    // never opened the email is verified HERE, which is why this is an update
    // and not merely a read — otherwise Google sign-in would succeed while
    // leaving the row in a state that blocks the user's own password login.
    if (!user.emailVerifiedAt) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    const session = await this.refreshTokens.issueSession(user.id, 'CONSUMER', {
      role: 'consumer',
    });
    return {
      ...session,
      user: { id: user.id, name: user.name, emailVerified: true },
    };
  }

  /**
   * Find the consumer this address belongs to, creating one on first sign-in.
   *
   * Written the way `signupConsumer` was rewritten for [F28]: the unique index
   * is the only claim of truth, and `P2002` is handled rather than pre-empted.
   * Two taps on "Continue with Google" a few milliseconds apart — which the
   * app's own retry makes plausible — otherwise both pass a `findUnique` that
   * saw nothing and one of them 500s.
   */
  private async findOrCreateGoogleUser(email: string, name: string | null) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return existing;

    // A hash of 32 random bytes, discarded immediately. See the note above.
    const unusablePassword = await bcrypt.hash(randomBytes(32).toString('hex'), SALT_ROUNDS);

    try {
      const created = await this.prisma.user.create({
        data: {
          email,
          name: name ?? fallbackName(email),
          passwordHash: unusablePassword,
          // Google verified it. Stamped at creation so this account is never
          // momentarily in the "cannot log in yet" state — there is no
          // verification email to wait for, and none is sent.
          emailVerifiedAt: new Date(),
        },
      });
      this.logger.log(`Created a consumer account from a Google sign-in: ${created.id}`);
      return created;
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        // Lost the race. The winner's row is the answer.
        const raced = await this.prisma.user.findUnique({ where: { email } });
        if (raced) return raced;
      }
      throw err;
    }
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

/**
 * A display name for a Google account that shared none.
 *
 * `User.name` is NOT NULL and is rendered on the Rewards screen and in emails,
 * so it cannot be an empty string. The local part of the address is what the
 * user would recognise; it is only ever a placeholder until they edit it.
 */
function fallbackName(email: string): string {
  const local = email.split('@')[0]?.trim();
  return local && local.length > 0 ? local : 'Glow+ member';
}
