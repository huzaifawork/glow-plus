/**
 * Tests for ExpirePointsJob  (T25) [F8]
 *
 * The bug this job had was not a wrong result — it was no result at all:
 * `data: {}` updated nothing while logging a count as though it had. So the
 * assertions here are mostly about the SHAPE of the write, which is exactly
 * what was missing.
 */
import { Test } from '@nestjs/testing';
import { ExpirePointsJob, POINTS_EXPIRE_AFTER_DAYS } from './expirePoints.job';
import { PrismaService } from '../prisma/prisma.service';

describe('ExpirePointsJob', () => {
  const updateMany = jest.fn();
  let job: ExpirePointsJob;

  beforeEach(async () => {
    updateMany.mockReset().mockResolvedValue({ count: 3 });
    const moduleRef = await Test.createTestingModule({
      providers: [ExpirePointsJob, { provide: PrismaService, useValue: { visit: { updateMany } } }],
    }).compile();
    job = moduleRef.get(ExpirePointsJob);
  });

  it('actually writes expired: true — the no-op [F8] was the whole bug', async () => {
    await job.run();
    const { data } = updateMany.mock.calls[0][0];
    expect(data.expired).toBe(true);
    expect(data.expiredAt).toBeInstanceOf(Date);
  });

  it('selects only visits older than the TTL', async () => {
    const before = Date.now();
    await job.run();
    const { where } = updateMany.mock.calls[0][0];
    const cutoff = where.visitDate.lt as Date;
    const expected = before - POINTS_EXPIRE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5000);
  });

  it('skips rows already expired, so a second run is idempotent', async () => {
    await job.run();
    expect(updateMany.mock.calls[0][0].where.expired).toBe(false);
  });

  it('reports how many it expired', async () => {
    await expect(job.run()).resolves.toEqual(expect.objectContaining({ expired: 3 }));
  });

  it('does not throw when nothing is old enough', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(job.run()).resolves.toEqual(expect.objectContaining({ expired: 0 }));
  });
});
