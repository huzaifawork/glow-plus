import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import * as express from 'express';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { OnboardingService } from './onboarding.service';
import { MerchantAuthService } from './merchant-auth.service';
import { AuthModule } from '../auth/auth.module';
// T83 — for GET /merchants/:id/capacity. No cycle: BookingsModule imports only
// RewardRulesModule, so nothing on that side reaches back here.
import { BookingsModule } from '../bookings/bookings.module';
import { MAX_LOGO_DATA_URL } from '../../common/limits';
import { withVersion } from '../../config/version';

@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, OnboardingService, MerchantAuthService],
  exports: [MerchantsService],
})
export class MerchantsModule implements NestModule {
  /**
   * M1 (W3) — a bigger JSON body limit, for the logo route ONLY.
   *
   * Express's default limit here is **100 kB**, and a 2 MB logo arrives as a
   * ~2.7 MB base64 data URL. Without this, every real upload dies as a bare
   * `PayloadTooLargeError` **before any handler or pipe runs** — so W3's
   * "clear error if the upload is rejected" would be impossible to satisfy on
   * exactly the uploads a salon owner is most likely to attempt, and the
   * carefully worded messages in `common/image.ts` would never be reached.
   *
   * **Scoped to one path and one method on purpose.** Raising the global limit
   * would make every route on the API — including the unauthenticated ones —
   * willing to buffer 3 MB per request, which is a memory-exhaustion lever
   * handed out for free. This is the same "mount the parser on exactly the
   * route that needs it" shape `billing.module.ts` uses for the Stripe
   * webhook's `express.raw()`, and it carries the same trap: the mount matches
   * the RAW url, so it needs the `/v1` prefix. Miss that and the middleware
   * silently never runs, the global 100 kB limit applies, and every upload
   * fails with an error nobody can explain.
   *
   * The ceiling is `MAX_LOGO_DATA_URL`, the same constant the DTO's
   * `@MaxLength` uses, plus nothing: a payload over it is refused either way,
   * and the DTO's version is the one that produces a sentence.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(express.json({ limit: MAX_LOGO_DATA_URL + 1024 }))
      .forRoutes({ path: withVersion('merchants/me/logo'), method: RequestMethod.PUT });
  }
}
