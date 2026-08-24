import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import {
  MAX_EMAIL,
  MAX_NAME,
  MAX_PASSWORD,
  MAX_PHONE,
  MAX_TOKEN,
  MIN_PASSWORD,
} from '../../common/limits';

export class SignupDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  password!: string;

  // T31 — a 100,000-character name was accepted here and written to Postgres.
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_PHONE)
  phone?: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  // No MinLength: a login must not tell the caller the password policy, and
  // a short guess should cost a normal 401, not a 400 that says why.
  @IsString()
  @MaxLength(MAX_PASSWORD)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MaxLength(MAX_TOKEN)
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(MAX_TOKEN)
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  password!: string;
}
