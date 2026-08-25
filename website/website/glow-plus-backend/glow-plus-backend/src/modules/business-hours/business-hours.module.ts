import { Module } from '@nestjs/common';
import { BusinessHoursController, OwnBusinessHoursController } from './business-hours.controller';
import { BusinessHoursService } from './business-hours.service';

@Module({
  controllers: [BusinessHoursController, OwnBusinessHoursController],
  providers: [BusinessHoursService],
  exports: [BusinessHoursService],
})
export class BusinessHoursModule {}
