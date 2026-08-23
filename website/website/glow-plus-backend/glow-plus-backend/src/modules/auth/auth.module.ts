import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, EmailVerificationService, PasswordResetService],
  exports: [EmailVerificationService],
})
export class AuthModule {}
