import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { MerchantsModule } from '../merchants/merchants.module';
import { AuthModule } from '../auth/auth.module';

/**
 * ⚠️ The operator's logo route needs a request body far larger than Nest's
 * 100 kB default, and that limit is NOT configured here any more.
 *
 * It used to be, through `NestModule.configure()`, and it never ran a single
 * time: `NestApplication.init()` registers its own `express.json()` BEFORE it
 * applies module middleware, so the global 100 kB parser answered 413 long
 * before this module's parser was reached. It now lives in
 * `config/body-limits.ts`, applied from `configureApp()` — which runs before
 * `init()` and therefore actually lands ahead of Nest's parser.
 *
 * Do not re-add a `configure()` here for it. It will look right and do
 * nothing, which is exactly how the logo feature stayed broken.
 */
@Module({
  imports: [MerchantsModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthService],
})
export class AdminModule {}
