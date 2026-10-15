import { validateRuntime } from './lib/runtime.mjs';

try {
  const versions = validateRuntime();
  console.log(`Runtime válido: Node.js ${versions.node}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
