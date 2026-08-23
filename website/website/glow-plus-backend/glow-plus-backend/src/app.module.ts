import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { StylesModule } from './modules/styles/styles.module';
import { VisitsModule } from './modules/visits/visits.module';
import { RewardRulesModule } from './modules/reward-rules/reward-rules.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthMiddleware } from './middleware/auth.middleware';
import { RequireActiveSubscriptionMiddleware } from './middleware/requireActiveSubscription';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MerchantsModule,
    StylesModule,
    VisitsModule,
    RewardRulesModule,
    BillingModule,
    AdminModule,
    JobsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        { path: 'auth/(.*)', method: RequestMethod.ALL },
        { path: 'merchants/signup', method: RequestMethod.POST },
        { path: 'merchants/login', method: RequestMethod.POST },   
        { path: 'billing/webhook', method: RequestMethod.POST },
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

