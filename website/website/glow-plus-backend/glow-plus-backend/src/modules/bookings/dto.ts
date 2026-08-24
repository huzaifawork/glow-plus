import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MAX_ID, MAX_NOTES } from '../../common/limits';

export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  merchantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  styleId!: string;

  @IsISO8601()
  startTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES)
  notes?: string;
}

/**
 * T31 — this class already existed and was **never used**. The controller
 * bound three loose `@Query('x') x: string` params instead, which
 * ValidationPipe does not validate, so a missing `merchantId` or `styleId`
 * arrived as `undefined`, reached `findUnique({ where: { id: undefined } })`
 * and produced a `PrismaClientValidationError` — a bare **500** for what is
 * plainly a bad request. Now bound for real; see bookings.controller.ts.
 */
export class AvailabilityQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  merchantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  styleId!: string;

  // Was `@IsString()` with a "YYYY-MM-DD" comment and nothing enforcing it.
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date!: string;
}
