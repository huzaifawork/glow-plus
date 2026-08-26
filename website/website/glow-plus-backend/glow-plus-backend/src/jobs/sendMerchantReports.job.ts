import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sendEmail } from '../modules/notifications/email.provider';

/**
 * T54 — this class has NO @Cron decorator any more, deliberately.
 * An in-process timer never fires on Vercel: the container is frozen as soon
 * as the request that woke it finishes, so the job would have run NEVER,
 * with no error to notice. It is now triggered over HTTP by
 * `GET /v1/cron/nightly` — see modules/cron/cron.service.ts.
 * Was: CronExpression.EVERY_WEEK (now Sundays, inside the nightly slot).
 */
@Injectable()
export class SendMerchantReportsJob {
  private readonly logger = new Logger(SendMerchantReportsJob.name);

  constructor(private readonly prisma: PrismaService) {}

  async run() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const merchants = await this.prisma.merchant.findMany({ where: { status: 'ACTIVE' } });

    for (const merchant of merchants) {
      const [visitCount, pointsSum, uniqueClients] = await Promise.all([
        this.prisma.visit.count({ where: { merchantId: merchant.id, visitDate: { gte: weekAgo } } }),
        this.prisma.visit.aggregate({
          where: { merchantId: merchant.id, visitDate: { gte: weekAgo } },
          _sum: { pointsEarned: true },
        }),
        this.prisma.visit
          .findMany({ where: { merchantId: merchant.id, visitDate: { gte: weekAgo } }, distinct: ['userId'] })
          .then((v) => v.length),
      ]);

      if (visitCount === 0) continue; // don't email an empty report

      await sendEmail({
        to: merchant.email,
        template: 'confirm-email', // swap for a dedicated weekly-report template
        data: { visitCount, pointsIssued: pointsSum._sum.pointsEarned ?? 0, uniqueClients },
      });
    }

    this.logger.log(`sendMerchantReports: emailed ${merchants.length} active merchants`);
  }
}
