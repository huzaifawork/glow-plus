import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { StylesModule } from './modules/styles/styles.module';
import { VisitsModule } from './modules/visits/visits.module';
import { RewardRulesModule } from './modules/reward-rules/reward-rules.module';
import { RedemptionsModule } from './modules/redemptions/redemptions.module';
import { PointsModule } from './modules/points/points.module';
import { MeModule } from './modules/me/me.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { StaffModule } from './modules/staff/staff.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BusinessHoursModule } from './modules/business-hours/business-hours.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthMiddleware } from './middleware/auth.middleware';
import { GlobalRateLimitMiddleware } from './middleware/globalRateLimit.middleware';
import { throttlerOptions } from './common/throttling';
import { validateEnv } from './config/env.validation';
import { ApiThrottlerGuard } from './common/guards/api-throttler.guard';

@Module({
  imports: [
    // T27 — refuse to boot on a missing or placeholder secret rather than
    // falling back to one. Every secret in this codebase had a silent default,
    // and JWT_SECRET's was a constant published in the repo ([F20]).
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    // T26 [F3] — until now nothing in this API was rate limited at all.
    // See common/throttling.ts for the three tiers and why they differ.
    ThrottlerModule.forRoot(throttlerOptions),
    PrismaModule,
    HealthModule,
    AuthModule,
    MerchantsModule,
    StylesModule,
    VisitsModule,
    RewardRulesModule,
    RedemptionsModule,
    PointsModule,
    MeModule,
    BillingModule,
    AdminModule,
    StaffModule,
    BookingsModule,
    BusinessHoursModule,
    JobsModule,
  ],
  // Registered globally rather than per-controller: "API-wide" has to mean
  // every route, including ones added later by someone who never reads this
  // file. Exemptions are explicit, in throttling.ts.
  providers: [
    { provide: APP_GUARD, useClass: ApiThrottlerGuard },
    // Middleware is instantiated through the module injector, so it has to be
    // a provider here to receive the throttler's storage service.
    GlobalRateLimitMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // BEFORE AuthMiddleware, deliberately. Nest runs middleware in the order
    // it is applied and always ahead of guards, so this is the only place the
    // API-wide ceiling can see an anonymous request to a protected route —
    // AuthMiddleware would 401 it first and the guard would never count it.
    consumer.apply(GlobalRateLimitMiddleware).forRoutes('*');

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
        // Staff invite acceptance + staff login (T24). An invitee has no
        // account yet, so they cannot hold a token — these must be reachable
        // without one, exactly like merchants/login and admin/login.
        // Only the single-invite preview is public: GET /staff (the roster)
        // is owner-only and deliberately NOT matched by this pattern.
        { path: 'staff/login', method: RequestMethod.POST },
        { path: 'staff/accept-invite', method: RequestMethod.POST },
        { path: 'staff/invites/(.*)', method: RequestMethod.GET },
      )
      .forRoutes('*');

    // T29 [F30] — the subscription paywall used to be registered here as
    // RequireActiveSubscriptionMiddleware for 'styles/(.*)', 'visits/(.*)' and
    // 'reward-rules/(.*)'. It matched none of those real paths, so a SUSPENDED
    // merchant still read and wrote freely, and 'reward-rules' has no
    // controller at all. It is now RequireActiveSubscriptionGuard, applied with
    // @UseGuards on the actual routes — a guard cannot be aimed at a path that
    // doesn't exist.
  }
}

