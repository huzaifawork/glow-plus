import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DEFAULT_PAGE_SIZE, PaginationQueryDto } from '../../common/pagination.dto';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardRulesService } from '../reward-rules/reward-rules.service';
import { sendEmail } from '../notifications/email.provider';
import { LogVisitDto } from './dto';

export interface UnlockedReward {
  ruleId: string;
  name: string;
  rewardType: string;
  rewardValue: number;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rewardRules: RewardRulesService,
  ) {}

  /**
   * T50 — paginated. Counted with the same `where` as the page, so
   * `X-Total-Count` is the size of the list being paged through rather than
   * the table. Both queries go in one `$transaction` so the count cannot
   * disagree with the page it describes.
   */
  async list(merchantId: string, query: PaginationQueryDto = {}) {
    const where = { merchantId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        include: { style: true, user: { select: { name: true, email: true } } },
        orderBy: { visitDate: 'desc' },
        skip: query.offset ?? 0,
        take: query.limit ?? DEFAULT_PAGE_SIZE,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * The consumer's own visit history, newest first (T45).
   *
   * Flattened rather than returned with Prisma `include`s: the merchant-facing
   * list() hands back whole related rows, and the only thing this caller needs
   * from a Merchant is its trading name. Selecting explicitly is also what
   * keeps [F31] from repeating — an `include: { merchant: true }` here would
   * ship the salon's `passwordHash` and `stripeCustomerId` to every customer.
   *
   * `expired` visits are included on purpose (T25 [F8]): expiring points means
   * excluding a visit from reward maths, never hiding it from history.
   */
  async listForConsumer(userId: string, query: PaginationQueryDto = {}) {
    const where = { userId };

    const [visits, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
      where,
      select: {
        id: true,
        merchantId: true,
        styleId: true,
        pointsEarned: true,
        visitDate: true,
        expired: true,
        expiredAt: true,
        style: { select: { name: true, type: true } },
        merchant: { select: { businessName: true } },
      },
      orderBy: { visitDate: 'desc' },
      skip: query.offset ?? 0,
      take: query.limit ?? DEFAULT_PAGE_SIZE,
      }),
      this.prisma.visit.count({ where }),
    ]);

    const items = visits.map((v) => ({
      id: v.id,
      merchantId: v.merchantId,
      businessName: v.merchant.businessName,
      styleId: v.styleId,
      styleName: v.style.name,
      styleType: v.style.type,
      pointsEarned: v.pointsEarned,
      visitDate: v.visitDate,
      expired: v.expired,
      expiredAt: v.expiredAt,
    }));

    return { items, total };
  }

  /**
   * Logs a visit, snapshots the style's current point value, and checks
   * every active reward rule for this merchant to see what just unlocked.
   * Runs inside a transaction so points and the visit record can't drift
   * apart if something fails midway.
   */
  async logVisit(merchantId: string, staffUserId: string, dto: LogVisitDto): Promise<{ visit: unknown; unlocked: UnlockedReward[] }> {
    const style = await this.prisma.style.findUnique({ where: { id: dto.styleId } });
    if (!style || style.merchantId !== merchantId) throw new NotFoundException('Style not found for this merchant');
    if (!style.active) throw new BadRequestException('This style is no longer active');

    const { client, created } = await this.findOrCreateClient(dto.clientEmail, dto.clientName);

    const visit = await this.prisma.visit.create({
      data: {
        userId: client.id,
        merchantId,
        styleId: style.id,
        pointsEarned: style.pointsPerVisit,
        loggedBy: staffUserId,
      },
    });

    // T82 — tell a brand-new customer that an account now exists for them.
    //
    // After the visit, so the figure quoted is the one actually recorded, and
    // outside any transaction: the visit and its points are the thing that
    // must not be lost. An email provider having a bad minute must never turn
    // a successful visit into a failed one at the counter, with a queue
    // waiting — so this is best-effort and swallowed.
    if (created) {
      try {
        const merchant = await this.prisma.merchant.findUnique({
          where: { id: merchantId },
          select: { businessName: true },
        });
        await sendEmail({
          to: client.email,
          template: 'points-waiting',
          data: {
            businessName: merchant?.businessName ?? 'A Glow+ salon',
            points: style.pointsPerVisit,
            setPasswordUrl: `${process.env.APP_URL ?? ''}/forgot-password`,
          },
        });
      } catch {
        /* the visit and its points are already saved; the customer can still
           reach the account through forgot-password unprompted */
      }
    }

    const activeRules = await this.prisma.rewardRule.findMany({ where: { merchantId, active: true } });
    const unlocked: UnlockedReward[] = [];

    for (const rule of activeRules) {
      const result = await this.rewardRules.evaluate(rule, client.id, merchantId);
      if (result.unlocked) {
        unlocked.push({ ruleId: rule.id, name: rule.name, rewardType: rule.rewardType, rewardValue: rule.rewardValue });
      }
    }

    if (unlocked.length) {
      await sendEmail({
        to: client.email,
        template: 'reward-unlocked',
        data: { rewards: unlocked.map((r) => r.name) },
      });
    }

    return { visit, unlocked };
  }

  /**
   * Clients are consumers who may not have signed up yet — create a
   * lightweight, unverified account so the visit has somewhere to attach.
   *
   * The password is 16 random bytes, hashed: unguessable, and known to nobody
   * — not the customer, not the salon, not us. That is deliberate. The way in
   * is a password reset from their own inbox, which is also what marks the
   * address verified, so the account cannot be used by whoever typed the email
   * at the counter.
   *
   * T82 — returns whether it CREATED the row, because that is the one moment
   * worth emailing about. Sending on every visit would be spam; sending never,
   * which is what happened until now, left customers with points they had no
   * idea existed.
   */
  private async findOrCreateClient(email: string, name?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return { client: existing, created: false };

    const placeholderPassword = await bcrypt.hash(randomBytes(16).toString('hex'), 12);
    const client = await this.prisma.user.create({
      data: { email, name: name ?? email.split('@')[0], passwordHash: placeholderPassword },
    });
    return { client, created: true };
  }
}
