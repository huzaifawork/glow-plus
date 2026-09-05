import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import * as express from 'express';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { MerchantsModule } from '../merchants/merchants.module';
import { AuthModule } from '../auth/auth.module';
import { MAX_LOGO_DATA_URL } from '../../common/limits';
import { withVersion } from '../../config/version';

@Module({
  imports: [MerchantsModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthService],
})
export class AdminModule implements NestModule {
  /**
   * M2 — the raised JSON body limit for the operator's logo-upload route.
   *
   * The same mount, for the same reason, as the one `merchants.module.ts`
   * documents at length: Express's default limit here is 100 kB, a 2 MB logo
   * arrives as a ~2.7 MB base64 data URL, and without this every real upload
   * dies as a bare `PayloadTooLargeError` **before any handler or pipe runs** —
   * so the carefully worded messages in `common/image.ts` are never reached
   * and an operator sees an error nobody can explain.
   *
   * Scoped to the one path and the one method, deliberately. Raising the
   * global limit would make every route on the API — the unauthenticated ones
   * included — willing to buffer 3 MB per request.
   *
   * ⚠️ The mount matches the RAW url, so it carries the `/v1` prefix, and the
   * `:id` is an Express route parameter rather than a literal.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(express.json({ limit: MAX_LOGO_DATA_URL + 1024 }))
      .forRoutes({ path: withVersion('admin/merchants/:id/logo'), method: RequestMethod.PUT });
  }
}
