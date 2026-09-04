import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query for `GET /merchants/:merchantId/capacity`  (M1 — mobile spec R3.5)
 *
 * One optional field, and it still gets a DTO rather than a loose
 * `@Query('date') date?: string`, for the reason this codebase has now written
 * down three times [F38]: **a loose query param is validated by nothing.** This
 * route is PUBLIC, and the value reaches `salonWallTimeToInstant`, which does
 * `dateISO.split('-').map(Number)` — an unbounded string there is a 500 for
 * what is plainly a 400.
 *
 * The regex is shape only; whether "2026-02-31" is a real day is decided by
 * `isValidDateISO` in the service, so there is exactly one answer to "is this a
 * date" and it is the same one `GET /bookings/availability` gives.
 *
 * Absent means today, which is what every pre-M1 caller sent (nothing) and
 * what the website has been rendering since T83.
 */
export class CapacityQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;
}
