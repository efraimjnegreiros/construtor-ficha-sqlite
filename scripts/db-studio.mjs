import { validateEnv } from './lib/env.mjs';
import { runNpxStep } from './lib/process.mjs';

try {
  validateEnv();
  await runNpxStep('Abrindo Prisma Studio', ['prisma', 'studio', '--schema', 'prisma/schema.prisma'], { cwd: 'apps/api' });
} catch (error) {
  console.error([
    'Falha ao abrir Prisma Studio.',
    error.message,
    'Confirme se `npm install` foi executado antes de usar este comando.'
  ].join('\n'));
  process.exit(1);
}
