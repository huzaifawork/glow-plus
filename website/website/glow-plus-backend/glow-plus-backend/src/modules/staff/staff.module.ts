import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffAuthService } from './staff-auth.service';
import { StaffController } from './staff.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [StaffController],
  providers: [StaffService, StaffAuthService],
})
export class StaffModule {}
