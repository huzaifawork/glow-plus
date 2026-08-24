import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  list(merchantId: string) {
    return this.prisma.visit.findMany({
      where: { merchantId },
      include: { style: true, user: { select: { name: true, email: true } } },
      orderBy: { visitDate: 'desc' },
    });
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

    const client = await this.findOrCreateClient(dto.clientEmail, dto.clientName);

    const visit = await this.prisma.visit.create({
      data: {
        userId: client.id,
        merchantId,
        styleId: style.id,
        pointsEarned: style.pointsPerVisit,
        loggedBy: staffUserId,
      },
    });

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

  /** Clients are consumers who may not have signed up yet — create a
   * lightweight, unverified account so the visit has somewhere to attach. */
  private async findOrCreateClient(email: string, name?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return existing;

    const placeholderPassword = await bcrypt.hash(randomBytes(16).toString('hex'), 12);
    return this.prisma.user.create({
      data: { email, name: name ?? email.split('@')[0], passwordHash: placeholderPassword },
    });
  }
}
