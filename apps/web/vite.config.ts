// =============================================================================
// Vite do Construtor de Fichas — microfrontend remoto do shell Clínica Digital
// -----------------------------------------------------------------------------
// Este app roda de dois jeitos com o MESMO servidor (npm run web:dev):
//   1. Remote do shell: expõe './App' em http://localhost:5178/remoteEntry.js com o
//      nome "recordsMfe" — exatamente o que o vite.config do shell já espera
//      (remotes.recordsMfe e proxy '/api/v1/records' → :5178).
//   2. Standalone: abrindo http://localhost:5178 direto (index.html → main.tsx),
//      com layout e login próprios (útil com AUTH_MODE=dev).
// Em ambos os casos, '/api' é encaminhado para a API NestJS deste módulo.
// Sem Docker e sem PostgreSQL: a API usa SQLite (apps/api/prisma/dev.db).
// =============================================================================
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Carrega TODAS as variáveis do .env (prefixo '' = sem filtro por VITE_)
  const env = loadEnv(mode, resolve(import.meta.dirname, '../..'), '');

  const webPort = Number(env.WEB_PORT) || 5178;
  const webBaseUrl = env.WEB_BASE_URL || `http://localhost:${webPort}`;
  const apiBaseUrl = env.API_BASE_URL || `http://localhost:${env.API_PORT || '3008'}`;
  const mfeName = env.MFE_NAME || 'recordsMfe';

  return {
    // URL absoluta: os módulos do remote são buscados pelo shell (outra origem).
    base: `${webBaseUrl}/`,
    appType: 'spa',
    plugins: [
      tailwindcss(),
      react(),
      federation({
        name: mfeName,
        filename: 'remoteEntry.js',
        manifest: true,
        exposes: {
          './App': './src/remote/remote-app.tsx',
        },
        // Mesmas libs compartilhadas que o shell declara (uma única cópia do React).
        shared: {
          react: { singleton: true },
          'react-dom': { singleton: true },
        },
        dts: false,
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(import.meta.dirname, './src'),
      },
    },
    define: {
      'import.meta.env.VITE_DEV_ADMIN_EMAIL': JSON.stringify(env.DEV_ADMIN_EMAIL || 'admin@appstart.local'),
      'import.meta.env.VITE_DEV_USER_EMAIL': JSON.stringify(env.DEV_USER_EMAIL || 'user@appstart.local'),
    },
    build: {
      target: 'esnext',
    },
    server: {
      port: webPort,
      strictPort: true,
      origin: webBaseUrl,
      // O shell (outra porta) carrega remoteEntry.js e os módulos daqui.
      cors: true,
      proxy: {
        '/api': {
          target: apiBaseUrl,
          changeOrigin: true,
        },
        '/health': {
          target: apiBaseUrl,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: webPort,
      strictPort: true,
      cors: true,
    },
  };
});
