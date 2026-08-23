import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LogVisitDto {
  @IsEmail()
  clientEmail!: string;

  @IsOptional()
  @IsString()
  clientName?: string; // used to create the client profile if they don't exist yet

  @IsString()
  @MinLength(1)
  styleId!: string;
}
