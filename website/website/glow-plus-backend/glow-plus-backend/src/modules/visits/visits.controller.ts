import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { LogVisitDto } from './dto';
import { ConsumerRequest, MerchantRequest } from '../../middleware/auth.middleware';
import { RequireMerchantGuard } from '../../common/guards/require-merchant.guard';
import { RequireConsumerGuard } from '../../common/guards/require-consumer.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/require-active-subscription.guard';

// T29 — the merchant routes here are merchant-scoped. GET /visits with a
// consumer token used to return 200 and every merchant's visit rows [F29].
//
// Guards moved from the controller onto each route by T45, for the same reason
// styles.controller.ts already does it: Nest *merges* controller- and
// handler-level guards, so a controller-wide `@UseGuards(RequireMerchantGuard,
// …)` cannot be opted out of — and GET /visits/me is the consumer's own
// history, the exact opposite role. Order matters and is the same everywhere:
// the merchant guard establishes req.merchantId, then the subscription guard
// reads it.
const MERCHANT = [RequireMerchantGuard, RequireActiveSubscriptionGuard];

@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  @UseGuards(...MERCHANT)
  list(@Req() req: MerchantRequest) {
    return this.visits.list(req.merchantId);
  }

  /**
   * The consumer's own visit history across every salon (T45).
   *
   * Deliberately NOT behind RequireActiveSubscriptionGuard: that paywall is
   * about the *merchant's* subscription, and a customer must not lose sight of
   * the visits they already earned because a salon's card was declined.
   */
  @Get('me')
  @UseGuards(RequireConsumerGuard)
  mine(@Req() req: ConsumerRequest) {
    return this.visits.listForConsumer(req.accountId);
  }

  @Post()
  @UseGuards(...MERCHANT)
  log(@Req() req: MerchantRequest, @Body() dto: LogVisitDto) {
    return this.visits.logVisit(req.merchantId, req.accountId, dto);
  }
}
