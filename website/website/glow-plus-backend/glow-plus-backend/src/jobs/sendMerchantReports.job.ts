import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { sendEmail } from '../modules/notifications/email.provider';

@Injectable()
export class SendMerchantReportsJob {
  private readonly logger = new Logger(SendMerchantReportsJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_WEEK)
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
