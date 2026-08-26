import 'reflect-metadata';
import { createApp } from './bootstrap';

/**
 * Local / long-running entry point — `npm run start:dev`, `npm run start:prod`,
 * and any container that runs a real Node process.
 *
 * T56 moved the configuration out to `bootstrap.ts` so the serverless entry
 * point (`serverless.ts`) applies exactly the same setup. The ONLY thing that
 * belongs in this file is the part that is genuinely specific to owning a
 * port — because on Vercel nothing listens, and `app.listen()` there would
 * bind a port the platform never routes to and then hold the function open.
 */
async function bootstrap() {
  const app = await createApp();

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Glow+ API listening on :${port}`);
}

bootstrap();
