import { IsEmail, IsString } from 'class-validator';

export class MerchantLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}