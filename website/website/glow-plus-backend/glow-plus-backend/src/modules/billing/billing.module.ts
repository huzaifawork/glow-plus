import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
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
      .forRoutes({ path: 'billing/webhook', method: RequestMethod.POST });
  }
}
