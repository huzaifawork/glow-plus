import { IsEmail, IsString, MaxLength } from 'class-validator';
import { MAX_EMAIL, MAX_PASSWORD } from '../../common/limits';

export class MerchantLoginDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  // No MinLength on a login — see LoginDto in modules/auth/dto.ts.
  @IsString()
  @MaxLength(MAX_PASSWORD)
  password!: string;
}