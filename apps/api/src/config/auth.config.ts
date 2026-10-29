export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export type AuthMode = 'keycloak' | 'dev' | 'shell';

export interface DevUserConfig {
  email: string;
  password: string;
  name: string;
  isAdmin: boolean;
}

export interface AuthConfig {
  nodeEnv: 'development' | 'test' | 'production';
  /**
   * 'keycloak' (padrão): autenticação via Keycloak/OIDC.
   * 'dev': login local de desenvolvimento, sem Keycloak. Recusado em produção.
   * 'shell': microfrontend do shell Clínica Digital — o login é do shell; esta API
   *          valida o cookie de sessão do shell em GET <SHELL_API_URL>/api/v1/auth/me.
   */
  authMode: AuthMode;
  /** URL da API (BFF) do shell, usada para validar a sessão em authMode='shell'. */
  shellApiUrl: string;
  /** URL do frontend do shell (origem confiável para CORS/CSRF em authMode='shell'). */
  shellWebUrl: string;
  /** Tempo de cache da validação de sessão no shell (ms). 0 = sem cache. */
  shellSessionCacheMs: number;
  /** Origens aceitas em CORS/CSRF (frontend próprio + shell, quando houver). */
  trustedOrigins: string[];
  /** Usuários aceitos em authMode='dev' (vindos de DEV_ADMIN_* / DEV_USER_*). */
  devUsers: DevUserConfig[];
  apiPort: number;
  apiBaseUrl: string;
  webBaseUrl: string;
  keycloakBaseUrl: string;
  realm: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  adminClientId: string;
  adminClientSecret: string;
  callbackUrl: string;
  sessionCookieName: string;
  correlationCookieName: string;
  sessionTtlMs: number;
  correlationTtlMs: number;
  cleanupIntervalMs: number;
  secureCookies: boolean;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}.`);
  return value;
}

function integer(value: string, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} deve ser um inteiro entre ${minimum} e ${maximum}.`);
  }
  return parsed;
}

function baseUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} deve ser uma URL válida.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} deve ser uma URL HTTP(S) sem credenciais.`);
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function createAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const nodeEnvValue = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvValue)) {
    throw new Error('NODE_ENV deve ser development, test ou production.');
  }
  const nodeEnv = nodeEnvValue as AuthConfig['nodeEnv'];
  const authModeValue = env.AUTH_MODE?.trim() || 'keycloak';
  if (!['keycloak', 'dev', 'shell'].includes(authModeValue)) {
    throw new Error('AUTH_MODE deve ser keycloak, dev ou shell.');
  }
  const authMode = authModeValue as AuthMode;
  if (authMode === 'dev' && nodeEnv === 'production') {
    throw new Error('AUTH_MODE=dev é proibido em produção (NODE_ENV=production).');
  }
  const devUsers: DevUserConfig[] =
    authMode === 'dev'
      ? [
          { prefix: 'DEV_ADMIN', isAdmin: true },
          { prefix: 'DEV_USER', isAdmin: false },
        ].map(({ prefix, isAdmin }) => ({
          email: required(env, `${prefix}_EMAIL`).toLowerCase(),
          password: required(env, `${prefix}_PASSWORD`),
          name: required(env, `${prefix}_NAME`),
          isAdmin,
        }))
      : [];
  const apiPort = integer(required(env, 'API_PORT'), 'API_PORT', 1, 65_535);
  const webPort = integer(required(env, 'WEB_PORT'), 'WEB_PORT', 1, 65_535);
  const keycloakPort = env.KEYCLOAK_PORT ? integer(env.KEYCLOAK_PORT, 'KEYCLOAK_PORT', 1, 65_535) : 8080;
  const keycloakBaseUrl = baseUrl(env.KEYCLOAK_BASE_URL ?? `http://localhost:${keycloakPort}`, 'KEYCLOAK_BASE_URL');
  const apiBase = baseUrl(env.API_BASE_URL ?? `http://localhost:${apiPort}`, 'API_BASE_URL');
  const webBase = baseUrl(env.WEB_BASE_URL ?? `http://localhost:${webPort}`, 'WEB_BASE_URL');
  const realm = required(env, 'KEYCLOAK_REALM');
  const clientId = required(env, 'KEYCLOAK_CLIENT_ID');
  const clientSecret = required(env, 'KEYCLOAK_CLIENT_SECRET');
  const adminClientId = required(env, 'KEYCLOAK_ADMIN_CLIENT_ID');
  const adminClientSecret = required(env, 'KEYCLOAK_ADMIN_CLIENT_SECRET');
  const sessionCookieName = required(env, 'SESSION_COOKIE_NAME');

  if (!/^[a-zA-Z0-9._-]+$/.test(realm)) throw new Error('KEYCLOAK_REALM contém caracteres inválidos.');
  if (!/^[a-zA-Z0-9._-]+$/.test(clientId)) throw new Error('KEYCLOAK_CLIENT_ID contém caracteres inválidos.');
  if (!/^[a-zA-Z0-9._-]+$/.test(adminClientId)) throw new Error('KEYCLOAK_ADMIN_CLIENT_ID contém caracteres inválidos.');
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(sessionCookieName)) {
    throw new Error('SESSION_COOKIE_NAME não é um nome de cookie válido.');
  }

  const sessionTtlHours = integer(required(env, 'SESSION_TTL_HOURS'), 'SESSION_TTL_HOURS', 1, 24 * 365);
  const correlationTtlSeconds = integer(env.OIDC_CORRELATION_TTL_SECONDS ?? '300', 'OIDC_CORRELATION_TTL_SECONDS', 60, 900);
  const cleanupIntervalMinutes = integer(env.SESSION_CLEANUP_INTERVAL_MINUTES ?? '60', 'SESSION_CLEANUP_INTERVAL_MINUTES', 1, 24 * 60);

  if (nodeEnv === 'production') {
    for (const [name, value] of [['API_BASE_URL', apiBase], ['WEB_BASE_URL', webBase], ['KEYCLOAK_BASE_URL', keycloakBaseUrl]] as const) {
      if (new URL(value).protocol !== 'https:') throw new Error(`${name} deve usar HTTPS em produção.`);
    }
  }

  const shellApiUrl = baseUrl(env.SHELL_API_URL ?? 'http://localhost:3000', 'SHELL_API_URL');
  const shellWebUrl = baseUrl(env.SHELL_WEB_URL ?? 'http://localhost:5173', 'SHELL_WEB_URL');
  const shellSessionCacheSeconds = integer(env.SHELL_SESSION_CACHE_SECONDS ?? '30', 'SHELL_SESSION_CACHE_SECONDS', 0, 3600);
  if (authMode === 'shell' && nodeEnv === 'production') {
    for (const [name, value] of [['SHELL_API_URL', shellApiUrl], ['SHELL_WEB_URL', shellWebUrl]] as const) {
      if (new URL(value).protocol !== 'https:') throw new Error(`${name} deve usar HTTPS em produção.`);
    }
  }
  const trustedOrigins = [...new Set([new URL(webBase).origin, ...(authMode === 'shell' ? [new URL(shellWebUrl).origin] : [])])];

  const issuer = `${keycloakBaseUrl}/realms/${encodeURIComponent(realm)}`;
  return {
    nodeEnv,
    authMode,
    shellApiUrl,
    shellWebUrl,
    shellSessionCacheMs: shellSessionCacheSeconds * 1000,
    trustedOrigins,
    devUsers,
    apiPort,
    apiBaseUrl: apiBase,
    webBaseUrl: webBase,
    keycloakBaseUrl,
    realm,
    issuer,
    clientId,
    clientSecret,
    adminClientId,
    adminClientSecret,
    callbackUrl: `${apiBase}/api/v1/auth/callback`,
    sessionCookieName,
    correlationCookieName: `${sessionCookieName}_oidc`,
    sessionTtlMs: sessionTtlHours * 60 * 60 * 1000,
    correlationTtlMs: correlationTtlSeconds * 1000,
    cleanupIntervalMs: cleanupIntervalMinutes * 60 * 1000,
    secureCookies: nodeEnv === 'production',
  };
}
