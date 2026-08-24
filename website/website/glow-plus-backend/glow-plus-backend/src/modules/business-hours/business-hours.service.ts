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

    return this.get(merchantId);
  }
}
