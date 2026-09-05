import { INestApplication } from '@nestjs/common';
import * as express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { MAX_LOGO_DATA_URL } from '../common/limits';
import { withVersion } from './version';

/**
 * The raised request-body limit for logo uploads — and why it cannot live in
 * a module's `configure()`.
 *
 * ── The bug this fixes ────────────────────────────────────────────────────
 * `PUT /v1/merchants/me/logo` answered **413 on every real logo**. Both
 * `merchants.module.ts` and `admin.module.ts` mounted `express.json({ limit })`
 * on the logo route through `NestModule.configure()`, which reads correctly
 * and never ran. `NestApplication.init()` is explicit about the order:
 *
 *     registerParserMiddleware();   // ← Nest's own express.json(), 100 kB
 *     await registerModules();      // ← module configure() middleware
 *     await registerRouter();
 *
 * Nest's global parser is therefore **first in the Express stack**, so a
 * 2.7 MB base64 data URL was rejected by it before the module's parser was
 * ever reached. The mount was dead code that looked load-bearing — which is
 * why the logo feature had never worked for anyone, on any environment.
 *
 * ── Why it is applied here instead ────────────────────────────────────────
 * `configureApp()` runs **before** `app.init()` (see bootstrap.ts — neither
 * entry point calls `init()` until after it), so anything registered there
 * lands ahead of Nest's parser. Ours parses the logo routes; body-parser sets
 * `req._body`, and Nest's parser then sees that flag and skips. Every other
 * route on the API still meets Nest's 100 kB limit and nothing else changes.
 *
 * ⚠️ **The trap that makes this dangerous to "tidy".**
 * `express.json()` returns a function literally named `jsonParser`, and
 * `ExpressAdapter.registerParserMiddleware` skips its own registration when
 * `app._router.stack.some(layer => layer.handle.name === 'jsonParser')`. So
 * registering a bare `express.json()` here would make Nest register **no
 * global parser at all** — every other route on the API would silently
 * receive `req.body === undefined`, and every DTO would fail validation for
 * reasons no error message would explain.
 *
 * That is the entire reason for the named wrapper below. Do not replace
 * `glowPlusLogoBodyParser` with the bare parser, and do not rename it to
 * anything containing `jsonParser`. There is a test pinning both halves.
 */

/** The ceiling, matching the DTO's `@MaxLength` so a payload over it is
 *  refused by the pipe — which produces a sentence — rather than by the
 *  parser, which produces a bare 413 nobody can act on. */
export const LOGO_BODY_LIMIT = MAX_LOGO_DATA_URL + 1024;

/**
 * The routes that carry an image.
 *
 * ⚠️ These match the RAW url, so they carry the `/v1` prefix — the same trap
 * `billing.module.ts` documents for the Stripe webhook's `express.raw()`.
 * `withVersion` builds it so the prefix is never written out by hand.
 *
 * `app.use(path, …)` matches by prefix and ignores the method, which is fine
 * and deliberate: `DELETE` on the same path carries no body, and `GET
 * /merchants/:id/logo` is a different path shape entirely.
 */
export const LOGO_UPLOAD_PATHS = [
  `/${withVersion('merchants/me/logo')}`,
  `/${withVersion('admin/merchants/:id/logo')}`,
];

/**
 * Mount the raised limit on the logo routes only.
 *
 * Scoped rather than global on purpose. Raising Nest's limit would make every
 * route on the API — the unauthenticated ones included — willing to buffer
 * ~3 MB per request, which is a memory-exhaustion lever handed out for free.
 */
export function applyLogoBodyParser(app: Pick<INestApplication, 'use'>): void {
  const parseLogoBody = express.json({ limit: LOGO_BODY_LIMIT });

  // Named, and NOT `jsonParser` — see the warning above. The wrapper exists
  // solely so Nest still recognises that it has no parser of its own yet.
  app.use(
    LOGO_UPLOAD_PATHS,
    function glowPlusLogoBodyParser(req: Request, res: Response, next: NextFunction) {
      return parseLogoBody(req, res, next);
    },
  );
}
