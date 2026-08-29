import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { OnboardingService } from './onboarding.service';
import { MerchantAuthService } from './merchant-auth.service';
import { AuthModule } from '../auth/auth.module';
// T83 — for GET /merchants/:id/capacity. No cycle: BookingsModule imports only
// RewardRulesModule, so nothing on that side reaches back here.
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, OnboardingService, MerchantAuthService],
  exports: [MerchantsService],
})
export class MerchantsModule {}