import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Express } from 'express';
import { createApp } from './bootstrap';

/**
 * T56 — the Vercel entry point.
 *
 * **Serverless is a different execution model, and two things about it drive
 * this whole file.**
 *
 * 1. Nothing listens. Vercel routes a request straight into an exported
 *    handler, so `app.listen()` is not merely unnecessary, it is wrong — it
 *    would bind a port nothing routes to and hold the invocation open.
 *    `app.init()` is the half of `listen()` that actually matters: it builds
 *    the DI container, resolves every provider and applies middleware.
 *
 * 2. The process is reused, but only sometimes. Vercel keeps a warm container
 *    around after an invocation and may route the next request into it —
 *    "may", not "will". So module scope survives *some* requests and not
 *    others, and the only safe design is one that is correct either way.
 *
 * **Why a cached PROMISE rather than a cached app.** Bootstrapping Nest means
 * building the entire DI graph and connecting Prisma; on a cold start that is
 * comfortably the most expensive thing the function does, and TASKS.md flags
 * that it can exceed the invocation timeout outright. Caching is therefore not
 * an optimisation, it is what keeps the endpoint inside its budget.
 *
 * But caching the resolved app would not be enough. A cold container can be
 * handed several concurrent requests before the first bootstrap finishes; if
 * each checks "is the app ready yet?" and finds `undefined`, each starts its
 * own bootstrap, and now several Nest instances race to open their own Prisma
 * pools against a database whose pooled connection limit is deliberately
 * `connection_limit=1` (T52). Storing the *promise* on the very first call
 * means every later caller awaits the same in-flight bootstrap instead of
 * starting a second one. This is the single most important line in the file.
 */
let handlerPromise: Promise<Express> | undefined;

async function buildHandler(): Promise<Express> {
  const app = await createApp();

  // init(), not listen(). See the header comment.
  await app.init();

  // Nest's Express adapter wraps a real Express instance, and an Express
  // instance IS a (req, res) function — which is exactly the shape Vercel's
  // Node runtime invokes. So the app can be handed over directly, with no
  // Lambda-event translation layer in between.
  //
  // This is deliberately NOT @codegenie/serverless-express or @vendia's
  // predecessor: those exist to convert an AWS API Gateway *event object* into
  // something Express understands. Vercel already gives us Node's own
  // IncomingMessage/ServerResponse, so that translation would mean encoding
  // the request into a Lambda event and immediately decoding it again — a
  // round trip whose only real effect would be another chance to mangle the
  // Stripe webhook's raw bytes (T57).
  return app.getHttpAdapter().getInstance() as Express;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    if (!handlerPromise) {
      handlerPromise = buildHandler();
    }
    const express = await handlerPromise;
    express(req as never, res as never);
  } catch (err) {
    // If bootstrap itself failed, the cached promise is a REJECTED one and
    // every subsequent request in this warm container would replay the same
    // failure forever without ever retrying. Clearing it means the next
    // request gets a fresh attempt — which matters because the most likely
    // bootstrap failures here are transient: the T27/T31b env-var guards
    // throwing on a missing secret, or Prisma failing to reach Supabase.
    handlerPromise = undefined;

    // eslint-disable-next-line no-console
    console.error('Glow+ API failed to bootstrap:', err);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      // Same envelope shape as AllExceptionsFilter, because a client cannot
      // tell that this particular failure happened before Nest existed.
      res.end(
        JSON.stringify({
          statusCode: 500,
          message: 'The API failed to start.',
          error: 'Internal Server Error',
        }),
      );
    }
  }
}
