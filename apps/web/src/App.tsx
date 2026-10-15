import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { AuthProvider } from './context/auth-context';
import { ThemeProvider } from './context/theme-context';
import { AuthLayout } from './components/layout/auth-layout';
import { ProtectedRoute } from './components/layout/protected-route';
// [CATEGORIA] Nova página de categorias
import { CategoriesPage } from './pages/categories-page';
import { DashboardPage } from './pages/dashboard-page';
import { FormBuilderPage } from './pages/form-builder-page';
import { FormTemplatesPage } from './pages/form-templates-page';
import { LoginPage } from './pages/login-page';
import { ProfilePage } from './pages/profile-page';
import { TasksPage } from './pages/tasks-page';
import { UsersPage } from './pages/users-page';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const status = (error as { status?: number })?.status;
      if (status === 401 && window.location.pathname !== '/login') {
        window.location.href = `/login?returnTo=${encodeURIComponent(
          window.location.pathname + window.location.search,
        )}`;
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Login Route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected App Routes */}
              <Route
                element={
                  <ProtectedRoute>
                    <AuthLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                {/* [CATEGORIA] Rota protegida (qualquer usuário logado), igual a /tasks */}
                <Route path="/categories" element={<CategoriesPage />} />
                {/* Construtor de Fichas: o acesso fino (criar/ler/editar) é decidido por /form-access/me e pela API */}
                <Route path="/form-templates" element={<FormTemplatesPage />} />
                {/* Cadastro dos campos da ficha (seções, grupos e campos) */}
                <Route path="/form-templates/:id/builder" element={<FormBuilderPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute requiredRole="ADMIN">
                      <UsersPage />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
