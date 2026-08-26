import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * T54 — this class has NO @Cron decorator any more, deliberately.
 * An in-process timer never fires on Vercel: the container is frozen as soon
 * as the request that woke it finishes, so the job would have run NEVER,
 * with no error to notice. It is now triggered over HTTP by
 * `GET /v1/cron/nightly` — see modules/cron/cron.service.ts.
 * Was: CronExpression.EVERY_DAY_AT_2AM.
 */
@Injectable()
export class NightlyPayoutCalcJob {
  private readonly logger = new Logger(NightlyPayoutCalcJob.name);

  constructor(private readonly prisma: PrismaService) {}

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
