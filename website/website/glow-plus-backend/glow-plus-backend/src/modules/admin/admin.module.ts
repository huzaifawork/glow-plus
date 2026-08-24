import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { MerchantsModule } from '../merchants/merchants.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MerchantsModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthService],
})
export class AdminModule {}
