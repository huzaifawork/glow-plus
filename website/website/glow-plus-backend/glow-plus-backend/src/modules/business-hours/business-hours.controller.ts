import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { BusinessHoursService } from './business-hours.service';
import { BusinessHoursParamDto, SetBusinessHoursDto } from './dto';
import { MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/require-active-subscription.guard';

@Controller('business-hours')
export class BusinessHoursController {
  constructor(private readonly businessHours: BusinessHoursService) {}

  // Public — consumers need to see hours before booking, without logging in.
  //
  // T48 — the param is bound as a DTO, not read loose off `@Param`. On an
  // unauthenticated route a bare param is validated by nothing [F38]. The
  // service also now refuses a salon that is not ACTIVE, matching
  // `GET /styles/public/:merchantId` [F47].
  @Get(':merchantId')
  get(@Param() params: BusinessHoursParamDto) {
    return this.businessHours.get(params.merchantId);
  }

  // Merchant-only — sets their own hours. Before T29 a consumer token reached
  // this handler and only failed on a Prisma error (a bare 500, not a refusal).
  @Put()
  @UseGuards(RequireMerchantGuard, RequireActiveSubscriptionGuard)
  set(@Req() req: MerchantRequest, @Body() dto: SetBusinessHoursDto) {
    return this.businessHours.set(req.merchantId, dto);
  }
}
