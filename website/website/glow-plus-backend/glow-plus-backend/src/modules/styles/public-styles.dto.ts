import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_ID } from '../../common/limits';

/** Page size when the caller doesn't ask for one. A salon *menu* is small —
 *  the seed has 3 and a large salon has a few dozen — so this is far above
 *  what any real merchant offers and both clients get the whole list without
 *  ever paginating. */
export const DEFAULT_STYLE_PAGE = 100;

/** Ceiling on `limit`, so `?limit=1000000` isn't a free way to make the
 *  server build an unbounded response for an unauthenticated caller. */
export const MAX_STYLE_PAGE = 200;

/**
 * Path param for `GET /styles/public/:merchantId`  (T44)
 *
 * Bound as a DTO object rather than a bare `@Param('merchantId')` string
 * because a loose param is not validated at all [F38] — the same gap T43
 * closed on the query side. Before this, a 5,000-character id went straight
 * into `merchant.findUnique()` on an **unauthenticated** route and came back
 * 404 only after a database round trip. Nothing that long can be a cuid, so
 * the honest answer is 400, decided in the pipe and never reaching Prisma.
 *
 * Deliberately a length bound and not a cuid regex: ids are `@default(cuid())`
 * today, but pinning the *format* here would make a future id scheme fail as
 * a validation error on a public route rather than as a clean 404.
 */
export class PublicStylesParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  merchantId!: string;
}

/**
 * Query for `GET /styles/public/:merchantId`  (T44)
 *
 * Same shape and the same reasoning as T43's `PublicMerchantsQueryDto` — see
 * that file for why `@Type(() => Number)` is load-bearing. No `?q=`: a menu
 * is short enough to scan, and neither client has a search box for it.
 */
export class PublicStylesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_STYLE_PAGE)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
