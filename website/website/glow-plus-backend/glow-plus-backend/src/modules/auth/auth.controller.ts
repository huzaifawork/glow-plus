import { Body, Controller, Post } from '@nestjs/common';
import { ThrottleCredentials, ThrottleEmailSend } from '../../common/throttling';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { SignupDto, LoginDto, VerifyEmailDto, ResendVerificationDto, ForgotPasswordDto, ResetPasswordDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
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
}
