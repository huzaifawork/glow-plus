import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PaginationQueryDto } from '../../common/pagination.dto';
import { BookingsService } from './bookings.service';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto, CreateBookingDto, MerchantBookingsQueryDto } from './dto';
import { AuthedRequest, ConsumerRequest, MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireConsumerGuard } from '../../common/guards/require-consumer.guard';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly availability: AvailabilityService,
  ) {}

  // Public — browsing available times shouldn't require an account yet.
  //
  // T31 — this took three loose `@Query('x') x: string` params, which
  // ValidationPipe does not validate. A missing merchantId/styleId arrived as
  // `undefined`, reached `findUnique({ where: { id: undefined } })` and came
  // back as a bare 500. `AvailabilityQueryDto` already existed in ./dto and
  // was simply never wired up; binding the whole query object to it is what
  // makes the pipe run. Now 400 with a message naming the missing field.
  @Get('availability')
  getAvailability(@Query() query: AvailabilityQueryDto) {
    return this.availability.getAvailableSlots(query.merchantId, query.styleId, query.date);
  }

  // Consumer — book an appointment.
  @Post()
  @UseGuards(RequireConsumerGuard)
  create(@Req() req: ConsumerRequest, @Body() dto: CreateBookingDto) {
    return this.bookings.create(req.accountId, dto);
  }

  // Consumer — their own upcoming/past bookings.
  /**
   * T50 — paginated. The body stays a **bare array** and the total goes in
   * `X-Total-Count`, the same contract T43 and T44 set for the public lists:
   * both clients map the response directly, so an `{ items, total }` envelope
   * would be a breaking change.
   *
   * `passthrough: true` is load-bearing — without it, injecting `@Res()` puts
   * the handler into manual mode, Nest stops serialising the return value, and
   * the request hangs until it times out.
   *
   * `X-Total-Count` is exposed to browsers once, globally, in
   * `config/security.ts`. Do NOT add a per-route
   * `Access-Control-Expose-Headers` here: it REPLACES rather than appends and
   * would take the rate-limit headers down with it [F46].
   */
  @Get('me')
  @UseGuards(RequireConsumerGuard)
  async mine(
    @Req() req: ConsumerRequest,
    @Query() query: PaginationQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.bookings.listForConsumer(req.accountId, query);
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  // Either party can cancel — the service checks ownership based on role.
  // T29: the role was previously derived with an `else consumer` fallback, so
  // an admin token fell into the consumer branch and was refused by an
  // *ownership* check ("Not your booking") rather than a role one. Same 403,
  // but it described the wrong problem. Neither role is refused here — this is
  // the one route both may call — so the check has to live in the handler.
  @Patch(':id/cancel')
  cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    const isMerchant = req.accountRole === 'merchant_owner' || req.accountRole === 'merchant_staff';
    const requesterId = isMerchant ? req.merchantId : req.accountId;
    if (req.accountRole !== 'consumer' && !isMerchant) {
      throw new ForbiddenException('This action requires a consumer or merchant account');
    }
    if (!requesterId) {
      throw new ForbiddenException('No account context on this request');
    }
    return this.bookings.cancel(requesterId, isMerchant ? 'merchant' : 'consumer', id);
  }

  // Merchant — their calendar, optionally filtered by date range.
  /**
   * T50 — paginated, and the date filter is now VALIDATED.
   *
   * `from`/`to` were loose `@Query('from') from?: string` params, which
   * ValidationPipe does not look at [F38] — `new Date('banana')` is an
   * Invalid Date, and Prisma was handed it. `MerchantBookingsQueryDto` binds
   * the whole query object, so a bad date is a 400 that names the field
   * instead of a 500 from the driver.
   */
  @Get()
  @UseGuards(RequireMerchantGuard)
  async listForMerchant(
    @Req() req: MerchantRequest,
    @Query() query: MerchantBookingsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.bookings.listForMerchant(
      req.merchantId,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
      query,
    );
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @Patch(':id/confirm')
  @UseGuards(RequireMerchantGuard)
  confirm(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.bookings.confirm(req.merchantId, id);
  }

  @Patch(':id/no-show')
  @UseGuards(RequireMerchantGuard)
  noShow(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.bookings.markNoShow(req.merchantId, id);
  }

  // Completing a booking auto-logs the visit and checks reward triggers —
  // see bookings.service.ts's complete() for the integration.
  @Patch(':id/complete')
  @UseGuards(RequireMerchantGuard)
  complete(@Req() req: MerchantRequest, @Param('id') id: string) {
    return this.bookings.complete(req.merchantId, req.accountId, id);
  }
}
