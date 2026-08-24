import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { POINTS_EXPIRE_AFTER_DAYS } from '../../jobs/expirePoints.job';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far ahead "expiring soon" looks. 30d matches how the reminder reads to
 *  a customer: long enough to book another visit, short enough to matter. */
const EXPIRING_SOON_DAYS = 30;

/**
 * Consumer points balance  (T25) [F8][F22]
 *
 * `src/modules/points/` was one of the empty placeholder directories [F22] —
 * the concept existed in the schema and nowhere else. This fills it.
 *
 * There is no balance column anywhere: points are derived from `Visit` rows,
 * and T25 gives those rows an `expired` flag. So a balance is a sum over
 * non-expired visits, and "what expires next" is a question about the OLDEST
 * non-expired visit — a visit expires `POINTS_EXPIRE_AFTER_DAYS` after it
 * happened, so its expiry date is knowable before the nightly job runs.
 *
 * That last point matters for the UI: showing only what the job has already
 * expired would tell a customer their points vanished the morning after it
 * was too late to use them.
 */
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async balanceFor(userId: string) {
    const visits = await this.prisma.visit.findMany({
      where: { userId },
      select: { merchantId: true, pointsEarned: true, visitDate: true, expired: true, expiredAt: true },
      orderBy: { visitDate: 'asc' },
    });

    const merchantIds = [...new Set(visits.map((v) => v.merchantId))];
    const merchants = await this.prisma.merchant.findMany({
      where: { id: { in: merchantIds } },
      select: { id: true, businessName: true },
    });
    const nameOf = new Map(merchants.map((m) => [m.id, m.businessName]));

    const now = Date.now();
    const soonCutoff = new Date(now + EXPIRING_SOON_DAYS * DAY_MS);

    return merchantIds.map((merchantId) => {
      const mine = visits.filter((v) => v.merchantId === merchantId);
      const active = mine.filter((v) => !v.expired);
      const expired = mine.filter((v) => v.expired);

      // A visit expires exactly POINTS_EXPIRE_AFTER_DAYS after it happened.
      const expiryDateOf = (v: { visitDate: Date }) =>
        new Date(v.visitDate.getTime() + POINTS_EXPIRE_AFTER_DAYS * DAY_MS);

      // `active` is ordered oldest-first, so the first entry is the next to go.
      const nextToExpire = active[0];
      const expiringSoon = active.filter((v) => expiryDateOf(v) <= soonCutoff);

      return {
        merchantId,
        businessName: nameOf.get(merchantId) ?? 'Unknown salon',
        activePoints: active.reduce((sum, v) => sum + v.pointsEarned, 0),
        activeVisits: active.length,
        expiredPoints: expired.reduce((sum, v) => sum + v.pointsEarned, 0),
        expiredVisits: expired.length,
        expiresAfterDays: POINTS_EXPIRE_AFTER_DAYS,
        nextExpiry: nextToExpire
          ? { date: expiryDateOf(nextToExpire), points: nextToExpire.pointsEarned }
          : null,
        expiringSoon: {
          withinDays: EXPIRING_SOON_DAYS,
          points: expiringSoon.reduce((sum, v) => sum + v.pointsEarned, 0),
          visits: expiringSoon.length,
        },
        lastExpiredAt: expired.length ? expired[expired.length - 1].expiredAt : null,
      };
    });
  }
}
