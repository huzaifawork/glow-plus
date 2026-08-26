import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Points expiry  (T25) [F8]
 *
 * This job existed but did nothing: its `updateMany` passed `data: {}`, a
 * literal no-op, because `Visit` had no column to set. It logged a count of
 * rows it had "touched" and changed none of them — so points never expired,
 * and nothing in the system said so.
 *
 * Visits are the ledger; there is no running balance anywhere. Expiring a
 * visit therefore means marking it excluded from progress maths, never
 * deleting it — the merchant's visit history stays intact, and only the
 * points stop counting toward rewards.
 */
export const POINTS_EXPIRE_AFTER_DAYS = Number(process.env.POINTS_EXPIRE_AFTER_DAYS ?? 365);

/**
 * T54 — this class has NO @Cron decorator any more, deliberately.
 * An in-process timer never fires on Vercel: the container is frozen as soon
 * as the request that woke it finishes, so the job would have run NEVER,
 * with no error to notice. It is now triggered over HTTP by
 * `GET /v1/cron/nightly` — see modules/cron/cron.service.ts.
 * Was: CronExpression.EVERY_DAY_AT_3AM.
 */
@Injectable()
export class ExpirePointsJob {
  private readonly logger = new Logger(ExpirePointsJob.name);

  constructor(private readonly prisma: PrismaService) {}

  async run() {
    const cutoff = new Date(Date.now() - POINTS_EXPIRE_AFTER_DAYS * 24 * 60 * 60 * 1000);

    // `expired: false` in the filter keeps the job idempotent: a second run on
    // the same day updates nothing and, more importantly, doesn't rewrite
    // `expiredAt` on rows that expired weeks ago.
    const result = await this.prisma.visit.updateMany({
      where: { visitDate: { lt: cutoff }, expired: false },
      data: { expired: true, expiredAt: new Date() },
    });

    this.logger.log(
      `expirePoints: expired ${result.count} visit(s) older than ${cutoff.toISOString()} (${POINTS_EXPIRE_AFTER_DAYS}d)`,
    );

    return { expired: result.count, cutoff };
  }
}
