import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class InviteStaffDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
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
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class StaffLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class UpdateStaffRoleDto {
  @IsIn(['OWNER', 'STAFF'])
  role!: 'OWNER' | 'STAFF';
}
