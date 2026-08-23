import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/; // "HH:mm", 24h

export class DayHoursDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number; // 0 = Sunday .. 6 = Saturday

  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'openTime must be in HH:mm 24h format' })
  openTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'closeTime must be in HH:mm 24h format' })
  closeTime?: string;
}

export class SetBusinessHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayHoursDto)
  days!: DayHoursDto[];
}
