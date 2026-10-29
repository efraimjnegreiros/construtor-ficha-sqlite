import { execFileSync } from 'node:child_process';
import { validateEnv } from './lib/env.mjs';
import { runCommand, runStep } from './lib/process.mjs';
import { useDocker } from './lib/local-db.mjs';

function ensureDockerAvailable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
  } catch {
    throw new Error([
      'Docker não está disponível.',
      'Verifique se o Docker Desktop/daemon está em execução e se sua conta possui permissão para usar Docker.',
      'Ou use o login local de desenvolvimento: AUTH_MODE=dev no .env.'
    ].join('\n'));
  }
}

try {
  const env = validateEnv();
  if (env.AUTH_MODE === 'shell') {
    console.log(`AUTH_MODE=shell: o login é feito pelo shell (${env.SHELL_WEB_URL || 'http://localhost:5173'}); nada a iniciar.`);
    process.exit(0);
  }
  if ((env.AUTH_MODE ?? 'keycloak') === 'dev') {
    console.log('AUTH_MODE=dev: login local de desenvolvimento ativo; Keycloak não será iniciado.');
    process.exit(0);
  }
  if (!useDocker(env)) {
    console.log('AUTH_MODE=keycloak com USE_DOCKER=false: usando o Keycloak configurado em KEYCLOAK_BASE_URL; nada a iniciar.');
    process.exit(0);
  }
  ensureDockerAvailable();

  await runCommand('node', ['scripts/keycloak-render-realm.mjs']);
  await runStep('Subindo Keycloak com Docker Compose', 'docker', ['compose', 'up', '-d', 'keycloak']);
  await runCommand('node', ['scripts/keycloak-wait.mjs']);

  console.log('Keycloak pronto para uso.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
