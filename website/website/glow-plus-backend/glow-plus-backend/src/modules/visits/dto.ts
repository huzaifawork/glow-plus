import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_EMAIL, MAX_ID, MAX_NAME } from '../../common/limits';

export class LogVisitDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  clientEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  clientName?: string; // used to create the client profile if they don't exist yet

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  styleId!: string;
}
