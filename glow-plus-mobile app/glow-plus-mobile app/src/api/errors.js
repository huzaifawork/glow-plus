/**
 * The two kinds of failure a screen has to tell apart.
 *
 * NF4: *"The app must handle a lost or slow network connection gracefully,
 * with a clear message to the user rather than a silent failure or crash."*
 *
 * That requirement is impossible to meet if every failure arrives as the same
 * `Error`, because the honest message differs completely:
 *
 *   - the server answered and said no  → tell the user what it said
 *   - the request never arrived        → tell the user to check their signal,
 *                                        and offer Retry
 *
 * `fetch` collapses both into `TypeError: Network request failed`, so the
 * distinction has to be made at the one place that calls it — `client.js` —
 * and carried in the type.
 */

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /**
   * The session is gone: expired, revoked, or never valid.
   *
   * R1.6 — *"The app must detect when a stored session is no longer valid ...
   * and return the user to the login screen rather than continuing to show
   * stale data."* This is the predicate that drives that, and it lives on the
   * error rather than in each screen so no screen can forget it.
   */
  get isAuthFailure() {
    return this.status === 401;
  }
}

export class NetworkError extends Error {
  constructor(message = "Can't reach Glow+ right now. Check your connection and try again.") {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends NetworkError {
  constructor() {
    // Deliberately distinct wording from a plain network failure. "No
    // connection" and "the connection is slow" are different problems, and a
    // user on a train who is told the first will turn airplane mode on and off
    // for nothing.
    super('Glow+ is taking longer than usual to respond. Try again in a moment.');
    this.name = 'TimeoutError';
  }
}

/** One place that decides whether a Retry button is worth offering. */
export function isRetryable(error) {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) return error.status >= 500 || error.status === 429;
  return false;
}

/**
 * A sentence to put on the screen, for any thrown value.
 *
 * Never returns an empty string and never returns `[object Object]`. The
 * backend's exception filter guarantees `message` is a string (its T16), but
 * this app also has to survive a proxy, a captive portal, or a crash inside
 * `JSON.parse` — none of which have read that guarantee.
 */
export function messageFor(error) {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  if (typeof error.message === 'string' && error.message) return error.message;
  return 'Something went wrong.';
}
