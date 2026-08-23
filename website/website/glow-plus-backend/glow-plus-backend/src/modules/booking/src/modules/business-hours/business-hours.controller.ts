import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { BusinessHoursService } from './business-hours.service';
import { SetBusinessHoursDto } from './dto';
import { AuthedRequest } from '../../middleware/auth.middleware';

@Controller('business-hours')
export class BusinessHoursController {
  constructor(private readonly businessHours: BusinessHoursService) {}

  // Public — consumers need to see hours before booking, without logging in.
  @Get(':merchantId')
  get(@Param('merchantId') merchantId: string) {
    return this.businessHours.get(merchantId);
  }

  // Merchant-only — sets their own hours.
  @Put()
  set(@Req() req: AuthedRequest, @Body() dto: SetBusinessHoursDto) {
    return this.businessHours.set(req.merchantId!, dto);
  }
}
