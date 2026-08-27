import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_EMAIL, MAX_PASSWORD, MIN_PASSWORD } from '../../common/limits';

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

/**
 * An admin changes their own email address  (T79)
 *
 * The email is the admin's *login identity* — `POST /admin/login` looks the
 * account up by it and nothing else — so this is a credential change, not a
 * contact-detail edit, and it takes the same `currentPassword` proof that
 * changing the password does. Without it, a session left open on an unlocked
 * laptop is enough to move the account to an address its owner does not
 * control, and every "who am I signing in as" answer moves with it.
 *
 * No MinLength on `currentPassword`, for the reason ChangeAdminPasswordDto
 * gives: a length complaint about the *existing* password leaks the policy
 * that was in force when it was set.
 */
export class ChangeAdminEmailDto {
  @IsString()
  @MaxLength(MAX_PASSWORD)
  currentPassword!: string;

  @IsEmail()
  @MaxLength(MAX_EMAIL)
  newEmail!: string;
}
