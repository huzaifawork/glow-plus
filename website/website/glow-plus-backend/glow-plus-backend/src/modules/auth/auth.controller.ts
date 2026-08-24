import { Body, Controller, Post } from '@nestjs/common';
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
