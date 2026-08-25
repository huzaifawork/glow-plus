import { Injectable, BadRequestException } from '@nestjs/common';
import { assertMerchantVisible } from '../../common/merchant-visibility';
import { PrismaService } from '../../prisma/prisma.service';
import { SetBusinessHoursDto } from './dto';

@Injectable()
export class BusinessHoursService {
  constructor(private readonly prisma: PrismaService) {}

  async get(merchantId: string) {
    // T48 [F47] — public route, so the same visibility rule as the menu and
    // the availability list. Without it an unknown or suspended salon answered
    // 200 with a full week of default hours, which reads as "a real salon that
    // happens to be closed" rather than "not open to customers".
    await assertMerchantVisible(this.prisma, merchantId);

    return this.read(merchantId);
  }

  /**
   * The merchant's OWN hours, with no visibility check  [F54]
   *
   * `get()` above is the public route and refuses a salon that is not ACTIVE.
   * Reusing it for the owner's own read-back was wrong twice over:
   *
   *   - `set()` ended with `return this.get(merchantId)`, so a PENDING salon
   *     saving its hours had the transaction COMMIT and then received a 404.
   *     The write succeeded and the UI reported failure.
   *   - the portal has to show a salon its hours before approval, which is
   *     exactly what the pending banner invites it to do.
   *
   * So the shared read lives here and each caller decides its own rule.
   */
  async readOwn(merchantId: string) {
    return this.read(merchantId);
  }

  private async read(merchantId: string) {
    const hours = await this.prisma.businessHours.findMany({
      where: { merchantId },
      orderBy: { dayOfWeek: 'asc' },
      // T48 — an explicit allow-list rather than every column. BusinessHours
      // holds nothing secret today, which is precisely the state in which an
      // extra column gets added to an internet-facing response without anyone
      // noticing [F31]. `merchantId` is deliberately out: the caller supplied
      // it, so echoing it back adds nothing.
      select: { dayOfWeek: true, openTime: true, closeTime: true, closed: true },
    });

    // Default to "closed" for any day the merchant hasn't configured yet,
    // rather than treating an unconfigured day as open 24 hours.
    const byDay = new Map(hours.map((h: { dayOfWeek: number }) => [h.dayOfWeek, h]));
    return Array.from({ length: 7 }, (_, dayOfWeek) => {
      const existing = byDay.get(dayOfWeek);
      return (
        existing ?? {
          dayOfWeek,
          openTime: '09:00',
          closeTime: '17:00',
          closed: true,
        }
      );
    });
  }

  async set(merchantId: string, dto: SetBusinessHoursDto) {
    for (const day of dto.days) {
      if (!day.closed) {
        if (!day.openTime || !day.closeTime) {
          throw new BadRequestException(`Day ${day.dayOfWeek}: openTime and closeTime are required unless closed is true`);
        }
        if (day.openTime >= day.closeTime) {
          throw new BadRequestException(`Day ${day.dayOfWeek}: openTime must be before closeTime`);
        }
      }
    }

    await this.prisma.$transaction(
      dto.days.map((day) =>
        this.prisma.businessHours.upsert({
          where: { merchantId_dayOfWeek: { merchantId, dayOfWeek: day.dayOfWeek } },
          create: {
            merchantId,
            dayOfWeek: day.dayOfWeek,
            openTime: day.openTime ?? '09:00',
            closeTime: day.closeTime ?? '17:00',
            closed: day.closed ?? false,
          },
          update: {
            openTime: day.openTime ?? '09:00',
            closeTime: day.closeTime ?? '17:00',
            closed: day.closed ?? false,
          },
        }),
      ),
    );

    // NOT `this.get()` — see readOwn's comment [F54].
    return this.read(merchantId);
  }
}
