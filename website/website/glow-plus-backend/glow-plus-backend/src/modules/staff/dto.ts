import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_EMAIL, MAX_NAME, MAX_PASSWORD, MAX_TOKEN, MIN_PASSWORD } from '../../common/limits';

export class InviteStaffDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  name?: string;

  // OWNER is invitable on purpose — a salon can have a co-owner or a manager
  // who needs billing access. It is the owner's call, and only an owner can
  // make it (RequireMerchantOwnerGuard).
  @IsOptional()
  @IsIn(['OWNER', 'STAFF'])
  role?: 'OWNER' | 'STAFF';
}

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TOKEN)
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  name?: string;
}

export class StaffLoginDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  // No MinLength on a login — see LoginDto in modules/auth/dto.ts.
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PASSWORD)
  password!: string;
}

export class UpdateStaffRoleDto {
  @IsIn(['OWNER', 'STAFF'])
  role!: 'OWNER' | 'STAFF';
}
