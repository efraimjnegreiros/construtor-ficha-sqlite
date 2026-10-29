import { runNpxStep } from './lib/process.mjs';

function validateProductionDatabaseUrl() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('db:deploy exige NODE_ENV=production para evitar uso acidental no desenvolvimento.');
  }

  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL é obrigatória para aplicar migrations de produção.');

  if (!value.startsWith('file:') || value === 'file:') {
    throw new Error('DATABASE_URL deve apontar para um arquivo SQLite (ex.: file:/dados/app.db).');
  }
}

try {
  validateProductionDatabaseUrl();
  await runNpxStep(
    'Aplicando migrations de produção com prisma migrate deploy',
    ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    { cwd: 'apps/api' },
  );
  console.log('Migrations de produção aplicadas com sucesso.');
} catch (error) {
  console.error(['Falha no deploy das migrations.', error.message].join('\n'));
  process.exit(1);
}
