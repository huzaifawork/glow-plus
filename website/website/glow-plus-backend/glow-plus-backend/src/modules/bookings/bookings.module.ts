import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AvailabilityService } from './availability.service';
import { RewardRulesModule } from '../reward-rules/reward-rules.module';
// M1 (R4.5) — for the push a customer gets when a salon confirms, cancels,
// completes or no-shows their booking. No cycle: DevicesModule imports nothing
// from here, and nothing else, which is what keeps 'who to tell' independent
// of 'what happened'.
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [RewardRulesModule, DevicesModule],
  controllers: [BookingsController],
  providers: [BookingsService, AvailabilityService],
  exports: [BookingsService, AvailabilityService],
})
export class BookingsModule {}
