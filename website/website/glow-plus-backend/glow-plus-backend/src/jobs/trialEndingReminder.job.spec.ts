/**
 * Tests for TrialEndingReminderJob  (T19)
 *
 * The job existed but had never been run — confirmed by triggering it
 * manually against real Postgres + real Resend (see TASKS.md T19), which
 * found no bug. These tests lock in the two things that mattered live:
 * the date window it queries, and that every match gets emailed with the
 * merchant's own address and trial-end date.
 */
import { TrialEndingReminderJob } from './trialEndingReminder.job';
import { sendEmail } from '../modules/notifications/email.provider';

jest.mock('../modules/notifications/email.provider', () => ({ sendEmail: jest.fn() }));

describe('TrialEndingReminderJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-24T09:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queries TRIALING subscriptions with trialEnd 3-4 days out', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const job = new TrialEndingReminderJob({ subscription: { findMany } } as any);

    await job.run();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'TRIALING',
        trialEnd: { gte: new Date('2026-08-27T09:00:00Z'), lt: new Date('2026-08-28T09:00:00Z') },
      },
      include: { merchant: true },
    });
  });

  it('emails every matched merchant with their own trialEnd', async () => {
    const trialEnd = new Date('2026-08-27T15:00:00Z');
    const findMany = jest.fn().mockResolvedValue([
      { trialEnd, merchant: { email: 'a@salon.test' } },
      { trialEnd, merchant: { email: 'b@salon.test' } },
    ]);
    const job = new TrialEndingReminderJob({ subscription: { findMany } } as any);

    await job.run();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenNthCalledWith(1, { to: 'a@salon.test', template: 'trial-ending-soon', data: { trialEnd } });
    expect(sendEmail).toHaveBeenNthCalledWith(2, { to: 'b@salon.test', template: 'trial-ending-soon', data: { trialEnd } });
  });

  it('sends nothing and does not throw when no subscription matches', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const job = new TrialEndingReminderJob({ subscription: { findMany } } as any);

    await expect(job.run()).resolves.not.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
