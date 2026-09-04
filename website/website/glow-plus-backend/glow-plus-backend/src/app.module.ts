import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
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
import { DevicesModule } from './modules/devices/devices.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { StaffModule } from './modules/staff/staff.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BusinessHoursModule } from './modules/business-hours/business-hours.module';
import { JobsModule } from './jobs/jobs.module';
import { CronModule } from './modules/cron/cron.module';
import { AuthMiddleware } from './middleware/auth.middleware';
import { withVersion } from './config/version';
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
    // T54 — ScheduleModule.forRoot() was here and is deliberately gone. It
    // registers in-process timers, which on Vercel are created and then frozen
    // with the container seconds later, so not one of the four jobs would ever
    // have run — silently, killing T19 and T25. They are now triggered over
    // HTTP by CronModule. Re-adding this would double-run every job anywhere a
    // long-running process does exist.
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
    // M1 (R4.5) — POST/DELETE /me/devices, so the platform can tell a customer
    // their booking was confirmed without them opening the app to look.
    DevicesModule,
    BillingModule,
    AdminModule,
    StaffModule,
    BookingsModule,
    BusinessHoursModule,
    JobsModule,
    CronModule,
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

    // T49 — these paths are matched against the RAW URL, which now carries the
    // /v1 prefix, so every entry has to be built with withVersion(). Middleware
    // runs at the Express layer and knows nothing about Nest's versioning: an
    // un-prefixed 'merchants' here silently stops matching /v1/merchants, and
    // the public salon directory starts demanding a bearer token.
    consumer
      .apply(AuthMiddleware)
      .exclude(
        // Deploy/uptime probes carry no bearer token; without this every
        // health check would 401 and read as "the API is down".
        //
        // T49 — these two are the ONLY entries here WITHOUT withVersion(), and
        // that is not an oversight: HealthController is VERSION_NEUTRAL, so it
        // is served at `/health`, not `/v1/health`. Prefixing the exclusion to
        // match the others made every uptime probe 401 — caught by probing the
        // route rather than by reading the diff, which is the entire reason
        // the T48 audit gets re-run after a change like this one.
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/(.*)', method: RequestMethod.GET },
        { path: withVersion('auth/(.*)'), method: RequestMethod.ALL },
        { path: withVersion('merchants/signup'), method: RequestMethod.POST },
        { path: withVersion('merchants/login'), method: RequestMethod.POST },
        { path: withVersion('admin/login'), method: RequestMethod.POST },
        { path: withVersion('billing/webhook'), method: RequestMethod.POST },
        // T54 — Vercel Cron. Excluded for a reason that is easy to miss and
        // fails silently: Vercel sends the CRON_SECRET as
        // `Authorization: Bearer <secret>`, the SAME header AuthMiddleware
        // reads. Without this entry the middleware tries to verify that secret
        // as a JWT, fails, and 401s the request before CronSecretGuard ever
        // runs — so every scheduled job stops, with the only symptom being a
        // 401 in a cron log nobody reads. This does NOT make the route public:
        // CronSecretGuard still has to match the secret.
        { path: withVersion('cron/(.*)'), method: RequestMethod.GET },
        // Public by design — a consumer browses times and opening hours
        // before creating an account. Both controllers document these as
        // public; AuthMiddleware throws 401 without a bearer token, so they
        // must be excluded here or they are not actually public.
        // GET only: PUT /business-hours (merchant-only) stays protected.
        { path: withVersion('bookings/availability'), method: RequestMethod.GET },
        { path: withVersion('business-hours/(.*)'), method: RequestMethod.GET },
        // Public salon directory + style list — a consumer picks a merchant
        // and a style before booking, both before creating an account.
        // GET only: the merchant-scoped GET /merchants/me and GET /styles
        // stay protected, and each path is listed exactly rather than as
        // 'merchants/(.*)' precisely so that stays true.
        // T43 moved the directory from 'merchants/public' to 'merchants' —
        // the path the RN app calls — and added the founding-spots counter,
        // which is on the landing page above the fold [F42].
        { path: withVersion('merchants'), method: RequestMethod.GET },
        { path: withVersion('merchants/founding-spots'), method: RequestMethod.GET },
        // T83 — "how busy is this salon", read before signing in, exactly like
        // the menu and the opening hours above. The pattern ends in
        // `/capacity` rather than being `merchants/(.*)`, so it still cannot
        // match `merchants/me` — the reason the list above is written out
        // path by path in the first place.
        { path: withVersion('merchants/(.*)/capacity'), method: RequestMethod.GET },
        // M1 (W5, R3.11) — a salon's logo, read by the app's directory, the
        // website's directory and anything else that renders a salon. Public
        // for the same reason the menu above it is: a consumer browsing has
        // no account yet, and an <Image> tag cannot send a bearer token.
        // Ends in '/logo' rather than being 'merchants/(.*)' so it still
        // cannot match 'merchants/me' — the reason this list is written out
        // path by path.
        { path: withVersion('merchants/(.*)/logo'), method: RequestMethod.GET },
        { path: withVersion('styles/public/(.*)'), method: RequestMethod.GET },
        // Staff invite acceptance + staff login (T24). An invitee has no
        // account yet, so they cannot hold a token — these must be reachable
        // without one, exactly like merchants/login and admin/login.
        // Only the single-invite preview is public: GET /staff (the roster)
        // is owner-only and deliberately NOT matched by this pattern.
        { path: withVersion('staff/login'), method: RequestMethod.POST },
        { path: withVersion('staff/accept-invite'), method: RequestMethod.POST },
        { path: withVersion('staff/invites/(.*)'), method: RequestMethod.GET },
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

