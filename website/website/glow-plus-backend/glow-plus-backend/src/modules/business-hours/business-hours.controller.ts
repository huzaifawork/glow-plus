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

/**
 * The signed-in salon's own opening hours  [F52]
 *
 * A SEPARATE controller, on `/merchants/me/business-hours`, and the path is
 * the whole point. `app.module.ts` excludes `business-hours/(.*)` (GET) from
 * AuthMiddleware so the public lookup needs no token — which means ANY GET
 * route added under that prefix is silently unauthenticated. A
 * `/business-hours/me` was tried first and arrived with no `accountRole` at
 * all, so RequireMerchantGuard refused it 403 even with a valid merchant
 * token, and refused an anonymous caller with 403 rather than 401. The
 * exclusion pattern, not the guard, decides what is public here.
 *
 * It exists at all because the public route refuses a salon that is not
 * ACTIVE, and a PENDING salon must be able to see and set its hours while it
 * waits for approval [F54].
 */
@Controller('merchants/me')
export class OwnBusinessHoursController {
  constructor(private readonly businessHours: BusinessHoursService) {}

  @Get('business-hours')
  @UseGuards(RequireMerchantGuard)
  mine(@Req() req: MerchantRequest) {
    return this.businessHours.readOwn(req.merchantId);
  }
}
