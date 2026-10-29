import { spawn } from 'node:child_process';
import { useShell } from './lib/process.mjs';
import { validateRuntime } from './lib/runtime.mjs';
import { validateEnv } from './lib/env.mjs';
import { checkPortAvailable } from './lib/ports.mjs';

const children = [];

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

try {
  validateRuntime();
  const env = validateEnv();

  await checkPortAvailable(Number(env.API_PORT), 'API');
  await checkPortAvailable(Number(env.WEB_PORT), 'frontend');

  const api = spawn('npm', ['run', 'api:dev'], { stdio: 'inherit', env: process.env, shell: useShell });
  const web = spawn('npm', ['run', 'web:dev'], { stdio: 'inherit', env: process.env, shell: useShell });
  children.push(api, web);

  for (const child of children) {
    child.on('exit', (code) => {
      if (code && code !== 0) {
        stopChildren();
        process.exit(code);
      }
    });
  }

  process.on('SIGINT', () => {
    stopChildren();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopChildren();
    process.exit(0);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
