import { validateEnv } from './lib/env.mjs';
import { ensureLocalDatabase } from './lib/local-db.mjs';

try {
  const env = validateEnv();
  ensureLocalDatabase(env.DATABASE_URL);
  console.log('Banco SQLite pronto para uso (não há servidor para subir).');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
