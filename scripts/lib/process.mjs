import { spawn } from 'node:child_process';

// No Windows, npm/npx são scripts .cmd e só podem ser iniciados através de um shell.
const isWindows = process.platform === 'win32';

/** Executa `npm <args>` de forma portável (Windows/Linux/macOS). */
export function runNpm(args, options = {}) {
  return runCommand('npm', args, { shell: isWindows, ...options });
}

/** Executa `npx <args>` de forma portável. */
export function runNpx(args, options = {}) {
  return runCommand('npx', args, { shell: isWindows, ...options });
}

export async function runNpxStep(label, args, options = {}) {
  console.log(`→ ${label}`);
  await runNpx(args, options);
}

export const npxBinary = isWindows ? 'npx.cmd' : 'npx';
export const useShell = isWindows;

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} ${args.join(' ')} falhou com código ${code ?? 'null'}${signal ? ` (signal ${signal})` : ''}.`));
    });
  });
}

export async function runStep(label, command, args, options = {}) {
  console.log(`→ ${label}`);
  await runCommand(command, args, options);
}
