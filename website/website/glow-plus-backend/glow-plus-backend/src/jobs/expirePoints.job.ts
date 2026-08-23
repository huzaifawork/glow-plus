import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const POINTS_EXPIRE_AFTER_DAYS = 365;

@Injectable()
export class ExpirePointsJob {
  private readonly logger = new Logger(ExpirePointsJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run() {
    const cutoff = new Date(Date.now() - POINTS_EXPIRE_AFTER_DAYS * 24 * 60 * 60 * 1000);

    // Points aren't stored as a running balance — they're derived from
    // Visit rows — so "expiring" points means marking old visits as
    // excluded from progress calculations rather than deleting history.
    const result = await this.prisma.visit.updateMany({
      where: { visitDate: { lt: cutoff } },
      data: {}, // placeholder: add an `expired Boolean` column to Visit
                // and set it here if/when point expiry is enabled
    });

    this.logger.log(`expirePoints: evaluated visits older than ${cutoff.toISOString()} (${result.count} touched)`);
  }
}
