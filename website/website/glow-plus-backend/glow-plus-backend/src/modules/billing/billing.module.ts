import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { withVersion } from '../../config/version';
import * as express from 'express';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Stripe requires the raw, unparsed body to verify webhook signatures —
    // apply express.raw() only to this one route, before Nest's JSON parser
    // would otherwise consume it.
    consumer
      .apply(express.raw({ type: 'application/json' }))
      // T49 — express.raw() is mounted by raw URL, so it needs the /v1 prefix
      // too. Without it the parser never runs, req.rawBody is never set, and
      // every Stripe event fails constructEvent() with a 400 — the exact
      // failure mode [F19] already cost a session once.
      .forRoutes({ path: withVersion('billing/webhook'), method: RequestMethod.POST });
  }
}
