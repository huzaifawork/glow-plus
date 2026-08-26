import { Module } from '@nestjs/common';
import { ExpirePointsJob } from './expirePoints.job';
import { NightlyPayoutCalcJob } from './nightlyPayoutCalc.job';
import { SendMerchantReportsJob } from './sendMerchantReports.job';
import { TrialEndingReminderJob } from './trialEndingReminder.job';

/**
 * T54 — nothing in here schedules itself any more.
 *
 * All four jobs used `@Cron()`, an in-process timer, which cannot fire on
 * Vercel: the container is frozen the moment the request that woke it
 * finishes. They are now invoked over HTTP by `modules/cron/`, which is why
 * these providers are **exported** — CronModule injects them.
 */
@Module({
  providers: [ExpirePointsJob, NightlyPayoutCalcJob, SendMerchantReportsJob, TrialEndingReminderJob],
  exports: [ExpirePointsJob, NightlyPayoutCalcJob, SendMerchantReportsJob, TrialEndingReminderJob],
})
export class JobsModule {}
