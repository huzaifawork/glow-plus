import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * `?limit=` / `?offset=` for the authenticated list routes  (T50)
 *
 * **Why this lands before deployment rather than when a list gets long.**
 * Adding pagination to a route that already ships is a breaking change in
 * both directions: the body has to grow an envelope (or the total has to move
 * somewhere), and a client that used to receive everything silently starts
 * receiving a page. Doing it now costs nothing, because the only two clients
 * are ours and neither has shipped.
 *
 * **The body stays a bare array and the total rides on `X-Total-Count`** —
 * the same contract T43 and T44 set for the public routes, for the same
 * reason: `client.js:203` does `return request('/bookings/me')` and
 * `BookingsScreen` maps the result, so an `{ items, total }` envelope would
 * break Order 2 on the day it ships. One shape across every list route in the
 * API is also simply less to remember.
 *
 * `@Type(() => Number)` is load-bearing, exactly as T43 documented: a query
 * string is text, so without it `@IsInt()` is handed `'10'` and refuses every
 * request that uses the parameter at all.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * The page size when the caller does not ask for one.
 *
 * Deliberately larger than anything the website renders today, so nothing
 * changes visually and no view needs a paginator it did not have yesterday.
 * The point of T50 is the *contract*, not a UI feature: the ceiling exists so
 * a customer with four years of visits cannot make the API try to serialise
 * all of them into one response.
 */
export const DEFAULT_PAGE_SIZE = 100;
