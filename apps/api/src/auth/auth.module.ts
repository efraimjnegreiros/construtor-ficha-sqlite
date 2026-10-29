import { Module } from '@nestjs/common';
import { AUTH_CONFIG, createAuthConfig } from '../config/auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { SessionService } from './session.service';
import { ShellSessionService } from './shell-session.service';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => createAuthConfig() },
    AuthService,
    OidcService,
    SessionService,
    ShellSessionService,
  ],
  exports: [AUTH_CONFIG, SessionService],
})
export class AuthModule {}
