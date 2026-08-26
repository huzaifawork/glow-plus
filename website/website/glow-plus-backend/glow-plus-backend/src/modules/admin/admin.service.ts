import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ChangeAdminPasswordDto, PromoteUserDto } from './admin-management.dto';

/** T77 — the same cost the auth services and create-admin.ts use. An admin hash weaker than a customer's would be exactly backwards. */
const SALT_ROUNDS = 12;

/** Never let a passwordHash leave this service. [F31] */
const ADMIN_SELECT = { id: true, email: true, role: true, createdAt: true } as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
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

  /** Every admin, oldest first. Owner-only — this is the platform's key list. */
  listAdmins() {
    return this.prisma.admin.findMany({
      select: ADMIN_SELECT,
      orderBy: { createdAt: 'asc' },
    });
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
      select: { id: true, passwordHash: true },
    });
    if (!admin) throw new NotFoundException('Admin not found');

    if (!(await bcrypt.compare(dto.currentPassword, admin.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.admin.update({ where: { id: adminId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { accountId: adminId, accountType: 'ADMIN', revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }
}
