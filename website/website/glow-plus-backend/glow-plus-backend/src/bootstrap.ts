import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { buildCorsOptions, buildHelmetOptions, resolveAllowedOrigins } from './config/security';
import { API_VERSION } from './config/version';

/**
 * T56 — the application's configuration, extracted from `main.ts`.
 *
 * **Why this file exists.** There are now TWO entry points into the same app:
 * `main.ts`, which listens on a port for local development, and
 * `serverless.ts`, which hands Vercel a request handler and never listens at
 * all. Before this split, every `app.use`/`useGlobalPipes` call lived in
 * `main.ts` — so a serverless entry point would have had to copy them.
 *
 * That copy is the failure mode worth naming: the two would drift, and the
 * drift would be **silent and security-shaped**. Add a global guard in one and
 * forget the other and production runs unguarded while every local test and the
 * whole Jest suite keeps passing, because none of them go through the
 * serverless path. `helmet`, the CORS allow-list, the exception filter and the
 * `whitelist: true` ValidationPipe are all configured here precisely because
 * each is load-bearing for security, and none may exist in only one entry
 * point. One function, both callers, no second list to forget.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    // Stripe webhooks need the raw request body to verify signatures.
    // billing.module.ts applies express.raw() to the webhook route, but that
    // is not enough on its own: Nest's global JSON body parser runs first and
    // consumes the stream, so express.raw() no-ops and req.rawBody is never
    // set — every event then fails constructEvent() with a 400. This flag
    // makes Nest retain the untouched bytes on req.rawBody, which is what
    // billing.controller.ts reads.
    //
    // ⚠️ T57 — this is necessary on Vercel but NOT proven sufficient. The
    // platform's Node runtime may consume the request stream before Express
    // ever sees it, which would leave req.rawBody empty in production while
    // local `stripe listen` keeps passing. That is T57's job to verify against
    // the deployed endpoint; do not assume it works because it works locally.
    rawBody: true,
  });

  configureApp(app);
  return app;
}

/**
 * Everything applied to the Nest app after creation. Split out from
 * `createApp` so a test can build an app its own way and still get the exact
 * production configuration applied to it.
 *
 * ⚠️ Order matters here and is not incidental — see the comments inline.
 */
export function configureApp(app: INestApplication): void {
  // T28 — security headers, applied FIRST so they are also on responses that
  // never reach a controller: a 401 from AuthMiddleware, a 429 from
  // GlobalRateLimitMiddleware, a 404. Anything registered after those would
  // leave exactly the error responses an attacker generates most unprotected.
  app.use(helmet(buildHelmetOptions()));

  // Express advertises itself on every response. helmet's hidePoweredBy
  // removes the header after the fact; disabling it at the adapter means it is
  // never set at all, which also covers responses helmet does not touch.
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // One error envelope for every failure: { statusCode, message, error }.
  // `message` is always a string — ValidationPipe's array moves to `details`,
  // because the RN client renders body.message directly (client.js:25).
  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // T49 — every route moves under /v1. `defaultVersion` means no controller
  // needs a `version:` of its own; the one route that opts OUT is /health,
  // which declares VERSION_NEUTRAL because uptime probes must not 404 the day
  // the API goes to /v2. See config/version.ts for why this is not
  // dual-served alongside the unversioned paths.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });

  // T28 — see config/security.ts.
  app.enableCors(buildCorsOptions());

  const { origins, usedFallback } = resolveAllowedOrigins();
  if (usedFallback) {
    // Not silent, deliberately: the old fallback lived inline in enableCors()
    // and announced nothing, so "why does the browser say CORS?" and "why is
    // localhost trusted?" both had to be answered by reading this file.
    //
    // On Vercel this warning is the single loudest symptom of T59 being
    // incomplete: it means ALLOWED_ORIGINS was never set as an env var, and
    // the deployed API is trusting localhost and nothing else — so the real
    // website gets a CORS error on every call.
    // eslint-disable-next-line no-console
    console.warn(
      `⚠  ALLOWED_ORIGINS is not set — falling back to ${origins.join(', ')} (development only).`,
    );
  }
}
