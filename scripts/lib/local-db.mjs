import fs from 'node:fs';
import path from 'node:path';

export function useDocker(env = process.env) {
  return String(env.USE_DOCKER ?? 'false').toLowerCase() === 'true';
}

/**
 * Converte DATABASE_URL (file:./dev.db) no caminho absoluto do arquivo SQLite.
 * Como no Prisma, caminhos relativos são resolvidos a partir da pasta do schema
 * (apps/api/prisma).
 */
export function resolveSqlitePath(databaseUrl, rootDir = process.cwd()) {
  if (!databaseUrl || !databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL inválida. Exemplo: file:./dev.db');
  }
  const raw = databaseUrl.slice('file:'.length).split('?')[0];
  if (!raw) throw new Error('DATABASE_URL inválida: caminho do arquivo SQLite vazio.');
  const schemaDir = path.join(rootDir, 'apps', 'api', 'prisma');
  return path.isAbsolute(raw) ? raw : path.resolve(schemaDir, raw);
}

/**
 * Garante que a pasta do arquivo SQLite existe. O próprio arquivo é criado
 * pelo Prisma ao aplicar as migrations.
 */
export function ensureLocalDatabase(databaseUrl) {
  const filePath = resolveSqlitePath(databaseUrl);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const exists = fs.existsSync(filePath);
  console.log(`SQLite: ${filePath} ${exists ? '(já existe)' : '(será criado ao aplicar as migrations)'}`);
  return filePath;
}
