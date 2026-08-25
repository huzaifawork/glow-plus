import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_NAME } from '../../common/limits';

// A style is worth at most this many points per visit. Unbounded before
// (T31) — nothing stopped a merchant setting 2^31 points and every reward
// unlocking on one visit.
const MAX_POINTS_PER_VISIT = 10_000;

// How long an appointment for this style takes, in minutes. [F55] — this
// column drives real booking maths (`availability.service.ts` steps the day
// by it and uses it as the overlap window; `bookings.service.ts` derives
// `endTime` from it), but until now NO client could set it: it was absent
// from both DTOs and from the portal's form, so every style created through
// the API kept the schema default of 30 forever while the seeded salon's
// styles varied 45-90. A salon offering a 90-minute balayage was therefore
// offering it every 30 minutes and double-booking itself for an hour of each
// one. Same shape as [F52]: the column existed, nothing could reach it.
//
// The bounds are the booking layer's, not arbitrary: below the 15-minute slot
// granularity a style would occupy less than one step, and 8 hours is longer
// than any single opening-hours window we generate slots inside.
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 480;

export enum StyleTypeDto {
  HAIR = 'HAIR',
  NAIL = 'NAIL',
  SPA = 'SPA',
  OTHER = 'OTHER',
}

export class CreateStyleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @IsEnum(StyleTypeDto)
  type!: StyleTypeDto;

  @IsInt()
  @Min(1)
  @Max(MAX_POINTS_PER_VISIT)
  pointsPerVisit!: number;

  // Optional so the pre-[F55] request shape stays valid: the RN app and any
  // existing caller omit it and keep the 30-minute default they already got.
  @IsOptional()
  @IsInt()
  @Min(MIN_DURATION_MINUTES)
  @Max(MAX_DURATION_MINUTES)
  durationMinutes?: number;
}

export class UpdateStyleDto {
  // T29 — `?` is TypeScript's optionality, not class-validator's. Without
  // @IsOptional() every decorator ran against `undefined` and a PATCH sending
  // only `name` was refused with "pointsPerVisit must be an integer number":
  // the owner could not rename their own style, and the 400 arrived *before*
  // the ownership check, so it also masked what the audit was probing for.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name?: string;

  // Editable for the same reason the other three are: a salon that filed a
  // pedicure under HAIR had no way to correct it, and `type` is what the
  // public menu's category tag renders from.
  @IsOptional()
  @IsEnum(StyleTypeDto)
  type?: StyleTypeDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_POINTS_PER_VISIT)
  pointsPerVisit?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_DURATION_MINUTES)
  @Max(MAX_DURATION_MINUTES)
  durationMinutes?: number;
}
