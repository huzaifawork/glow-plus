import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto, CreateBookingDto } from './dto';
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
  @Get('me')
  @UseGuards(RequireConsumerGuard)
  mine(@Req() req: ConsumerRequest) {
    return this.bookings.listForConsumer(req.accountId);
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
  @Get()
  @UseGuards(RequireMerchantGuard)
  listForMerchant(@Req() req: MerchantRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.bookings.listForMerchant(req.merchantId, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
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
