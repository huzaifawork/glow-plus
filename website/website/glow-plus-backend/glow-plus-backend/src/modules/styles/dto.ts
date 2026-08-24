import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_NAME } from '../../common/limits';

// A style is worth at most this many points per visit. Unbounded before
// (T31) — nothing stopped a merchant setting 2^31 points and every reward
// unlocking on one visit.
const MAX_POINTS_PER_VISIT = 10_000;

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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_POINTS_PER_VISIT)
  pointsPerVisit?: number;
}
