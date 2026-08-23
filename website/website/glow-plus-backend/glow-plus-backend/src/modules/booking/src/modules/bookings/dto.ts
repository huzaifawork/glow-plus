import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  merchantId!: string;

  @IsString()
  styleId!: string;

  @IsISO8601()
  startTime!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AvailabilityQueryDto {
  @IsString()
  @MinLength(1)
  merchantId!: string;

  @IsString()
  @MinLength(1)
  styleId!: string;

  @IsString()
  date!: string; // "YYYY-MM-DD"
}
