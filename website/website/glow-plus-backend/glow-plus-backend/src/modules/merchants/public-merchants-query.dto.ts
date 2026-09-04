import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_CITY, MAX_NAME } from '../../common/limits';

/** Page size when the caller doesn't ask for one. Comfortably above the
 *  number of salons a landing page renders, so the website and the RN app
 *  both get the whole directory without paginating on day one. */
export const DEFAULT_MERCHANT_PAGE = 50;

/** Ceiling on `limit`. Without one, `?limit=1000000` is a free way to make
 *  the server build an unbounded response for an unauthenticated caller. */
export const MAX_MERCHANT_PAGE = 100;

/**
 * Query for `GET /merchants`  (T43)
 *
 * Bound as a whole DTO object rather than loose `@Query('x')` params — a
 * loose query param is not validated at all [F38], and `?limit=abc` reaching
 * Prisma's `take` is a 500 for what is plainly a 400.
 *
 * `@Type(() => Number)` is load-bearing: query strings are always strings, so
 * without the transform `@IsInt()` refuses every `limit` that was ever sent,
 * including valid ones. (ValidationPipe runs with `transform: true`, which is
 * what makes the decorator work — see main.ts.)
 */
export class PublicMerchantsQueryDto {
  /** Case-insensitive substring match on the business name. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  q?: string;

  /**
   * M1 (R3.10) — exact city, for the app's city filter.
   *
   * Separate from `q` on purpose. `q` is a fuzzy box a user types into and it
   * matches the name OR the city; this is a value the user PICKED from a list
   * the server itself produced, so a substring match would make "York" also
   * return "New York". The two combine by AND, which is what makes "search
   * 'nails' within Toronto" expressible.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CITY)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MERCHANT_PAGE)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
