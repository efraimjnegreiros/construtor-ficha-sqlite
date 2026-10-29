// =============================================================================
// Sessão do SHELL (AUTH_MODE=shell) — Construtor de Fichas como microfrontend
// -----------------------------------------------------------------------------
// No shell, o login e a sessão são do BFF do shell (cookie HttpOnly opaco). Este
// módulo roda em outro processo/banco (SQLite), então NÃO tem como ler a tabela de
// sessões do shell. Em vez disso, ele pergunta ao shell "quem é o dono deste cookie?"
// (GET <SHELL_API_URL>/api/v1/auth/me) e usa a resposta como identidade.
//
// Segurança:
//   - repassa ao shell SOMENTE o cookie de sessão (nunca os demais cookies do browser);
//   - o token bruto nunca é persistido nem logado; o cache usa o hash SHA-256;
//   - o cache é curto (SHELL_SESSION_CACHE_SECONDS) e limitado em tamanho; logout no
//     shell passa a valer aqui no máximo após esse intervalo;
//   - falha de rede com o shell vira 503 (não 401), para o front não deslogar o usuário
//     por uma indisponibilidade momentânea.
// O perfil local (user_profiles) é apenas um ESPELHO do usuário do shell, necessário
// para a autoria dos modelos de ficha (FK); o shell continua sendo a fonte da verdade
// de nome, e-mail e papel (ADMIN/USER), atualizados a cada validação.
// =============================================================================
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AUTH_CONFIG, type AuthConfig } from '../config/auth.config';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedSession, SafeUserProfile } from './auth.types';
import { hashSessionToken } from './session-token';

const MAX_CACHE_ENTRIES = 500;
const SHELL_TIMEOUT_MS = 5_000;
const MIRROR_PREFIX = 'shell:';

interface ShellMeResponse {
  user?: { id?: unknown; name?: unknown; email?: unknown; role?: unknown };
}

interface CacheEntry {
  expiresAt: number;
  session: ResolvedSession;
}

@Injectable()
export class ShellSessionService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async resolve(token: string | undefined): Promise<ResolvedSession> {
    if (!token) throw new UnauthorizedException('Autenticação necessária.');

    const tokenHash = hashSessionToken(token);
    const cached = this.cache.get(tokenHash);
    if (cached && cached.expiresAt > Date.now()) return cached.session;
    if (cached) this.cache.delete(tokenHash);

    const shellUser = await this.fetchShellUser(token);
    const profile = await this.mirrorProfile(shellUser);
    if (!profile.isActiveLocal) throw new UnauthorizedException('Sessão inválida ou expirada.');

    const user: SafeUserProfile = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.roleSnapshot,
    };
    const session: ResolvedSession = { id: tokenHash, userProfileId: profile.id, tokenHash, user };
    this.remember(tokenHash, session);
    return session;
  }

  /** Esquece uma sessão em cache (ex.: logout local). */
  forget(token: string): void {
    this.cache.delete(hashSessionToken(token));
  }

  private remember(tokenHash: string, session: ResolvedSession): void {
    if (this.config.shellSessionCacheMs <= 0) return;
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Remove o mais antigo (Map preserva a ordem de inserção).
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(tokenHash, { expiresAt: Date.now() + this.config.shellSessionCacheMs, session });
  }

  private async fetchShellUser(token: string): Promise<{ id: string; name: string; email: string; role: UserRole }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SHELL_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.config.shellApiUrl}/api/v1/auth/me`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          cookie: `${this.config.sessionCookieName}=${encodeURIComponent(token)}`,
        },
        signal: controller.signal,
      });
    } catch {
      throw new ServiceUnavailableException('Não foi possível validar a sessão no shell. Tente novamente.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('O shell respondeu com erro ao validar a sessão.');
    }

    let body: ShellMeResponse;
    try {
      body = (await response.json()) as ShellMeResponse;
    } catch {
      throw new ServiceUnavailableException('Resposta inválida do shell ao validar a sessão.');
    }

    const raw = body.user;
    if (
      !raw ||
      typeof raw.id !== 'string' || !raw.id ||
      typeof raw.email !== 'string' || !raw.email ||
      typeof raw.name !== 'string'
    ) {
      throw new ServiceUnavailableException('Resposta inválida do shell ao validar a sessão.');
    }

    return {
      id: raw.id,
      name: raw.name || raw.email,
      email: raw.email.trim().toLowerCase(),
      role: raw.role === 'ADMIN' ? UserRole.ADMIN : UserRole.USER,
    };
  }

  /**
   * Garante o perfil local espelho do usuário do shell. A chave estável é o id do
   * usuário no shell (`shell:<id>`). Se já existir um perfil com o mesmo e-mail e outra
   * chave (ex.: criado antes em modo standalone), ele é religado à identidade do shell,
   * preservando os modelos de ficha que já pertencem a ele.
   */
  private async mirrorProfile(shellUser: { id: string; name: string; email: string; role: UserRole }) {
    const keycloakUserId = `${MIRROR_PREFIX}${shellUser.id}`;
    const data = { name: shellUser.name, email: shellUser.email, roleSnapshot: shellUser.role };

    const linked = await this.prisma.userProfile.findUnique({ where: { keycloakUserId } });
    if (linked) {
      const unchanged =
        linked.name === data.name && linked.email === data.email && linked.roleSnapshot === data.roleSnapshot;
      if (unchanged) return linked;
      return this.prisma.userProfile.update({ where: { id: linked.id }, data });
    }

    const sameEmail = await this.prisma.userProfile.findUnique({ where: { email: shellUser.email } });
    if (sameEmail) {
      return this.prisma.userProfile.update({ where: { id: sameEmail.id }, data: { ...data, keycloakUserId } });
    }

    return this.prisma.userProfile.create({ data: { ...data, keycloakUserId } });
  }
}
