import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { LogVisitDto } from './dto';
import { MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/require-active-subscription.guard';

// T29 — both routes are merchant-scoped. GET /visits with a consumer token
// used to return 200 and every merchant's visit rows [F29].
@Controller('visits')
@UseGuards(RequireMerchantGuard, RequireActiveSubscriptionGuard)
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  list(@Req() req: MerchantRequest) {
    return this.visits.list(req.merchantId);
  }

  @Post()
  log(@Req() req: MerchantRequest, @Body() dto: LogVisitDto) {
    return this.visits.logVisit(req.merchantId, req.accountId, dto);
  }
}
