import { Injectable, NotFoundException } from '@nestjs/common';
import { assertMerchantVisible } from '../../common/merchant-visibility';
import { dayOfWeekFor, isValidDateISO, salonWallTimeToInstant } from '../../common/salon-time';
import { PrismaService } from '../../prisma/prisma.service';

const SLOT_GRANULARITY_MINUTES = 15; // candidate slots start every 15 min

export interface AvailableSlot {
  startTime: string; // ISO
  endTime: string; // ISO
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns bookable time slots for a given merchant + style + date.
   *
   * IMPORTANT SIMPLIFICATION (v1): this treats each merchant as a single
   * resource — one appointment at a time, regardless of how many stylists
   * or chairs they actually have. That's correct for a one-person salon
   * and wrong for a multi-stylist one (it will under-report availability,
   * showing a slot as booked even if a different stylist is free). Adding
   * per-staff resources is the natural next step — see the note in
   * bookings.service.ts's createBooking() for where that would plug in.
   */
  async getAvailableSlots(merchantId: string, styleId: string, dateISO: string): Promise<AvailableSlot[]> {
    // T48 [F47] — checked FIRST, before anything about the style. This route
    // is public, and without it a salon that is suspended, cancelled or still
    // waiting for approval kept offering free appointment times to anyone
    // holding its id, while its own menu 404'd. Same rule, same 404, as
    // `GET /styles/public/:merchantId`.
    await assertMerchantVisible(this.prisma, merchantId, 'This salon is not currently accepting bookings');

    const style = await this.prisma.style.findUnique({ where: { id: styleId } });
    if (!style || style.merchantId !== merchantId) {
      throw new NotFoundException('Style not found for this merchant');
    }
    if (!style.active) return [];

    // [F57] — every one of these three conversions used to run in the Node
    // process's timezone, so the same BusinessHours row produced different
    // slots on a developer machine and on Vercel (which runs UTC). The rule
    // now lives in common/salon-time.ts; pass a per-merchant zone here the day
    // Merchant grows a `timezone` column and nothing else has to change.
    if (!isValidDateISO(dateISO)) throw new NotFoundException('Invalid date');

    const dayOfWeek = dayOfWeekFor(dateISO);
    const hours = await this.prisma.businessHours.findUnique({
      where: { merchantId_dayOfWeek: { merchantId, dayOfWeek } },
    });
    if (!hours || hours.closed) return [];

    const dayStart = salonWallTimeToInstant(dateISO, hours.openTime);
    const dayClose = salonWallTimeToInstant(dateISO, hours.closeTime);
    const durationMs = style.durationMinutes * 60 * 1000;

    // Don't offer slots in the past, e.g. for "today".
    const now = new Date();
    const earliestStart = dayStart > now ? dayStart : this.roundUpToGranularity(now);

    const existingBookings = await this.prisma.booking.findMany({
      where: {
        merchantId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lt: dayClose },
        endTime: { gt: dayStart },
      },
      select: { startTime: true, endTime: true },
    });

    const slots: AvailableSlot[] = [];
    const stepMs = SLOT_GRANULARITY_MINUTES * 60 * 1000;

    for (let start = earliestStart.getTime(); start + durationMs <= dayClose.getTime(); start += stepMs) {
      const slotStart = new Date(start);
      const slotEnd = new Date(start + durationMs);

      const overlaps = existingBookings.some(
        (b: { startTime: Date; endTime: Date }) => slotStart < b.endTime && slotEnd > b.startTime,
      );
      if (!overlaps) {
        slots.push({ startTime: slotStart.toISOString(), endTime: slotEnd.toISOString() });
      }
    }

    return slots;
  }

  /** Confirms a specific start time is still free right before booking it — closes the race-condition window between browsing and submitting. */
  async isSlotStillAvailable(merchantId: string, startTime: Date, endTime: Date): Promise<boolean> {
    const conflict = await this.prisma.booking.findFirst({
      where: {
        merchantId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    return !conflict;
  }

  private roundUpToGranularity(date: Date): Date {
    const ms = SLOT_GRANULARITY_MINUTES * 60 * 1000;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }
}
