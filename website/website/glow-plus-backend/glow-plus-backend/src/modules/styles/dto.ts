import { IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';

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
  @IsString()
  @MinLength(1)
  name?: string;

  @IsInt()
  @Min(1)
  pointsPerVisit?: number;
}
