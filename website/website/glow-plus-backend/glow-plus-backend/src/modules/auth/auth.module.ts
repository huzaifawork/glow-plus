import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenService } from './refresh-token.service';
import { SupabaseIdentityService } from './supabase-identity.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailVerificationService,
    PasswordResetService,
    RefreshTokenService,
    SupabaseIdentityService,
  ],
  // T47 — all four login paths mint a session, so the three other auth
  // modules import this one for RefreshTokenService.
  exports: [EmailVerificationService, RefreshTokenService],
})
export class AuthModule {}
