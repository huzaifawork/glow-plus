import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { ChangeAdminEmailDto, ChangeAdminPasswordDto, PromoteUserDto } from './admin-management.dto';

/** T77 — the same cost the auth services and create-admin.ts use. An admin hash weaker than a customer's would be exactly backwards. */
const SALT_ROUNDS = 12;

/** Never let a passwordHash leave this service. [F31] */
const ADMIN_SELECT = { id: true, email: true, role: true, createdAt: true } as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  /**
   * The signed-in admin's own profile  [F51]
   *
   * Never the Prisma row: Admin holds `passwordHash`. Only id and email
   * leave, which is all a console needs to say who is signed in.
   */
  async profile(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      // T77 — `role` joins id and email here because the panel has to know
      // whether to render the team controls at all. Still never the row:
      // Admin holds passwordHash.
      select: { id: true, email: true, role: true },
    });
    if (!admin) throw new NotFoundException('Admin not found');
    return admin;
  }

  pendingMerchants() {
    return this.merchants.listByStatus('PENDING');
  }

  /**
   * The full merchant directory (T38). `MerchantsService.listByStatus`
   * already accepted an optional status and already selects through
   * MERCHANT_PUBLIC_SELECT — so the `passwordHash`/`stripeCustomerId`
   * allow-list from T17 [F31] covers this route by construction, not by
   * remembering to strip anything here.
   */
  listMerchants(status?: string) {
    return this.merchants.listByStatus(status);
  }

  approveMerchant(merchantId: string) {
    return this.merchants.approve(merchantId);
  }

  suspendMerchant(merchantId: string) {
    return this.merchants.suspend(merchantId);
  }

  /** Normalizes annual subscriptions to a monthly figure for MRR. */
  async mrr() {
    const subs = await this.prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { plan: true, priceCents: true },
    });

    const mrrCents = subs.reduce((sum, s) => sum + (s.plan === 'ANNUAL' ? Math.round(s.priceCents / 12) : s.priceCents), 0);
    return { activeSubscriptions: subs.length, mrrCents };
  }

  /** Simple monthly churn: canceled this month / active at month start. */
  async churn() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [activeAtStart, canceledThisMonth] = await Promise.all([
      this.prisma.subscription.count({
        where: { createdAt: { lt: startOfMonth }, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      }),
      this.prisma.merchant.count({
        where: { status: 'CANCELLED', subscription: { currentPeriodEnd: { gte: startOfMonth } } },
      }),
    ]);

    const rate = activeAtStart === 0 ? 0 : canceledThisMonth / activeAtStart;
    return { activeAtStart, canceledThisMonth, churnRate: Number(rate.toFixed(4)) };
  }

  async platformStats() {
    const [merchantCount, visitCount, pointsIssued] = await Promise.all([
      this.prisma.merchant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.visit.count(),
      this.prisma.visit.aggregate({ _sum: { pointsEarned: true } }),
    ]);

    return {
      activeMerchants: merchantCount,
      totalVisits: visitCount,
      totalPointsIssued: pointsIssued._sum.pointsEarned ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Admin team management  (T77)
  //
  // Before this, the ONLY ways to obtain an admin account were the CLI script
  // and a hand-written INSERT — both needing production database access. That
  // left the client permanently dependent on a developer for something they
  // will genuinely need: a second administrator, or a replacement for one who
  // has left. Both original routes still work and are untouched; these add a
  // supported path that does not hand a business owner a SQL console.
  // -------------------------------------------------------------------------

  /**
   * Every admin, oldest first. Owner-only — this is the platform's key list.
   *
   * `hasCustomerAccount` says which of the two kinds each row is, because
   * removing them does materially different things and the console has to say
   * so BEFORE the click, not after:
   *
   *   - promoted from a customer -> role returns to CONSUMER, the trigger
   *     drops the Admin row, and the person keeps their account, points and
   *     bookings. Reversible: promote them again.
   *   - standalone (created by scripts/create-admin.ts or inserted by hand,
   *     with no matching User) -> the row is DELETED. Nothing remains, and
   *     there is no customer account to fall back to.
   *
   * T80 shipped one confirmation dialog for both, promising the customer
   * account would be kept — untrue for a standalone admin, so an owner
   * removing one was told their action was softer than it was.
   *
   * Admin and User are joined by email only, which is what the trigger joins
   * on, so this is a second query rather than a relation.
   */
  async listAdmins() {
    const admins = await this.prisma.admin.findMany({
      select: ADMIN_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    if (admins.length === 0) return [];

    const linked = await this.prisma.user.findMany({
      where: { email: { in: admins.map((a) => a.email) } },
      select: { email: true },
    });
    const hasAccount = new Set(linked.map((u) => u.email));

    return admins.map((a) => ({ ...a, hasCustomerAccount: hasAccount.has(a.email) }));
  }

  /**
   * Customers, for the promote picker. Optional case-insensitive search over
   * name and email.
   *
   * Selects four columns explicitly rather than returning the row: User holds
   * `passwordHash`, and `phone` is AES-256-GCM ciphertext that would be
   * meaningless here anyway. An allow-list means a column added to User later
   * cannot leak through this route by default — [F31] was exactly that shape.
   */
  listUsers(q?: string) {
    const search = q?.trim();
    return this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Promote an existing customer to admin.
   *
   * **The password is not touched, generated, or transmitted.** The new Admin
   * row reuses the User's own `passwordHash`, so the person signs in to the
   * panel with the credentials they already have. That removes the worst part
   * of granting admin access — an operator inventing a password and then
   * having to get it to a human safely, which is how this project's other
   * credentials ended up in a chat log [R4].
   *
   * The User row is left alone: being an admin does not stop someone being a
   * customer, and deleting their consumer account would orphan their visits,
   * bookings and points.
   */
  async promoteUser(dto: PromoteUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'CONSUMER') throw new ConflictException('That user is already an admin');

    // Sets ONE column, exactly as changing the dropdown in the Supabase table
    // editor does. The Admin row is created by the `user_role_sync_admin`
    // trigger, not here — see migration 20260827020000_user_role_sync_admin.
    //
    // Writing it this way is the point: the panel and the database console are
    // now the same operation, so they cannot drift apart or disagree about
    // what promotion means.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { role: dto.role ?? 'ADMIN' },
    });

    return this.prisma.admin.findUnique({ where: { email: user.email }, select: ADMIN_SELECT });
  }

  /**
   * An admin changes their own password.
   *
   * Closes a real gap: `forgotPassword` only ever looked up User and Merchant,
   * so an admin who lost their password had no route back at all — and the
   * endpoint answers `{ ok: true }` either way, so they would have sat waiting
   * for an email that was never going to arrive.
   *
   * Every other session is revoked, in the same transaction as the new hash,
   * for the reason password-reset gives: a change that succeeded while the
   * revocation failed would leave open the gap being closed.
   */
  async changeOwnPassword(adminId: string, dto: ChangeAdminPasswordDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!admin) throw new NotFoundException('Admin not found');

    if (!(await bcrypt.compare(dto.currentPassword, admin.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    const now = new Date();

    // An admin who was promoted from a customer account has ONE password, not
    // two. Writing only the Admin row would leave them signing into the panel
    // with the new password and into their customer account with the old one
    // — and the next customer-side password reset would fire the sync trigger
    // and silently move their admin password back underneath them.
    //
    // So write User when there is one and let `user_password_sync_admin`
    // update the copy, exactly as a customer-side reset does. A standalone
    // admin, created before promotion existed or straight in the database, has
    // no User row and is written directly.
    const user = await this.prisma.user.findUnique({
      where: { email: admin.email },
      select: { id: true },
    });

    await this.prisma.$transaction([
      user
        ? this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
        : this.prisma.admin.update({ where: { id: adminId }, data: { passwordHash } }),
      // Both sessions end: the password they share has changed, and "someone
      // may know my password" is the reason this endpoint gets used.
      this.prisma.refreshToken.updateMany({
        where: {
          accountId: { in: user ? [adminId, user.id] : [adminId] },
          revokedAt: null,
        },
        data: { revokedAt: now },
      }),
    ]);

    return { ok: true };
  }

  /**
   * An admin changes their own email address.  (T79)
   *
   * The address is the login identity — `AdminAuthService.login` finds the
   * account by email and by nothing else — so this is the second half of
   * `changeOwnPassword`, not a profile edit. It takes the same
   * `currentPassword` proof for the same reason.
   *
   * **Both rows move together, or neither does.** The `Admin` row and the
   * `User` row of a promoted customer are linked by *email only* — that is
   * what `user_role_sync_admin` (migration 20260827020000) joins on. Renaming
   * one and not the other silently unlinks them: the next customer-side
   * password reset would stop reaching the panel, and flipping the customer
   * back to CONSUMER would delete an `Admin` row that no longer matches,
   * leaving a live admin account behind after access was supposedly revoked.
   * So the two updates go in one transaction.
   *
   * `emailVerifiedAt` is cleared on the customer row: the old verification
   * attested to the old address and says nothing about the new one.
   *
   * ⚠️ T81 changed what that costs. Login now REFUSES an unverified address,
   * so clearing this locks the person out of their customer account until they
   * confirm the new one — it is no longer the free "prompt reappears" it was
   * when T79 was written. A fresh verification email is therefore sent below,
   * or an admin renaming themselves would be stranded with no link to click
   * and no indication that one was needed. The admin console itself is
   * unaffected: `AdminAuthService.login` has no verification check, because
   * the Admin table has no such column.
   *
   * Sessions are deliberately NOT revoked, unlike a password change. Tokens
   * carry the account id, so nothing about them depends on the address, and
   * the reason password rotation revokes — "someone else may know this
   * credential" — has no counterpart here. Signing an admin out of the console
   * they are standing in front of would be a cost with no matching benefit.
   */
  async changeOwnEmail(adminId: string, dto: ChangeAdminEmailDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!admin) throw new NotFoundException('Admin not found');

    if (!(await bcrypt.compare(dto.currentPassword, admin.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Trimmed but NOT lower-cased. Nothing else on this platform normalises an
    // email — signup stores what was typed and every login is an exact-match
    // `findUnique` — so folding case here alone would make this one row behave
    // differently from every other account, in the one place where getting the
    // lookup wrong locks someone out of the admin console.
    const newEmail = dto.newEmail.trim();
    if (newEmail === admin.email) {
      throw new ConflictException('That is already your email address');
    }

    if (await this.prisma.admin.findUnique({ where: { email: newEmail }, select: { id: true } })) {
      throw new ConflictException('Another admin already uses that email address');
    }

    const linkedUser = await this.prisma.user.findUnique({
      where: { email: admin.email },
      select: { id: true },
    });

    // Refused even for a standalone admin with no customer account of their
    // own. `sync_admin_from_user` inserts into Admin with `ON CONFLICT (email)
    // DO UPDATE SET passwordHash`, so an admin sitting on some *other*
    // customer's address would have their panel password quietly replaced by
    // that customer's the next time that customer was promoted or reset their
    // password. Blocking the collision here is the only place that is visible.
    const emailTaken = await this.prisma.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });
    if (emailTaken && emailTaken.id !== linkedUser?.id) {
      throw new ConflictException('A customer account already uses that email address');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.admin.update({ where: { id: adminId }, data: { email: newEmail } }),
        ...(linkedUser
          ? [
              this.prisma.user.update({
                where: { id: linkedUser.id },
                data: { email: newEmail, emailVerifiedAt: null },
              }),
            ]
          : []),
      ]);
    } catch (err) {
      // Two admins renaming to the same address at once. The checks above lose
      // that race by construction; the unique index does not.
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('That email address is already in use');
      }
      throw err;
    }

    // T81 — send the link for the address we just cleared.
    //
    // Outside the transaction and swallowed on failure: the rename has already
    // committed, and an email provider having a bad minute must not surface as
    // "changing your email failed" when it did not. POST /auth/resend-
    // verification issues another, so a lost mail is recoverable.
    if (linkedUser) {
      try {
        await this.emailVerification.sendVerificationEmail(linkedUser.id, 'CONSUMER', newEmail);
      } catch {
        /* recoverable via resend-verification */
      }
    }

    // The new address goes back so the console can relabel itself — its header
    // shows the signed-in admin's email, and it was captured at login.
    return { ok: true, email: newEmail };
  }

  // -------------------------------------------------------------------------
  // Demoting and removing admins  (T80)
  //
  // T77 gave an owner a way to grant admin access and no way to take it back,
  // which is only half a control: the answer to "someone left" was a database
  // console, the very thing T77 existed to stop needing.
  //
  // Both operations write `User.role` where a customer account exists and let
  // `user_role_sync_admin` (migration 20260827020000) update the Admin row, so
  // they are the same gesture as the Supabase dropdown. A STANDALONE admin —
  // one created by `scripts/create-admin.ts` or inserted by hand, with no
  // matching User — is outside the trigger's reach entirely and is written
  // directly. Missing that second case is how you get a "removed" admin who
  // can still sign in.
  // -------------------------------------------------------------------------

  /**
   * Look up an admin and the customer account it is linked to, if any.
   *
   * Admin and User are joined by **email only** — that is what the trigger
   * joins on — so this is the one place that decides which of the two writes
   * below applies.
   */
  private async adminWithLink(targetId: string) {
    const target = await this.prisma.admin.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, role: true },
    });
    if (!target) throw new NotFoundException('Admin not found');

    const linkedUser = await this.prisma.user.findUnique({
      where: { email: target.email },
      select: { id: true },
    });
    return { target, linkedUser };
  }

  /**
   * Refuse the two changes that cannot be undone from inside the product.
   *
   *  - **Not yourself.** Demoting or deleting the account you are signed in as
   *    reads as a misclick far more often than an intention, and it takes
   *    effect immediately — RequireAdminOwnerGuard reads the role from the
   *    database on every request, so the next click is already refused.
   *  - **Not the last owner.** Only an owner can create an owner, so a
   *    platform with zero owners can never grant admin access again without
   *    dropping back to raw SQL. That is precisely the dependency T77 removed.
   */
  private async assertNotSelfOrLastOwner(
    target: { id: string; role: string },
    callerId: string,
    verb: string,
  ) {
    if (target.id === callerId) {
      throw new BadRequestException(`You cannot ${verb} your own admin account`);
    }
    if (target.role === 'OWNER') {
      const owners = await this.prisma.admin.count({ where: { role: 'OWNER' } });
      if (owners <= 1) {
        throw new BadRequestException(
          'This is the last owner account — make someone else an owner first',
        );
      }
    }
  }

  /** Change an admin's tier: OWNER <-> ADMIN. Owner-only. */
  async setAdminRole(targetId: string, callerId: string, role: 'OWNER' | 'ADMIN') {
    const { target, linkedUser } = await this.adminWithLink(targetId);

    if (target.role === role) {
      throw new ConflictException(`That account is already ${role === 'OWNER' ? 'an owner' : 'an admin'}`);
    }
    // Only a demotion can strand the platform; promoting to OWNER cannot.
    if (role !== 'OWNER') {
      await this.assertNotSelfOrLastOwner(target, callerId, 'demote');
    } else if (target.id === callerId) {
      throw new BadRequestException('You cannot change your own admin account');
    }

    if (linkedUser) {
      await this.prisma.user.update({ where: { id: linkedUser.id }, data: { role } });
    } else {
      // No customer account, so no trigger will fire for this one.
      await this.prisma.admin.update({ where: { id: targetId }, data: { role } });
    }

    return this.prisma.admin.findUnique({ where: { id: targetId }, select: ADMIN_SELECT });
  }

  /**
   * Revoke admin access entirely, and end their sessions in the same
   * transaction.
   *
   * A promoted customer keeps their customer account and everything on it —
   * visits, bookings, points. Only the admin half goes: `User.role` returns to
   * CONSUMER and the trigger deletes the Admin row. Deleting the person
   * outright would orphan real data over a staffing change.
   *
   * Removing the Admin row is what actually revokes access, rather than merely
   * marking it: RequireAdminOwnerGuard fails closed when the row is gone, so
   * it bites on the next request instead of when their token expires.
   */
  async removeAdmin(targetId: string, callerId: string) {
    const { target, linkedUser } = await this.adminWithLink(targetId);
    await this.assertNotSelfOrLastOwner(target, callerId, 'remove');

    const now = new Date();
    const revoke = this.prisma.refreshToken.updateMany({
      where: { accountId: targetId, accountType: 'ADMIN', revokedAt: null },
      data: { revokedAt: now },
    });

    if (linkedUser) {
      // The trigger deletes the Admin row when role goes back to CONSUMER.
      await this.prisma.$transaction([
        revoke,
        this.prisma.user.update({ where: { id: linkedUser.id }, data: { role: 'CONSUMER' } }),
      ]);
    } else {
      await this.prisma.$transaction([revoke, this.prisma.admin.delete({ where: { id: targetId } })]);
    }

    return { ok: true, removed: target.email, keptCustomerAccount: Boolean(linkedUser) };
  }
}
