import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AUTH_CONFIG, type AuthConfig } from '../config/auth.config';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedSession, SafeUserProfile } from './auth.types';
import { hashSessionToken } from './session-token';
import { ShellSessionService } from './shell-session.service';

export { hashSessionToken };

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    // Usado apenas em AUTH_MODE=shell (microfrontend dentro do shell).
    @Optional() private readonly shell?: ShellSessionService,
  ) {}

  onModuleInit(): void {
    // Em modo shell não há sessões locais para limpar.
    if (this.config.authMode === 'shell') return;
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpired().catch(() => undefined);
    }, this.config.cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async create(user: { id: string; keycloakUserId: string }): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    await this.prisma.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userProfileId: user.id,
        keycloakSubject: user.keycloakUserId,
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  async resolve(token: string | undefined): Promise<ResolvedSession> {
    if (this.config.authMode === 'shell') {
      if (!this.shell) throw new Error('ShellSessionService indisponível em AUTH_MODE=shell.');
      return this.shell.resolve(token);
    }
    if (!token) throw new UnauthorizedException('Autenticação necessária.');
    const tokenHash = hashSessionToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { userProfile: true },
    });

    if (!session) throw new UnauthorizedException('Sessão inválida ou expirada.');
    if (session.expiresAt.getTime() <= Date.now() || !session.userProfile.isActiveLocal) {
      await this.prisma.session.deleteMany({ where: { tokenHash } });
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    const user: SafeUserProfile = {
      id: session.userProfile.id,
      name: session.userProfile.name,
      email: session.userProfile.email,
      role: session.userProfile.roleSnapshot,
    };
    return {
      id: session.id,
      userProfileId: session.userProfileId,
      tokenHash,
      user,
    };
  }

  async revokeCurrent(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }

  async revokeAll(userProfileId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userProfileId } });
  }

  async cleanupExpired(now = new Date()): Promise<number> {
    const result = await this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
    return result.count;
  }
}
