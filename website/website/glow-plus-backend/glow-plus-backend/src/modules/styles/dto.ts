import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export enum StyleTypeDto {
  HAIR = 'HAIR',
  NAIL = 'NAIL',
  SPA = 'SPA',
  OTHER = 'OTHER',
}

export class CreateStyleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(StyleTypeDto)
  type!: StyleTypeDto;

  @IsInt()
  @Min(1)
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
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pointsPerVisit?: number;
}
