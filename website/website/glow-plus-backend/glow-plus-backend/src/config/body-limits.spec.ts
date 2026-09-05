/**
 * The logo-upload body limit  — the fix for a live 413
 *
 * `PUT /v1/merchants/me/logo` answered **413 on every real logo**, in
 * production and everywhere else, for as long as the feature had existed. The
 * limit was mounted through `NestModule.configure()`, which reads correctly
 * and never ran: `NestApplication.init()` registers its own 100 kB
 * `express.json()` BEFORE it applies module middleware, so the global parser
 * was always first in the stack and always won.
 *
 * These tests drive **real HTTP through a real Express app**, because the
 * failure was entirely about middleware ORDER — a mock cannot have an order to
 * get wrong. Three things are pinned, and the third is the one that could take
 * the whole API down:
 *
 *   1. a body far over 100 kB reaches a logo route,
 *   2. the same body is still refused on every other route,
 *   3. Nest still registers its own global parser afterwards.
 *
 * (3) is not paranoia. `express.json()` returns a function literally named
 * `jsonParser`, and `ExpressAdapter.registerParserMiddleware` skips its own
 * registration when a layer with that name is already on the stack. Mounting a
 * bare `express.json()` here — the obvious "tidy-up" — would leave the API
 * with NO global body parser: every other route would receive
 * `req.body === undefined` and every DTO would fail validation, with no error
 * message anywhere explaining why.
 */
import express = require('express');
import type { NextFunction, Request, Response } from 'express';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { ExpressAdapter } from '@nestjs/platform-express';
import { applyLogoBodyParser, LOGO_BODY_LIMIT, LOGO_UPLOAD_PATHS } from './body-limits';
import { MAX_LOGO_DATA_URL } from '../common/limits';

/** Comfortably over Express's 100 kB default, comfortably under our own. */
const BIG_BODY = { image: 'x'.repeat(400_000) };

describe('applyLogoBodyParser', () => {
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    const app = express();

    // The production order, reproduced exactly: our scoped parser first (it is
    // applied in `configureApp`, before `init()`), then Nest's global 100 kB
    // parser (registered by `init()`), then the routes.
    applyLogoBodyParser(app as never);
    app.use(express.json());

    app.put('/v1/merchants/me/logo', (req: Request, res: Response) => {
      res.json({ ok: true, length: (req.body as { image?: string })?.image?.length ?? 0 });
    });
    app.put('/v1/admin/merchants/abc123/logo', (req: Request, res: Response) => {
      res.json({ ok: true, length: (req.body as { image?: string })?.image?.length ?? 0 });
    });
    app.post('/v1/auth/signup', (req: Request, res: Response) => {
      res.json({ ok: true, body: req.body });
    });

    // The 413 that body-parser throws is an error with `.status`; without a
    // handler Express answers 500 and the test would pass for the wrong reason.
    app.use((err: { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
      res.status(err?.status ?? 500).json({ statusCode: err?.status ?? 500 });
    });

    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  const put = (path: string, body: unknown, method = 'PUT') =>
    new Promise<{ status: number; json: Record<string, unknown> }>((resolve, reject) => {
      const payload = JSON.stringify(body);
      const r = http.request(
        `${base}${path}`,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let text = '';
          res.on('data', (d) => (text += d));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : {} }),
          );
        },
      );
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

  it('accepts a logo far larger than the 100 kB default  (the live 413)', async () => {
    const res = await put('/v1/merchants/me/logo', BIG_BODY);

    expect(res.status).toBe(200);
    expect(res.json.length).toBe(BIG_BODY.image.length);
  });

  it('accepts one on the admin override route too, `:id` and all', async () => {
    const res = await put('/v1/admin/merchants/abc123/logo', BIG_BODY);

    expect(res.status).toBe(200);
    expect(res.json.length).toBe(BIG_BODY.image.length);
  });

  /**
   * The scoping half. Raising the limit globally would make every route on the
   * API — the unauthenticated ones included — willing to buffer ~3 MB per
   * request, which is a memory-exhaustion lever handed out for free.
   */
  it('still refuses an oversized body on every other route', async () => {
    const res = await put('/v1/auth/signup', BIG_BODY, 'POST');

    expect(res.status).toBe(413);
  });

  it('still parses an ordinary body on every other route', async () => {
    const res = await put('/v1/auth/signup', { email: 'a@b.test' }, 'POST');

    expect(res.status).toBe(200);
    expect(res.json.body).toEqual({ email: 'a@b.test' });
  });
});

describe('the jsonParser naming trap', () => {
  /**
   * Reproduces Nest's own check against a real ExpressAdapter. If this fails,
   * Nest is registering NO global body parser and the entire API is broken in
   * a way no other test would notice.
   */
  it('leaves Nest free to register its own global parser', () => {
    const instance = express();
    const adapter = new ExpressAdapter(instance);

    applyLogoBodyParser(adapter as never);
    // Nest calls exactly this during init(), and it is a no-op if it believes
    // a parser is already mounted.
    adapter.registerParserMiddleware(undefined as never, false);

    const names = (instance as never as { _router: { stack: { handle: { name: string } }[] } })
      ._router.stack.map((layer) => layer.handle.name);

    expect(names).toContain('glowPlusLogoBodyParser');
    // The proof: Nest's own parser IS on the stack, after ours.
    expect(names).toContain('jsonParser');
    expect(names.indexOf('glowPlusLogoBodyParser')).toBeLessThan(names.indexOf('jsonParser'));
  });

  it('is named something Nest will not mistake for its own parser', () => {
    // The one-line version of the rule, so a rename fails here loudly.
    expect(applyLogoBodyParser.toString()).toContain('glowPlusLogoBodyParser');
    expect(express.json({}).name).toBe('jsonParser');
  });
});

describe('LOGO_UPLOAD_PATHS and LOGO_BODY_LIMIT', () => {
  it('carry the /v1 prefix, matching the raw url', () => {
    // Miss the prefix and the mount silently matches nothing — the same trap
    // billing.module.ts documents for the Stripe webhook.
    expect(LOGO_UPLOAD_PATHS).toEqual([
      '/v1/merchants/me/logo',
      '/v1/admin/merchants/:id/logo',
    ]);
  });

  it('leaves room above the DTO ceiling, so the pipe answers first', () => {
    // A payload over the limit should be refused by the DTO — which produces a
    // sentence a salon owner can act on — not by the parser, which produces a
    // bare 413.
    expect(LOGO_BODY_LIMIT).toBeGreaterThan(MAX_LOGO_DATA_URL);
  });
});
