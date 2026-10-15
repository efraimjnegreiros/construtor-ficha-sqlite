import { describe, expect, it } from 'vitest';
import { createAuthConfig } from '../config/auth.config';
import { authenticateDevUser } from './dev-identity';

const baseEnv = {
  API_PORT: '3000',
  WEB_PORT: '5173',
  KEYCLOAK_REALM: 'clinica',
  KEYCLOAK_CLIENT_ID: 'c',
  KEYCLOAK_CLIENT_SECRET: 's',
  KEYCLOAK_ADMIN_CLIENT_ID: 'a',
  KEYCLOAK_ADMIN_CLIENT_SECRET: 's',
  SESSION_COOKIE_NAME: 'sess',
  SESSION_TTL_HOURS: '24',
  DEV_ADMIN_EMAIL: 'Admin@Clinica.local',
  DEV_ADMIN_PASSWORD: 'AdminPass123!',
  DEV_ADMIN_NAME: 'Administrador',
  DEV_USER_EMAIL: 'user@clinica.local',
  DEV_USER_PASSWORD: 'UserPass123!',
  DEV_USER_NAME: 'Usuário',
};

describe('AUTH_MODE=dev', () => {
  const config = createAuthConfig({ ...baseEnv, NODE_ENV: 'development', AUTH_MODE: 'dev' });

  it('defaults to keycloak and needs no DEV_* variables', () => {
    const cfg = createAuthConfig({ ...baseEnv, NODE_ENV: 'development' });
    expect(cfg.authMode).toBe('keycloak');
    expect(cfg.devUsers).toEqual([]);
  });

  it('is refused in production', () => {
    expect(() => createAuthConfig({ ...baseEnv, NODE_ENV: 'production', AUTH_MODE: 'dev' })).toThrow(/produção/);
  });

  it('rejects unknown modes', () => {
    expect(() => createAuthConfig({ ...baseEnv, AUTH_MODE: 'magic' })).toThrow(/AUTH_MODE/);
  });

  it('logs the admin in with the admin role (email is case-insensitive)', () => {
    expect(authenticateDevUser(config, ' admin@clinica.local ', 'AdminPass123!')).toEqual({
      subject: 'dev:admin',
      email: 'admin@clinica.local',
      name: 'Administrador',
      roles: ['admin'],
    });
  });

  it('logs the regular user in without roles', () => {
    expect(authenticateDevUser(config, 'user@clinica.local', 'UserPass123!')?.roles).toEqual([]);
  });

  it('rejects wrong passwords, swapped passwords and unknown users', () => {
    expect(authenticateDevUser(config, 'admin@clinica.local', 'nope')).toBeNull();
    expect(authenticateDevUser(config, 'admin@clinica.local', 'UserPass123!')).toBeNull();
    expect(authenticateDevUser(config, 'ghost@clinica.local', 'AdminPass123!')).toBeNull();
  });
});
