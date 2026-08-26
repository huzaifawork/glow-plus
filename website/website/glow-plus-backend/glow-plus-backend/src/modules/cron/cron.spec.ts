import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CronSecretGuard } from './cron.guard';
import { CronController } from './cron.controller';
import { CronService, isCronSlot } from './cron.service';

const ctxWith = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization === undefined ? {} : { authorization } }) }),
  }) as unknown as ExecutionContext;

describe('CronSecretGuard (T54)', () => {
  const guard = new CronSecretGuard();
  const SECRET = 'super-secret-cron-value';
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });

  it('accepts the configured secret', () => {
    expect(guard.canActivate(ctxWith(`Bearer ${SECRET}`))).toBe(true);
  });

  it('matches the Bearer scheme case-insensitively (RFC 7235 §2.1, as T46 does)', () => {
    expect(guard.canActivate(ctxWith(`bearer ${SECRET}`))).toBe(true);
    expect(guard.canActivate(ctxWith(`BEARER ${SECRET}`))).toBe(true);
  });

  it('FAILS CLOSED when CRON_SECRET is unset — never open by default', () => {
    // The failure mode this exists to prevent: a missing env var quietly
    // publishing a route that expires points and sends email.
    delete process.env.CRON_SECRET;
    expect(() => guard.canActivate(ctxWith(`Bearer ${SECRET}`))).toThrow(UnauthorizedException);
  });

  it.each([
    ['a wrong secret', 'Bearer nope'],
    ['no header at all', undefined],
    ['an empty header', ''],
    ['the secret without the scheme', 'super-secret-cron-value'],
    ['a Basic credential', 'Basic super-secret-cron-value'],
    ['the right secret with trailing junk', 'Bearer super-secret-cron-value-extra'],
  ])('rejects %s', (_label, header) => {
    expect(() => guard.canActivate(ctxWith(header))).toThrow(UnauthorizedException);
  });

  it('gives every rejection the SAME message, so a prober learns nothing', () => {
    // A distinct "wrong secret" reply would confirm the route exists and is
    // merely guarded — turning a 401 into a signal.
    const messages = ['Bearer wrong', undefined, 'Basic x'].map((h) => {
      try {
        guard.canActivate(ctxWith(h));
        return 'ACCEPTED';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(new Set(messages).size).toBe(1);
  });
});

describe('CronService dispatch (T54)', () => {
  const job = () => ({ run: jest.fn().mockResolvedValue(undefined) });

  const build = () => {
    const expire = job();
    const payout = job();
    const reports = job();
    const trial = job();
    const service = new CronService(expire as never, payout as never, reports as never, trial as never);
    return { service, expire, payout, reports, trial };
  };

  const SUNDAY = new Date('2026-08-30T02:00:00Z');
  const MONDAY = new Date('2026-08-31T02:00:00Z');

  it('nightly runs payout THEN expiry — the order the old 2am/3am split implied', () => {
    const { service, expire, payout } = build();
    const order: string[] = [];
    payout.run.mockImplementation(async () => void order.push('payout'));
    expire.run.mockImplementation(async () => void order.push('expire'));

    return service.dispatch('nightly', MONDAY).then(() => {
      expect(order).toEqual(['payout', 'expire']);
    });
  });

  it('runs the weekly merchant report on Sunday only', async () => {
    const sun = build();
    await sun.service.dispatch('nightly', SUNDAY);
    expect(sun.reports.run).toHaveBeenCalled();

    const mon = build();
    const res = await mon.service.dispatch('nightly', MONDAY);
    expect(mon.reports.run).not.toHaveBeenCalled();
    expect(res.results.find((r) => r.job === 'sendMerchantReports')?.status).toBe('skipped');
  });

  it('decides the weekday in UTC, not the server timezone', async () => {
    // 2026-08-30T23:30Z is Sunday UTC but already Monday in Asia/Karachi.
    // Vercel Cron schedules are UTC; a local-time check would skip the report
    // on the very night it is due, silently, once a week.
    const { service, reports } = build();
    await service.dispatch('nightly', new Date('2026-08-30T23:30:00Z'));
    expect(reports.run).toHaveBeenCalled();
  });

  it('morning runs only the trial reminder', async () => {
    const { service, trial, expire, payout, reports } = build();
    await service.dispatch('morning', MONDAY);
    expect(trial.run).toHaveBeenCalled();
    for (const other of [expire, payout, reports]) expect(other.run).not.toHaveBeenCalled();
  });

  it('a failing job does NOT stop the rest of the batch', async () => {
    // There is no retry — the next attempt is tomorrow. One bad job taking the
    // others down would mean points quietly stop expiring every night.
    const { service, payout, expire } = build();
    payout.run.mockRejectedValue(new Error('Supabase unreachable'));

    const res = await service.dispatch('nightly', MONDAY);

    expect(expire.run).toHaveBeenCalled();
    const failed = res.results.find((r) => r.job === 'nightlyPayoutCalc');
    expect(failed?.status).toBe('failed');
    expect(failed?.detail).toContain('Supabase unreachable');
    expect(res.results.find((r) => r.job === 'expirePoints')?.status).toBe('ok');
  });

  it('reports every job in the slot, so the cron log shows the whole batch', async () => {
    const { service } = build();
    const res = await service.dispatch('nightly', SUNDAY);
    expect(res.results.map((r) => r.job)).toEqual([
      'nightlyPayoutCalc',
      'expirePoints',
      'sendMerchantReports',
    ]);
  });
});

describe('CronController (T54)', () => {
  const service = { dispatch: jest.fn().mockResolvedValue({ slot: 'nightly', results: [] }) };
  const controller = new CronController(service as unknown as CronService);

  it.each(['nightly', 'morning'])('dispatches the known slot %s', async (slot) => {
    await controller.dispatch(slot);
    expect(service.dispatch).toHaveBeenCalledWith(slot);
  });

  it('404s an unknown slot, so a vercel.json typo is visible rather than a no-op', async () => {
    await expect(controller.dispatch('nightlyy')).rejects.toThrow(NotFoundException);
  });

  it('isCronSlot accepts exactly the two slots vercel.json schedules', () => {
    expect(isCronSlot('nightly')).toBe(true);
    expect(isCronSlot('morning')).toBe(true);
    expect(isCronSlot('weekly')).toBe(false);
    expect(isCronSlot('')).toBe(false);
  });
});

describe('the wiring T54 depends on', () => {
  const read = (rel: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').readFileSync(require('path').join(__dirname, '..', '..', rel), 'utf8');

  /**
   * `read` with comments stripped — required for the negative assertions.
   * These files explain at length WHY the thing was removed, so the forbidden
   * pattern appears in the very comment documenting its absence, and a naive
   * `not.toMatch` fails on a file that is entirely correct.
   */
  const readCode = (rel: string): string =>
    read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('no job schedules itself any more — @Cron cannot fire on serverless', () => {
    // If one came back it would double-run wherever a long-running process
    // exists, and still never fire on Vercel.
    for (const f of ['expirePoints', 'nightlyPayoutCalc', 'sendMerchantReports', 'trialEndingReminder']) {
      expect(readCode(`jobs/${f}.job.ts`)).not.toMatch(/@Cron\(/);
    }
    expect(readCode('app.module.ts')).not.toMatch(/ScheduleModule\.forRoot\(\)/);
  });

  it('the cron path is excluded from AuthMiddleware', () => {
    // Vercel sends CRON_SECRET as `Authorization: Bearer <secret>` — the same
    // header AuthMiddleware parses as a JWT. Without the exclusion it 401s
    // before the guard runs and every scheduled job stops silently.
    expect(read('app.module.ts')).toMatch(/withVersion\('cron\/\(\.\*\)'\)/);
  });

  it('vercel.json schedules exactly the slots the controller accepts', () => {
    const vercel = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'vercel.json'), 'utf8'),
    );
    const paths = vercel.crons.map((c: { path: string }) => c.path);
    expect(paths).toEqual(['/v1/cron/nightly', '/v1/cron/morning']);

    // Hobby allows TWO cron jobs, at most once a day. Exceeding either forces
    // the client onto Pro (~$20/mo) for four queries a day.
    expect(vercel.crons).toHaveLength(2);
    for (const c of vercel.crons) {
      expect(c.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
    }
  });
});
