import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Glow+ API listening on :${port}`);
}
bootstrap();
