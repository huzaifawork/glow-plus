import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { buildCorsOptions, buildHelmetOptions, resolveAllowedOrigins } from './config/security';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Stripe webhooks need the raw request body to verify signatures.
    // billing.module.ts applies express.raw() to the webhook route, but that
    // is not enough on its own: Nest's global JSON body parser runs first and
    // consumes the stream, so express.raw() no-ops and req.rawBody is never
    // set — every event then fails constructEvent() with a 400. This flag
    // makes Nest retain the untouched bytes on req.rawBody, which is what
    // billing.controller.ts reads.
    rawBody: true,
  });

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

  // T28 — see config/security.ts.
  app.enableCors(buildCorsOptions());

  const { origins, usedFallback } = resolveAllowedOrigins();
  if (usedFallback) {
    // Not silent, deliberately: the old fallback lived inline in enableCors()
    // and announced nothing, so "why does the browser say CORS?" and "why is
    // localhost trusted?" both had to be answered by reading this file.
    // eslint-disable-next-line no-console
    console.warn(
      `⚠  ALLOWED_ORIGINS is not set — falling back to ${origins.join(', ')} (development only).`,
    );
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Glow+ API listening on :${port}`);
}
bootstrap();
