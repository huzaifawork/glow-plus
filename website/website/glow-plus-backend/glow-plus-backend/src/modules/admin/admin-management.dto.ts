import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_EMAIL, MAX_PASSWORD, MIN_PASSWORD } from '../../common/limits';

/**
 * Create a brand-new admin account from the panel  (T77)
 *
 * The password floor is the API's own `MIN_PASSWORD`, not a stricter one
 * invented here: an admin password held to a weaker standard than a customer's
 * would be backwards, and a stricter one that only exists on this route is a
 * rule nobody can discover until it rejects them.
 */
export class CreateAdminDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  password!: string;

  /**
   * Omitted means ADMIN. An OWNER has to be asked for explicitly — the same
   * reasoning as the column default in schema.prisma.
   */
  @IsOptional()
  @IsIn(['OWNER', 'ADMIN'])
  role?: 'OWNER' | 'ADMIN';
}

/**
 * Promote an existing customer to admin  (T77)
 *
 * Takes only the user's id. There is deliberately no password field: the new
 * Admin row reuses the User's existing `passwordHash`, so the person signs in
 * to the panel with the password they already have. Nobody generates a
 * password, nobody transmits one over chat, and the operator performing the
 * promotion never learns it.
 */
export class PromoteUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId!: string;

  @IsOptional()
  @IsIn(['OWNER', 'ADMIN'])
  role?: 'OWNER' | 'ADMIN';
}

/**
 * An admin changes their own password  (T77)
 *
 * `currentPassword` is required even though the caller is already
 * authenticated: it is what stops a walked-away laptop or a stolen access
 * token from being turned into permanent ownership of the account. It also
 * has no MinLength, for the same reason LoginDto doesn't — an error message
 * about the *old* password's length would leak the policy that was in force
 * when it was set.
 */
export class ChangeAdminPasswordDto {
  @IsString()
  @MaxLength(MAX_PASSWORD)
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  newPassword!: string;
}
