import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PaginationQueryDto } from '../../common/pagination.dto';
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
  @Get()
  @UseGuards(...MERCHANT)
  async list(
    @Req() req: MerchantRequest,
    @Query() query: PaginationQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.visits.list(req.merchantId, query);
    res.setHeader('X-Total-Count', String(total));
    return items;
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
  async mine(
    @Req() req: ConsumerRequest,
    @Query() query: PaginationQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.visits.listForConsumer(req.accountId, query);
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @Post()
  @UseGuards(...MERCHANT)
  log(@Req() req: MerchantRequest, @Body() dto: LogVisitDto) {
    return this.visits.logVisit(req.merchantId, req.accountId, dto);
  }
}
