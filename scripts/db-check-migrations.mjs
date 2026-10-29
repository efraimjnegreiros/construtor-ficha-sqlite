import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const apiDir = path.join(rootDir, 'apps', 'api');
const schemaPath = path.join(apiDir, 'prisma', 'schema.prisma');
const migrationsPath = path.join(apiDir, 'prisma', 'migrations');
// SQLite: o banco "shadow" é só um arquivo temporário descartável (nunca o banco real).
const shadowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-shadow-'));
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL || `file:${path.join(shadowDir, 'shadow.db')}`;

if (!shadowDatabaseUrl.startsWith('file:')) {
  console.error('SHADOW_DATABASE_URL deve ser um arquivo SQLite (file:...).');
  process.exit(1);
}
if (process.env.DATABASE_URL && path.resolve(shadowDatabaseUrl.slice(5)) === path.resolve(process.env.DATABASE_URL.slice(5))) {
  console.error('SHADOW_DATABASE_URL não pode ser o mesmo arquivo de DATABASE_URL. Nunca aponte para um banco com dados reais.');
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || shadowDatabaseUrl,
};

function runPrisma(args) {
  return spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...args], {
    cwd: apiDir,
    shell: process.platform === 'win32',
    env,
    encoding: 'utf8',
  });
}

const validation = runPrisma(['validate', '--schema', schemaPath]);
process.stdout.write(validation.stdout ?? '');
process.stderr.write(validation.stderr ?? '');
if (validation.status !== 0) process.exit(validation.status ?? 1);

const diff = runPrisma([
  'migrate',
  'diff',
  '--from-migrations', migrationsPath,
  '--to-schema-datamodel', schemaPath,
  '--shadow-database-url', shadowDatabaseUrl,
  '--exit-code',
]);
process.stdout.write(diff.stdout ?? '');
process.stderr.write(diff.stderr ?? '');

if (diff.status === 2) {
  console.error([
    'O schema Prisma não corresponde às migrations versionadas.',
    'Gere e versione uma migration para a alteração estrutural antes de enviar a mudança.'
  ].join('\n'));
  process.exit(1);
}
if (diff.status !== 0) process.exit(diff.status ?? 1);

console.log('Schema Prisma e migrations estão sincronizados.');
fs.rmSync(shadowDir, { recursive: true, force: true });
