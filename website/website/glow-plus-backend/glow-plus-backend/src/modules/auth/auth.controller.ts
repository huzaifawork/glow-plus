import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ThrottleCredentials, ThrottleEmailSend, ThrottleRefresh } from '../../common/throttling';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenService } from './refresh-token.service';
import {
  SignupDto,
  LoginDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  @ThrottleCredentials()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signupConsumer(dto);
  }

  @ThrottleCredentials()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.loginConsumer(dto);
  }

  @ThrottleCredentials()
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @ThrottleEmailSend()
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email);
  }

  @ThrottleEmailSend()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.forgotPassword(dto.email);
  }

  /**
   * Is this reset link still good?  [F65]
   *
   * `ResetPassword.jsx` checked only that a `token` query param was PRESENT,
   * never that it meant anything — so a spent or expired link rendered a full,
   * inviting "Choose a new password" form and only revealed the truth after
   * the customer had typed a password and submitted it. Proved live during J5:
   * a token whose `usedAt` was already stamped still produced the form.
   *
   * The practical harm is not the wasted keystrokes. Someone re-opening an old
   * link is shown the same screen as someone opening a fresh one, sets what
   * they believe is their new password, and is then locked out with no idea
   * why the password they just chose does not work.
   *
   * Mirrors `GET /staff/invites/:token`, which had this from birth — same
   * throttle tier, same BadRequest wording as `resetPassword` so the two
   * cannot drift into telling a customer different stories about one token.
   *
   * Returning the address is not a disclosure: whoever holds this token can
   * already take the account over with it. It is what lets the page say WHICH
   * account is being reset, which matters to anyone with more than one.
   */
  @ThrottleCredentials()
  @Get('reset-password/:token')
  previewReset(@Param('token') token: string) {
    return this.passwordReset.previewReset(token);
  }

  @ThrottleCredentials()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.resetPassword(dto.token, dto.password);
  }

  /**
   * T47 — spend a refresh token for a new access token, and a new refresh
   * token to replace it. Both clients call this; neither has to log in again.
   *
   * Unauthenticated by design, and it must be: it is called precisely when the
   * access token has expired, so requiring one would be circular. The refresh
   * token in the body IS the credential.
   *
   * `@ThrottleRefresh()` rather than `@ThrottleCredentials()` — see the note
   * on the decorator. In short: this is routine automated traffic from every
   * signed-in client, so the credential tier's 20-per-5-minutes-per-IP would
   * sign a NAT'd salon out mid-shift, and a rate limit was never what stood
   * between an attacker and a 32-byte random token anyway.
   */
  @ThrottleRefresh()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.refreshTokens.rotate(dto.refreshToken);
  }

  /**
   * T47 — end the session server-side.
   *
   * Before this, "log out" could only ever mean "the client forgot its token",
   * which is not a logout at all: the access token stayed valid for its full
   * life wherever else it had reached. This revokes the refresh lineage, so
   * the session cannot be continued, and the access token dies within 15
   * minutes on its own.
   *
   * Unauthenticated for the same reason as `refresh`, and always `{ ok: true }`
   * — see RefreshTokenService.revoke.
   */
  @ThrottleRefresh()
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.refreshTokens.revoke(dto.refreshToken);
  }
}
