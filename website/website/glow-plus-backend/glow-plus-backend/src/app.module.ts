import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { StylesModule } from './modules/styles/styles.module';
import { VisitsModule } from './modules/visits/visits.module';
import { RewardRulesModule } from './modules/reward-rules/reward-rules.module';
import { RedemptionsModule } from './modules/redemptions/redemptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BusinessHoursModule } from './modules/business-hours/business-hours.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthMiddleware } from './middleware/auth.middleware';
import { RequireActiveSubscriptionMiddleware } from './middleware/requireActiveSubscription';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    MerchantsModule,
    StylesModule,
    VisitsModule,
    RewardRulesModule,
    RedemptionsModule,
    BillingModule,
    AdminModule,
    BookingsModule,
    BusinessHoursModule,
    JobsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        // Deploy/uptime probes carry no bearer token; without this every
        // health check would 401 and read as "the API is down".
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/(.*)', method: RequestMethod.GET },
        { path: 'auth/(.*)', method: RequestMethod.ALL },
        { path: 'merchants/signup', method: RequestMethod.POST },
        { path: 'merchants/login', method: RequestMethod.POST },
        { path: 'admin/login', method: RequestMethod.POST },
        { path: 'billing/webhook', method: RequestMethod.POST },
        // Public by design — a consumer browses times and opening hours
        // before creating an account. Both controllers document these as
        // public; AuthMiddleware throws 401 without a bearer token, so they
        // must be excluded here or they are not actually public.
        // GET only: PUT /business-hours (merchant-only) stays protected.
        { path: 'bookings/availability', method: RequestMethod.GET },
        { path: 'business-hours/(.*)', method: RequestMethod.GET },
        // Public salon directory + style list (T18, pulled forward from
        // T43/T44) — a consumer picks a merchant and a style before booking,
        // both before creating an account. GET only: the merchant-scoped
        // GET /merchants/me and GET /styles stay protected.
        { path: 'merchants/public', method: RequestMethod.GET },
        { path: 'styles/public/(.*)', method: RequestMethod.GET },
      )
      .forRoutes('*');

    consumer
      .apply(RequireActiveSubscriptionMiddleware)
      .forRoutes(
        { path: 'styles/(.*)', method: RequestMethod.ALL },
        { path: 'visits/(.*)', method: RequestMethod.ALL },
        { path: 'reward-rules/(.*)', method: RequestMethod.ALL },
      );
  }
}

