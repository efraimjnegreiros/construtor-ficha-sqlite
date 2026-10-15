import { validateEnv } from './lib/env.mjs';
import { runNpxStep } from './lib/process.mjs';

try {
  validateEnv();
  await runNpxStep('Aplicando migrations Prisma', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { cwd: 'apps/api' });
  console.log('Migrations aplicadas.');
} catch (error) {
  console.error([
    'Falha ao aplicar migrations.',
    error.message,
    'Confirme se `npm install` foi executado e se o banco está disponível.'
  ].join('\n'));
  process.exit(1);
}
