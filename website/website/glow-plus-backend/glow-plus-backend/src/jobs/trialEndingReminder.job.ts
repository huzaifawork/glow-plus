import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { sendEmail } from '../modules/notifications/email.provider';

@Injectable()
export class TrialEndingReminderJob {
  private readonly logger = new Logger(TrialEndingReminderJob.name);

  constructor(private readonly prisma: PrismaService) {}

  // Optional backup to Stripe's `customer.subscription.trial_will_end`
  // webhook, in case delivery is ever missed.
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async run() {
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const in4Days = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

    const endingSoon = await this.prisma.subscription.findMany({
      where: { status: 'TRIALING', trialEnd: { gte: in3Days, lt: in4Days } },
      include: { merchant: true },
    });

    for (const sub of endingSoon) {
      await sendEmail({ to: sub.merchant.email, template: 'trial-ending-soon', data: { trialEnd: sub.trialEnd } });
    }

    this.logger.log(`trialEndingReminder: ${endingSoon.length} merchants notified`);
  }
}
