import { execFileSync } from 'node:child_process';
import { runStep } from './lib/process.mjs';
import { loadEnv } from './lib/env.mjs';
import { useDocker } from './lib/local-db.mjs';

function ensureDockerAvailable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
  } catch {
    throw new Error('Docker não está disponível. Inicie o Docker e tente novamente.');
  }
}

try {
  if (!useDocker(loadEnv())) {
    console.log('USE_DOCKER=false: nenhum Keycloak em Docker para parar.');
    process.exit(0);
  }
  ensureDockerAvailable();
  await runStep('Parando Keycloak sem remover dados', 'docker', ['compose', 'stop', 'keycloak']);
  console.log('Keycloak parado.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
