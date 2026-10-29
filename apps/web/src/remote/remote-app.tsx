// =============================================================================
// Ponto de entrada exposto ao shell (Module Federation: './App')
// -----------------------------------------------------------------------------
// O shell faz: import('recordsMfe/App').then((m) => m.App)
// Dentro do shell NÃO há tela de login nem layout próprio: o shell já cuida de
// autenticação, menu lateral e cabeçalho. Aqui ficam só as páginas do Construtor:
//   /records                         → lista de modelos (redireciona)
//   /records/form-templates          → cadastro e governança de modelos
//   /records/form-templates/:id/builder → montagem (seções, grupos e campos)
// A sessão é a do shell (cookie HttpOnly); a API deste MFE valida o cookie no
// shell (AUTH_MODE=shell). O AuthProvider abaixo lê /api/v1/records/auth/me, que
// devolve o perfil LOCAL espelhado (id usado como dono dos modelos).
// =============================================================================
import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/auth-context';
import { setApiBasePath } from '../lib/api-client/custom-fetch';
import { FormTemplatesPage } from '../pages/form-templates-page';
import { FormBuilderPage } from '../pages/form-builder-page';
import { MFE_API_BASE, MFE_BASENAME } from './mfe-config';
import '../index.css';

// Todas as chamadas deste módulo passam pelo proxy do shell.
setApiBasePath(MFE_API_BASE);

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // Sessão do shell expirou: volta para o login DO SHELL.
        if ((error as { status?: number })?.status === 401 && window.location.pathname !== '/login') {
          window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const status = (error as { status?: number })?.status;
          if (status === 401 || status === 403 || status === 404) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function App() {
  // Um QueryClient por montagem: o cache deste MFE não se mistura com o do shell.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={MFE_BASENAME}>
          <Routes>
            <Route index element={<Navigate to="/form-templates" replace />} />
            <Route path="/form-templates" element={<FormTemplatesPage />} />
            <Route path="/form-templates/:id/builder" element={<FormBuilderPage />} />
            <Route path="*" element={<Navigate to="/form-templates" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
