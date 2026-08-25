import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DEFAULT_PAGE_SIZE, PaginationQueryDto } from '../../common/pagination.dto';
import { assertMerchantVisible } from '../../common/merchant-visibility';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptPii } from '../../common/pii-crypto';
import { AvailabilityService } from './availability.service';
import { RewardRulesService } from '../reward-rules/reward-rules.service';
import { sendEmail } from '../notifications/email.provider';
import { CreateBookingDto } from './dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly rewardRules: RewardRulesService,
  ) {}

  async create(userId: string, dto: CreateBookingDto) {
    // T48 [F47] — this check did not exist, and its absence was the sharpest
    // edge of that finding: a customer could complete a booking at a salon
    // that was SUSPENDED for non-payment, PENDING approval, or CANCELLED. The
    // row was written, the salon owed a service it had not paid to sell, and
    // nothing anywhere refused it. Re-checked here and not merely on the
    // availability route, because a client can POST straight to this one.
    await assertMerchantVisible(this.prisma, dto.merchantId, 'This salon is not currently accepting bookings');

    const style = await this.prisma.style.findUnique({ where: { id: dto.styleId } });
    if (!style || style.merchantId !== dto.merchantId) {
      throw new NotFoundException('Style not found for this merchant');
    }
    if (!style.active) throw new BadRequestException('This style is no longer available for booking');

    const startTime = new Date(dto.startTime);
    if (isNaN(startTime.getTime())) throw new BadRequestException('Invalid startTime');
    if (startTime < new Date()) throw new BadRequestException('Cannot book a time in the past');

    const endTime = new Date(startTime.getTime() + style.durationMinutes * 60 * 1000);

    // Re-check availability right before writing — closes the gap between
    // a customer browsing slots and actually submitting one, in case
    // someone else grabbed it in between. See availability.service.ts for
    // the single-resource-per-merchant limitation this inherits (no
    // per-staff concurrency yet — that's the natural place to extend this
    // check once staff/room resources are modeled).
    //
    // Ordered BEFORE the [F64] check below, and that order is deliberate:
    // `assertBookable` refuses a taken slot too (it asks the slot generator,
    // which already excludes booked times), so running it first made this
    // message unreachable and told a customer who lost a race to "pick one of
    // the offered times" — which is what they did. Losing a race and typing a
    // nonsense time are different mistakes and deserve different sentences.
    const stillFree = await this.availability.isSlotStillAvailable(dto.merchantId, startTime, endTime);
    if (!stillFree) {
      throw new BadRequestException('That time slot was just booked by someone else. Please pick another.');
    }

    // [F64] — the salon has to actually be OPEN. Until this line, `create()`
    // checked the merchant, the style, the past and a clashing booking, and
    // never looked at BusinessHours once: a POST straight to this route was
    // accepted on the closed Sunday, before opening, past closing, and off the
    // 15-minute grid. The slot grid in the browser was the only thing
    // enforcing opening hours, and a grid the client draws is not a
    // constraint the server may rely on — the same argument T48 made two
    // checks above this one.
    await this.availability.assertBookable(dto.merchantId, dto.styleId, startTime, endTime);

    const booking = await this.prisma.booking.create({
      data: {
        merchantId: dto.merchantId,
        userId,
        styleId: dto.styleId,
        startTime,
        endTime,
        notes: dto.notes,
        status: 'PENDING',
      },
      include: { style: true, merchant: { select: { businessName: true } } },
    });

    return booking;
  }

  /**
   * T50 — paginated. The RN app maps this response directly
   * (`client.js:203`), so the body stays a bare array and the total goes in
   * `X-Total-Count`; see common/pagination.dto.ts.
   */
  async listForConsumer(userId: string, query: PaginationQueryDto = {}) {
    const where = { userId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: { style: true, merchant: { select: { businessName: true } } },
        orderBy: { startTime: 'desc' },
        skip: query.offset ?? 0,
        take: query.limit ?? DEFAULT_PAGE_SIZE,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * T31b — the only route in the API that reads a customer's phone number.
   *
   * `User.phone` is now AES-256-GCM ciphertext, so it has to be decrypted on
   * the way out or the merchant sees `v1:AbC...` where a phone number should
   * be. The merchant is a legitimate reader here — it is their own customer's
   * booking — so this decrypts rather than redacts.
   *
   * `decryptPii` returns a pre-T31b plaintext row unchanged, so rows written
   * before the migration keep working without a backfill.
   */
  async listForMerchant(merchantId: string, from?: Date, to?: Date, query: PaginationQueryDto = {}) {
    const where = {
      merchantId,
      ...(from || to
        ? {
            startTime: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    // T50 — counted with the SAME `where`, date filter included, so a merchant
    // paging through "this week" is told how many are in this week and not how
    // many they have ever taken.
    const [bookings, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: { style: true, user: { select: { name: true, email: true, phone: true } } },
        orderBy: { startTime: 'asc' },
        skip: query.offset ?? 0,
        take: query.limit ?? DEFAULT_PAGE_SIZE,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const items = bookings.map((booking) => ({
      ...booking,
      user: {
        ...booking.user,
        phone: booking.user.phone ? decryptPii(booking.user.phone) : null,
      },
    }));

    return { items, total };
  }

  async confirm(merchantId: string, bookingId: string) {
    const booking = await this.getOwnedByMerchant(merchantId, bookingId);
    if (booking.status !== 'PENDING') {
      throw new BadRequestException(`Cannot confirm a booking with status ${booking.status}`);
    }
    return this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
  }

  async markNoShow(merchantId: string, bookingId: string) {
    const booking = await this.getOwnedByMerchant(merchantId, bookingId);
    if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
      throw new BadRequestException(`Cannot mark a booking with status ${booking.status} as no-show`);
    }
    return this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'NO_SHOW' } });
  }

  /** Consumer cancelling their own booking, or merchant cancelling one at their salon. */
  async cancel(requesterId: string, role: 'consumer' | 'merchant', bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (role === 'consumer' && booking.userId !== requesterId) {
      throw new ForbiddenException('Not your booking');
    }
    if (role === 'merchant' && booking.merchantId !== requesterId) {
      throw new ForbiddenException('Not your booking');
    }
    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot cancel a booking with status ${booking.status}`);
    }

    return this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
  }

  /**
   * The integration point that makes booking worth building on top of the
   * existing loyalty system: completing an appointment automatically logs
   * the visit and checks reward triggers, exactly like a front-desk staff
   * member manually logging a walk-in visit — no separate step needed.
   */
  async complete(merchantId: string, staffUserId: string, bookingId: string) {
    const booking = await this.getOwnedByMerchant(merchantId, bookingId);
    if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
      throw new BadRequestException(`Cannot complete a booking with status ${booking.status}`);
    }

    const style = await this.prisma.style.findUnique({ where: { id: booking.styleId } });
    if (!style) throw new NotFoundException('Style no longer exists');

    const [updatedBooking, visit] = await this.prisma.$transaction([
      this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } }),
      this.prisma.visit.create({
        data: {
          userId: booking.userId,
          merchantId,
          styleId: booking.styleId,
          pointsEarned: style.pointsPerVisit,
          loggedBy: staffUserId,
          bookingId: booking.id,
        },
      }),
    ]);

    const activeRules = await this.prisma.rewardRule.findMany({ where: { merchantId, active: true } });
    const unlocked: { ruleId: string; name: string }[] = [];
    for (const rule of activeRules) {
      const result = await this.rewardRules.evaluate(rule as any, booking.userId, merchantId);
      if (result.unlocked) unlocked.push({ ruleId: rule.id, name: rule.name });
    }

    if (unlocked.length) {
      const user = await this.prisma.user.findUnique({ where: { id: booking.userId } });
      if (user) {
        await sendEmail({
          to: user.email,
          template: 'reward-unlocked',
          data: { rewards: unlocked.map((r) => r.name) },
        });
      }
    }

    return { booking: updatedBooking, visit, unlocked };
  }

  private async getOwnedByMerchant(merchantId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.merchantId !== merchantId) throw new ForbiddenException('Not your booking');
    return booking;
  }
}
