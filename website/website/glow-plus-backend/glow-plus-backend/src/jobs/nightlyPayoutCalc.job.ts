import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NightlyPayoutCalcJob {
  private readonly logger = new Logger(NightlyPayoutCalcJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async run() {
    // Glow+ is a flat $200/mo SaaS fee, not a per-transaction marketplace —
    // there's no merchant payout to calculate. This job instead rolls up
    // yesterday's visit + points activity per merchant for the admin
    // revenue dashboard and next-morning merchant email digest.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    const rollups = await this.prisma.visit.groupBy({
      by: ['merchantId'],
      where: { visitDate: { gte: yesterday, lt: today } },
      _count: { _all: true },
      _sum: { pointsEarned: true },
    });

    this.logger.log(`nightlyPayoutCalc: ${rollups.length} merchants had activity yesterday`);
    return rollups;
  }
}
