// =============================================================================
// ShellSessionService — validação da sessão do shell (AUTH_MODE=shell)
// fetch e Prisma simulados: roda sem shell, sem rede e sem banco.
// =============================================================================
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfig } from '../config/auth.config';
import type { PrismaService } from '../prisma/prisma.service';
import { ShellSessionService } from './shell-session.service';

const config = {
  shellApiUrl: 'http://localhost:3000',
  sessionCookieName: 'appstart_session',
  shellSessionCacheMs: 30_000,
} as AuthConfig;

const shellUser = { id: 'u-shell', name: 'Fernanda Costa', email: 'Fernanda@X.com', role: 'ADMIN' };
const localProfile = {
  id: 'local-1',
  keycloakUserId: 'shell:u-shell',
  name: 'Fernanda Costa',
  email: 'fernanda@x.com',
  roleSnapshot: 'ADMIN',
  isActiveLocal: true,
};

describe('ShellSessionService', () => {
  let prisma: any;
  let service: ShellSessionService;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    prisma = {
      userProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(localProfile),
        update: vi.fn().mockResolvedValue(localProfile),
      },
    };
    service = new ShellSessionService(prisma as unknown as PrismaService, config);
  });

  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

  it('validates the cookie at the shell and mirrors the user locally', async () => {
    fetchMock.mockResolvedValue(ok({ user: shellUser }));

    const session = await service.resolve('tok-123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/v1/auth/me');
    // Só o cookie de sessão é repassado ao shell.
    expect(init.headers.cookie).toBe('appstart_session=tok-123');
    expect(prisma.userProfile.create).toHaveBeenCalledWith({
      data: { name: 'Fernanda Costa', email: 'fernanda@x.com', roleSnapshot: 'ADMIN', keycloakUserId: 'shell:u-shell' },
    });
    // O id LOCAL (não o do shell) é o que vira dono dos modelos.
    expect(session.user).toEqual({ id: 'local-1', name: 'Fernanda Costa', email: 'fernanda@x.com', role: 'ADMIN' });
    expect(session.tokenHash).not.toContain('tok-123');
  });

  it('caches the validation for the configured time', async () => {
    fetchMock.mockResolvedValue(ok({ user: shellUser }));
    prisma.userProfile.findUnique.mockResolvedValue(localProfile);

    await service.resolve('tok-123');
    await service.resolve('tok-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 401 without cookie or when the shell rejects the session', async () => {
    await expect(service.resolve(undefined)).rejects.toThrow(UnauthorizedException);

    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
    await expect(service.resolve('expired')).rejects.toThrow(UnauthorizedException);
  });

  it('returns 503 (not 401) when the shell is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(service.resolve('tok')).rejects.toThrow(ServiceUnavailableException);
  });

  it('relinks a profile created before (same e-mail) to the shell identity', async () => {
    fetchMock.mockResolvedValue(ok({ user: shellUser }));
    prisma.userProfile.findUnique
      .mockResolvedValueOnce(null) // por keycloakUserId
      .mockResolvedValueOnce({ ...localProfile, keycloakUserId: 'dev:fernanda' }); // por e-mail

    await service.resolve('tok-9');

    expect(prisma.userProfile.update).toHaveBeenCalledWith({
      where: { id: 'local-1' },
      data: expect.objectContaining({ keycloakUserId: 'shell:u-shell' }),
    });
    expect(prisma.userProfile.create).not.toHaveBeenCalled();
  });
});
