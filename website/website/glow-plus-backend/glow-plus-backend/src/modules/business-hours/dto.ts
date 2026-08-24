import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { MAX_ID } from '../../common/limits';
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

/**
 * The `:merchantId` on `GET /business-hours/:merchantId`  (T48) [F38]
 *
 * A bare `@Param('merchantId') merchantId: string` is validated by nothing —
 * ValidationPipe only runs against a class. That route is **unauthenticated**,
 * so until this existed a 5,000-character id travelled into a Prisma lookup
 * and was only refused after a database round trip. This is the same fix T44
 * applied to `GET /styles/public/:merchantId`, on the one public salon-scoped
 * route that never got it.
 *
 * A length bound, deliberately **not** a cuid regex — for the same reason as
 * T44's: pinning the id *format* would make a future id scheme fail as a 400
 * on a public route rather than as a clean 404.
 */
export class BusinessHoursParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  merchantId!: string;
}
