import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMerchantVisible } from '../../common/merchant-visibility';
import { dayOfWeekFor, isValidDateISO, salonDateFor, salonWallTimeToInstant } from '../../common/salon-time';
import { PrismaService } from '../../prisma/prisma.service';

const SLOT_GRANULARITY_MINUTES = 15; // candidate slots start every 15 min

export interface AvailableSlot {
  startTime: string; // ISO
  endTime: string; // ISO
  /**
   * T83 — how many of the salon's seats are still free for this slot, and how
   * many it has in total. Additive: the two fields that existed keep their
   * names and meaning, so the React Native app (Order 2), which reads only
   * `startTime`/`endTime`, is unaffected.
   */
  seatsAvailable: number;
  seatsTotal: number;
}

/** T83 — the at-a-glance answer for a salon's page and the directory. */
export interface CapacitySummary {
  seats: number;
  /** Bookings overlapping this instant. */
  inUseNow: number;
  freeNow: number;
  /** False when the salon is closed right now, so `freeNow` is not mistaken for "walk in". */
  openNow: boolean;
  /** No remaining slot today for the salon's shortest active service. */
  fullyBookedToday: boolean;
  /** ISO instant of the next free slot today, or null when there is none left. */
  nextFreeAt: string | null;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns bookable time slots for a given merchant + style + date.
   *
   * T83 — capacity aware. Each salon declares `seats`: how many clients it can
   * serve at once (chairs, stations, stylists on shift). A slot is offered
   * while FEWER THAN `seats` bookings overlap it, and each slot reports how
   * many are left.
   *
   * This replaces the v1 simplification that treated every merchant as a
   * single resource — one appointment at a time, however many chairs they
   * had. That under-reported availability badly: a four-chair salon read as
   * fully booked the moment ONE client booked, and every slot three real
   * stylists were free for simply never appeared.
   *
   * `seats` defaults to 1, which reproduces the old behaviour exactly, so a
   * one-person salon is unaffected.
   *
   * Still NOT per-stylist scheduling: seats are interchangeable, so this
   * cannot say *which* stylist, or hold a named one. That is a much larger
   * build (staff rotas, per-staff hours, skills per service) and is not what
   * "how many seats are free" needs. Per-staff resources would plug in here
   * and in `countOverlapping` below.
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

    const seats = await this.seatsFor(merchantId);

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

      // Count them rather than asking "is there one?" — that difference IS the
      // feature. `some()` treated the second chair as unavailable.
      const taken = existingBookings.filter(
        (b: { startTime: Date; endTime: Date }) => slotStart < b.endTime && slotEnd > b.startTime,
      ).length;

      if (taken < seats) {
        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          seatsAvailable: seats - taken,
          seatsTotal: seats,
        });
      }
    }

    return slots;
  }

  /**
   * The at-a-glance answer: how busy is this salon, right now and today.
   *
   * Deliberately does NOT take a style. A customer looking at a salon card is
   * asking "can I get in?", not "can I get a 90-minute balayage at 3pm?" — so
   * `fullyBookedToday` is measured against the salon's SHORTEST active
   * service. If even that does not fit, nothing does, and the answer is
   * honest for every service rather than accidentally pessimistic for the
   * long ones.
   *
   * A closed salon reports `openNow: false` with `freeNow` still filled in,
   * so a caller never renders "3 seats free" over a locked door.
   */
  async getCapacity(merchantId: string): Promise<CapacitySummary> {
    await assertMerchantVisible(this.prisma, merchantId, 'This salon is not currently accepting bookings');

    const seats = await this.seatsFor(merchantId);
    const now = new Date();

    const inUseNow = await this.countOverlapping(merchantId, now, now);

    const today = salonDateFor(now);
    const hours = await this.prisma.businessHours.findUnique({
      where: { merchantId_dayOfWeek: { merchantId, dayOfWeek: dayOfWeekFor(today) } },
    });
    const openNow =
      !!hours &&
      !hours.closed &&
      now >= salonWallTimeToInstant(today, hours.openTime) &&
      now < salonWallTimeToInstant(today, hours.closeTime);

    // Shortest active service — see the note above.
    const shortest = await this.prisma.style.findFirst({
      where: { merchantId, active: true },
      orderBy: { durationMinutes: 'asc' },
      select: { id: true },
    });

    let nextFreeAt: string | null = null;
    if (shortest) {
      const slots = await this.getAvailableSlots(merchantId, shortest.id, today);
      nextFreeAt = slots.length ? slots[0].startTime : null;
    }

    return {
      seats,
      inUseNow,
      freeNow: Math.max(0, seats - inUseNow),
      openNow,
      // A salon with no active services is not "fully booked" — it has nothing
      // to book. Reporting it as booked out would be a different, wrong story.
      fullyBookedToday: Boolean(shortest) && nextFreeAt === null,
      nextFreeAt,
    };
  }

  private async seatsFor(merchantId: string): Promise<number> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { seats: true },
    });
    // Falls back to the pre-T83 behaviour rather than throwing: this is called
    // after the merchant has already been resolved by every caller.
    return Math.max(1, merchant?.seats ?? 1);
  }

  /**
   * Bookings overlapping a window. `start === end` asks "at this instant",
   * where the strict comparisons still behave: a booking running 10:00–11:00
   * overlaps 10:30, and one ending exactly at 10:30 does not.
   */
  private async countOverlapping(merchantId: string, start: Date, end: Date): Promise<number> {
    return this.prisma.booking.count({
      where: {
        merchantId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lte: start },
        endTime: { gt: end },
      },
    });
  }

  /**
   * Refuses a requested appointment that the salon is not open for.  [F64]
   *
   * `POST /bookings` validated the merchant, the style, the past and a
   * conflicting booking — and **never consulted `BusinessHours` at all.**
   * `isSlotStillAvailable()` below only looks for a clashing row, so opening
   * hours were enforced by nothing but the slot grid the browser happened to
   * render. A grid is a suggestion. Proved live: a booking on the salon's
   * closed Sunday, one two hours before opening, and one starting at 4:30 PM
   * for a 90-minute service that ran an hour past closing were **all accepted
   * with 201**.
   *
   * This is the same reasoning already written into `create()` for T48
   * [F47] — *"Re-checked here and not merely on the availability route,
   * because a client can POST straight to this one"* — which was applied to
   * merchant visibility and never to hours.
   *
   * The grid-alignment check is deliberately expressed as **membership in the
   * slots this service itself would offer**, rather than as a re-derived
   * modulo. A second copy of the rule is a second thing to drift; asking the
   * generator makes it impossible for the write path to refuse a slot the
   * read path advertised, or accept one it never showed.
   */
  async assertBookable(
    merchantId: string,
    styleId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<void> {
    // The salon's calendar date for this instant — NOT the server's. A 10:30 PM
    // Toronto appointment is already "tomorrow" in UTC, and looking up
    // tomorrow's hours row would apply the wrong day's opening times.
    const dateISO = salonDateFor(startTime);
    const dayOfWeek = dayOfWeekFor(dateISO);

    const hours = await this.prisma.businessHours.findUnique({
      where: { merchantId_dayOfWeek: { merchantId, dayOfWeek } },
    });
    // A missing row and `closed` are the same answer to a customer, and the
    // distinction that matters ([F52] — a salon that never set its hours) is
    // the salon's problem to fix, not something to expose here.
    if (!hours || hours.closed) {
      throw new BadRequestException('The salon is closed that day. Please pick another date.');
    }

    const opensAt = salonWallTimeToInstant(dateISO, hours.openTime);
    const closesAt = salonWallTimeToInstant(dateISO, hours.closeTime);

    if (startTime < opensAt) {
      throw new BadRequestException('That time is before the salon opens. Please pick another time.');
    }
    // `endTime`, not `startTime` — booking a 90-minute service half an hour
    // before closing is the case that actually costs the salon an hour.
    if (endTime > closesAt) {
      throw new BadRequestException('That appointment would run past closing time. Please pick another time.');
    }

    const offered = await this.getAvailableSlots(merchantId, styleId, dateISO);
    const wanted = startTime.toISOString();
    if (!offered.some((s) => s.startTime === wanted)) {
      // Reached when the start is off the 15-minute grid, or when the slot has
      // been taken since the customer loaded the page. The conflict case gets
      // its own clearer message from isSlotStillAvailable() in create().
      throw new BadRequestException('Please pick one of the offered appointment times.');
    }
  }

  /** Confirms a specific start time is still free right before booking it — closes the race-condition window between browsing and submitting. */
  /**
   * T83 — capacity aware, and it MUST stay in step with the slot loop above.
   *
   * If this still refused on any overlap, the read path would offer a second
   * chair and the write path would reject the booking it had just advertised
   * — the exact read/write disagreement [F64] was about, arriving from the
   * other direction.
   */
  async isSlotStillAvailable(merchantId: string, startTime: Date, endTime: Date): Promise<boolean> {
    const seats = await this.seatsFor(merchantId);
    const taken = await this.prisma.booking.count({
      where: {
        merchantId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    return taken < seats;
  }

  private roundUpToGranularity(date: Date): Date {
    const ms = SLOT_GRANULARITY_MINUTES * 60 * 1000;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }
}
