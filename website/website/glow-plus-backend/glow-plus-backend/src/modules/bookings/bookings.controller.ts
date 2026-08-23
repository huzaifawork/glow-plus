import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { AvailabilityService } from './availability.service';
import { CreateBookingDto } from './dto';
import { AuthedRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireConsumerGuard } from '../../common/guards/require-consumer.guard';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly availability: AvailabilityService,
  ) {}

  // Public — browsing available times shouldn't require an account yet.
  @Get('availability')
  getAvailability(
    @Query('merchantId') merchantId: string,
    @Query('styleId') styleId: string,
    @Query('date') date: string,
  ) {
    return this.availability.getAvailableSlots(merchantId, styleId, date);
  }

  // Consumer — book an appointment.
  @Post()
  @UseGuards(RequireConsumerGuard)
  create(@Req() req: AuthedRequest, @Body() dto: CreateBookingDto) {
    return this.bookings.create(req.accountId!, dto);
  }

  // Consumer — their own upcoming/past bookings.
  @Get('me')
  @UseGuards(RequireConsumerGuard)
  mine(@Req() req: AuthedRequest) {
    return this.bookings.listForConsumer(req.accountId!);
  }

  // Either party can cancel — the service checks ownership based on role.
  @Patch(':id/cancel')
  cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    const role = req.accountRole === 'merchant_owner' || req.accountRole === 'merchant_staff' ? 'merchant' : 'consumer';
    const requesterId = role === 'merchant' ? req.merchantId! : req.accountId!;
    return this.bookings.cancel(requesterId, role, id);
  }

  // Merchant — their calendar, optionally filtered by date range.
  @Get()
  @UseGuards(RequireMerchantGuard)
  listForMerchant(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.bookings.listForMerchant(req.merchantId!, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Patch(':id/confirm')
  @UseGuards(RequireMerchantGuard)
  confirm(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.bookings.confirm(req.merchantId!, id);
  }

  @Patch(':id/no-show')
  @UseGuards(RequireMerchantGuard)
  noShow(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.bookings.markNoShow(req.merchantId!, id);
  }

  // Completing a booking auto-logs the visit and checks reward triggers —
  // see bookings.service.ts's complete() for the integration.
  @Patch(':id/complete')
  @UseGuards(RequireMerchantGuard)
  complete(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.bookings.complete(req.merchantId!, req.accountId!, id);
  }
}
