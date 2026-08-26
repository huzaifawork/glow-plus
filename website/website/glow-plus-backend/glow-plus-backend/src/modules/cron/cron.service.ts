import { Injectable, Logger } from '@nestjs/common';
import { ExpirePointsJob } from '../../jobs/expirePoints.job';
import { NightlyPayoutCalcJob } from '../../jobs/nightlyPayoutCalc.job';
import { SendMerchantReportsJob } from '../../jobs/sendMerchantReports.job';
import { TrialEndingReminderJob } from '../../jobs/trialEndingReminder.job';

/** The slots Vercel Cron can invoke. Anything else is a 404. */
export const CRON_SLOTS = ['nightly', 'morning'] as const;
export type CronSlot = (typeof CRON_SLOTS)[number];

export function isCronSlot(value: string): value is CronSlot {
  return (CRON_SLOTS as readonly string[]).includes(value);
}

/** One job's outcome. Returned to the caller so Vercel's log shows it. */
export interface JobResult {
  job: string;
  status: 'ok' | 'skipped' | 'failed';
  ms: number;
  detail?: string;
}

/**
 * T54 — runs the scheduled jobs on demand, because on Vercel nothing runs them
 * on its own.
 *
 * **Why the jobs stopped being self-scheduling.** All four used `@Cron()` from
 * `@nestjs/schedule`, which sets an in-process timer. That needs a process
 * that is still alive when the timer expires — and a serverless function is
 * alive only while it is serving a request. So on Vercel the timers were
 * registered, the container was frozen seconds later, and **no job would ever
 * have run**: no error, no log, nothing to notice. That silently kills T19
 * (trial reminders) and T25 (point expiry). The decorators are gone rather
 * than left alongside this, because keeping both would double-run every job
 * anywhere a long-running process *does* exist.
 *
 * **Why two slots and not four routes.** Vercel's **Hobby plan allows two cron
 * jobs, each at most once a day.** Four routes would force the client onto Pro
 * (~$20/mo) for four database queries a day. Two slots fit the free allowance
 * exactly while keeping the original intent: the overnight batch together, and
 * the customer-facing email at a civilised hour.
 *
 * | Slot | Was | Runs |
 * |---|---|---|
 * | `nightly` | 2am + 3am + weekly | payout calc, then point expiry, then merchant reports **on Sundays only** |
 * | `morning` | 9am | trial-ending reminders |
 *
 * ⚠️ **Vercel Cron schedules are UTC**, and it does not guarantee the minute —
 * only that the job fires within the hour. Nothing here may assume it runs at
 * exactly 02:00, and nothing may assume a local timezone. The Sunday check
 * below uses `getUTCDay()` for that reason.
 */
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly expirePoints: ExpirePointsJob,
    private readonly nightlyPayout: NightlyPayoutCalcJob,
    private readonly merchantReports: SendMerchantReportsJob,
    private readonly trialReminder: TrialEndingReminderJob,
  ) {}

  async dispatch(slot: CronSlot, now: Date = new Date()): Promise<{ slot: CronSlot; results: JobResult[] }> {
    const results: JobResult[] = [];

    if (slot === 'nightly') {
      // Order preserved from the original schedule: payout calc ran at 2am and
      // point expiry at 3am, so expiry saw the night's payouts already
      // calculated. Running them concurrently would reverse that on a whim.
      results.push(await this.runJob('nightlyPayoutCalc', () => this.nightlyPayout.run()));
      results.push(await this.runJob('expirePoints', () => this.expirePoints.run()));

      // Was CronExpression.EVERY_WEEK — Sunday. The slot fires daily, so the
      // "is it due" test moves in here.
      const isSunday = now.getUTCDay() === 0;
      results.push(
        isSunday
          ? await this.runJob('sendMerchantReports', () => this.merchantReports.run())
          : { job: 'sendMerchantReports', status: 'skipped', ms: 0, detail: 'weekly — Sundays only (UTC)' },
      );
    }

    if (slot === 'morning') {
      results.push(await this.runJob('trialEndingReminder', () => this.trialReminder.run()));
    }

    return { slot, results };
  }

  /**
   * Runs one job and converts a throw into a recorded failure.
   *
   * ⚠️ **A failing job must not prevent the others from running.** They are
   * unrelated — a Resend outage breaking the merchant report has nothing to do
   * with expiring points — and there is no retry: the next attempt is
   * tomorrow. Letting the first exception abort the slot would mean one bad
   * job silently takes the rest of the batch down with it, every night, until
   * someone notices points are not expiring.
   *
   * Runs are sequential, not `Promise.all`, and that is also deliberate: the
   * pooled Supabase connection string is `connection_limit=1` (T52), so
   * parallel jobs would contend for a single connection.
   */
  private async runJob(job: string, run: () => Promise<unknown>): Promise<JobResult> {
    const started = Date.now();
    try {
      await run();
      const ms = Date.now() - started;
      this.logger.log(`${job} ok in ${ms}ms`);
      return { job, status: 'ok', ms };
    } catch (err) {
      const ms = Date.now() - started;
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`${job} FAILED after ${ms}ms: ${detail}`);
      return { job, status: 'failed', ms, detail };
    }
  }
}
