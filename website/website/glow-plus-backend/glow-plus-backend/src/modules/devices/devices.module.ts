import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

/**
 * M1 (R4.5) — push-token registration, and the sender the booking flow calls.
 *
 * `DevicesService` is exported because `BookingsModule` imports this module to
 * announce status changes. The dependency points that way and not the other:
 * bookings know what happened, devices know who to tell, and a module that
 * only sends can never pull the booking rules into itself.
 */
@Module({
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
