import { createHash } from 'node:crypto';

/** Hash SHA-256 (hex) do token opaco de sessão. O token bruto nunca é persistido. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
