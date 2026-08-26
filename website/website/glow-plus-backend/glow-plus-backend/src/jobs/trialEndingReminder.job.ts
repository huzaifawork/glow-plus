import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sendEmail } from '../modules/notifications/email.provider';

/**
 * T54 — this class has NO @Cron decorator any more, deliberately.
 * An in-process timer never fires on Vercel: the container is frozen as soon
 * as the request that woke it finishes, so the job would have run NEVER,
 * with no error to notice. It is now triggered over HTTP by
 * `GET /v1/cron/morning` — see modules/cron/cron.service.ts.
 * Was: CronExpression.EVERY_DAY_AT_9AM.
 */
@Injectable()
export class TrialEndingReminderJob {
  private readonly logger = new Logger(TrialEndingReminderJob.name);

  constructor(private readonly prisma: PrismaService) {}

  // Optional backup to Stripe's `customer.subscription.trial_will_end`
  // webhook, in case delivery is ever missed.
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
