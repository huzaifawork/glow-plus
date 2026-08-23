import { Module } from '@nestjs/common';
import { ExpirePointsJob } from './expirePoints.job';
import { NightlyPayoutCalcJob } from './nightlyPayoutCalc.job';
import { SendMerchantReportsJob } from './sendMerchantReports.job';
import { TrialEndingReminderJob } from './trialEndingReminder.job';

@Module({
  providers: [ExpirePointsJob, NightlyPayoutCalcJob, SendMerchantReportsJob, TrialEndingReminderJob],
})
export class JobsModule {}
