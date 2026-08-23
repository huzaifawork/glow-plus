import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetBusinessHoursDto } from './dto';

@Injectable()
export class BusinessHoursService {
  constructor(private readonly prisma: PrismaService) {}

  async get(merchantId: string) {
    const hours = await this.prisma.businessHours.findMany({
      where: { merchantId },
      orderBy: { dayOfWeek: 'asc' },
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
