import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthConfig } from '../config/auth.config';
import type { OidcIdentity } from './auth.types';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Login local de desenvolvimento (AUTH_MODE=dev). Valida e-mail/senha contra
 * os usuários DEV_ADMIN_* / DEV_USER_* do .env e devolve uma identidade no
 * mesmo formato que o Keycloak, para que o restante do fluxo (perfil local,
 * sessão opaca, papéis) seja idêntico.
 */
export function authenticateDevUser(
  config: Pick<AuthConfig, 'devUsers'>,
  username: string,
  password: string,
): OidcIdentity | null {
  const email = username.trim().toLowerCase();
  const passwordHash = digest(password);

  // Compara todos os usuários (sem retorno antecipado) para não vazar qual e-mail existe.
  let match: AuthConfig['devUsers'][number] | undefined;
  for (const candidate of config.devUsers) {
    const passwordOk = timingSafeEqual(passwordHash, digest(candidate.password));
    if (passwordOk && candidate.email === email) match = candidate;
  }
  if (!match) return null;

  return {
    subject: `dev:${match.isAdmin ? 'admin' : 'user'}`,
    email: match.email,
    name: match.name,
    roles: match.isAdmin ? ['admin'] : [],
  };
}
