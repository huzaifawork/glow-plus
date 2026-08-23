import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
    const stillFree = await this.availability.isSlotStillAvailable(dto.merchantId, startTime, endTime);
    if (!stillFree) {
      throw new BadRequestException('That time slot was just booked by someone else. Please pick another.');
    }

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

  listForConsumer(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      include: { style: true, merchant: { select: { businessName: true } } },
      orderBy: { startTime: 'desc' },
    });
  }

  listForMerchant(merchantId: string, from?: Date, to?: Date) {
    return this.prisma.booking.findMany({
      where: {
        merchantId,
        ...(from || to
          ? {
              startTime: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: { style: true, user: { select: { name: true, email: true, phone: true } } },
      orderBy: { startTime: 'asc' },
    });
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
