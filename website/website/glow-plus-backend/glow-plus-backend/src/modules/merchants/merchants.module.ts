import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { OnboardingService } from './onboarding.service';
import { MerchantAuthService } from './merchant-auth.service';
import { AuthModule } from '../auth/auth.module';
// T83 — for GET /merchants/:id/capacity. No cycle: BookingsModule imports only
// RewardRulesModule, so nothing on that side reaches back here.
import { BookingsModule } from '../bookings/bookings.module';

/**
 * ⚠️ The logo route needs a request body far larger than Nest's 100 kB
 * default, and that limit is NOT configured here any more.
 *
 * It used to be, through `NestModule.configure()`, and **it never ran** —
 * which is why `PUT /merchants/me/logo` answered 413 on every real logo, on
 * every environment, for as long as the feature has existed.
 * `NestApplication.init()` registers its own `express.json()` BEFORE it
 * applies module middleware:
 *
 *     registerParserMiddleware();   // ← Nest's express.json(), 100 kB
 *     await registerModules();      // ← module configure() middleware
 *
 * So the global parser was always first in the stack and always won. The
 * limit now lives in `config/body-limits.ts`, applied from `configureApp()`,
 * which runs before `init()` and therefore actually lands ahead of it.
 *
 * Do not re-add a `configure()` here for it. It will read correctly and do
 * nothing.
 */
@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, OnboardingService, MerchantAuthService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
