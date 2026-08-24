import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * One error envelope for the whole API  (T16)
 *
 * Every failure leaves the API as:
 *
 *   { statusCode: number, message: string, error: string, details?: string[] }
 *
 * `message` is ALWAYS a string and `error` is ALWAYS present. Before this
 * filter neither was true:
 *
 *   - Validation failures returned `message` as an ARRAY. The React Native
 *     client does `throw new Error(body.message || ...)` (client.js:25), so an
 *     array reached the user comma-joined by Error's own stringification —
 *     working by accident, and impossible to render as one clean message.
 *   - Any non-HttpException (a Prisma failure, a bug) returned
 *     `{"statusCode":500,"message":"Internal server error"}` with NO `error`
 *     key at all. Verified live against a stopped database.
 *
 * All validation messages are still returned, in `details` — nothing is lost,
 * it just moved to a field whose type doesn't change per response.
 */

// Prisma error codes are Pnnnn. Matching the shape rather than importing
// Prisma's error classes keeps this filter free of a Prisma import (it must
// still work if the client is regenerated or swapped) and catches errors that
// crossed a module boundary and lost their prototype.
const PRISMA_CODE = /^P\d{4}$/;

interface MappedError {
  status: number;
  message: string;
  details?: string[];
}

/**
 * Turn a Prisma error into an HTTP answer. Without this a duplicate email or
 * a missing row surfaces as a blank 500, which tells a client nothing and
 * looks to the user like the service broke.
 */
function mapPrismaError(code: string, meta: unknown): MappedError | null {
  const target = (meta as { target?: string[] })?.target;

  switch (code) {
    case 'P2002': // unique constraint violation
      return {
        status: HttpStatus.CONFLICT,
        message: 'A record with these details already exists',
        details: Array.isArray(target) ? target.map((f) => `${f} is already taken`) : undefined,
      };
    case 'P2025': // required record not found
      return { status: HttpStatus.NOT_FOUND, message: 'The requested record was not found' };
    case 'P2003': // foreign key constraint failed
      return { status: HttpStatus.BAD_REQUEST, message: 'A referenced record does not exist' };
    case 'P2014': // relation violation
      return { status: HttpStatus.BAD_REQUEST, message: 'That change would break a required relation' };
    case 'P1001': // can't reach database server
    case 'P1002': // database server timeout
    case 'P1008': // operation timed out
      // 503, not 500: this is transient and a client may retry. Matches what
      // GET /health/ready reports for the same condition (T15).
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'The service is temporarily unavailable' };
    default:
      return null;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, message, details, error } = this.normalize(exception);

    // 5xx means we broke, so keep the stack. 4xx is the client being told no —
    // expected traffic, and logging every 401 at error level buries real faults.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${req.method} ${req.originalUrl} -> ${status} ${message}`);
    }

    res.status(status).json({
      statusCode: status,
      message,
      error,
      ...(details?.length ? { details } : {}),
    });
  }

  private normalize(exception: unknown): MappedError & { error: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return { status, message: body, error: reasonPhrase(status) };
      }

      const obj = body as { message?: unknown; error?: unknown };
      const raw = obj.message;

      // ValidationPipe hands us string[]. Promote the first to `message` so a
      // client always has one sentence to show, and keep the full list in
      // `details` so nothing is hidden.
      if (Array.isArray(raw)) {
        const list = raw.map(String);
        return {
          status,
          message: list[0] ?? reasonPhrase(status),
          details: list,
          error: typeof obj.error === 'string' ? obj.error : reasonPhrase(status),
        };
      }

      return {
        status,
        message: typeof raw === 'string' ? raw : exception.message || reasonPhrase(status),
        error: typeof obj.error === 'string' ? obj.error : reasonPhrase(status),
      };
    }

    // body-parser's errors (T31). These are plain Errors carrying an HTTP
    // `status`, NOT HttpExceptions, so they fell through to a blank 500 —
    // verified live: a 500KB body to POST /auth/login answered
    // `{"statusCode":500,"message":"Internal server error"}`. The limit
    // itself was working; only the reporting was wrong, which is the worst
    // combination, because a client is told to retry something that will
    // never succeed. A 413 says "smaller", a 400 says "malformed", and both
    // are the caller's to fix.
    const bodyParserError = asBodyParserError(exception);
    if (bodyParserError) return bodyParserError;

    const code = (exception as { code?: unknown })?.code;
    if (typeof code === 'string' && PRISMA_CODE.test(code)) {
      const mapped = mapPrismaError(code, (exception as { meta?: unknown }).meta);
      if (mapped) {
        return { ...mapped, error: reasonPhrase(mapped.status) };
      }
      // A Prisma code we haven't mapped is still our bug, not the client's.
      // Fall through to the generic 500 so the raw driver message — which can
      // contain table names, the connection host, and query fragments — is
      // logged but never returned.
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
    };
  }
}

/**
 * Recognise the errors express's body parser throws  (T31)
 *
 * They are `Error`s with an HTTP `status`/`statusCode` and a `type` such as
 * `entity.too.large` or `entity.parse.failed` — not `HttpException`s, so
 * without this they reached the generic 500 branch below.
 *
 * The status is taken from the error rather than hardcoded so a parser error
 * this list doesn't name still reports its own status instead of a 500. The
 * message is ours, never the parser's: body-parser's text includes the
 * configured byte limit, and there is no reason to publish that.
 */
function asBodyParserError(exception: unknown): (MappedError & { error: string }) | null {
  const err = exception as { type?: unknown; status?: unknown; statusCode?: unknown; expose?: unknown };
  if (typeof err?.type !== 'string') return null;

  const status = typeof err.status === 'number' ? err.status : typeof err.statusCode === 'number' ? err.statusCode : null;
  if (status === null || status < 400 || status > 599) return null;

  const messages: Record<string, string> = {
    'entity.too.large': 'Request body is too large',
    'entity.parse.failed': 'Request body is not valid JSON',
    'entity.verify.failed': 'Request body could not be verified',
    'request.aborted': 'The request was aborted',
    'request.size.invalid': 'Request body size did not match the Content-Length header',
    'parameters.too.many': 'Too many parameters in the request body',
    'charset.unsupported': 'Unsupported charset in the request body',
    'encoding.unsupported': 'Unsupported content encoding in the request body',
  };

  const message = messages[err.type];
  if (!message) return null;

  return { status, message, error: reasonPhrase(status) };
}

/**
 * The `error` field is the status' reason phrase — the same value Nest's own
 * HttpException subclasses put there ("Unauthorized", "Bad Request"), so
 * existing clients see no change in the cases that already worked.
 */
function reasonPhrase(status: number): string {
  const known: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    410: 'Gone',
    413: 'Payload Too Large',
    415: 'Unsupported Media Type',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return known[status] ?? (status >= 500 ? 'Internal Server Error' : 'Error');
}
