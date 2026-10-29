// =============================================================================
// Teste de componente da CategoriesPage
// -----------------------------------------------------------------------------
// Mesmo padrão de tasks-page.spec.tsx: mockamos o auth-context e o cliente
// gerado pelo Orval, então o teste roda sem API e sem banco.
// Rodar com: pnpm --dir apps/web test
// =============================================================================
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { CategoriesPage } from './categories-page';

vi.mock('../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'USER' },
    isAuthenticated: true,
    isAdmin: false,
  }),
}));

vi.mock('../lib/api-client', () => ({
  categoriesControllerFindAll: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'cat-1',
          name: 'Trabalho',
          color: '#3B82F6',
          ownerId: 'usr-1',
          taskCount: 3,
          createdAt: '2026-08-31T10:00:00.000Z',
          updatedAt: '2026-08-31T10:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
    },
    status: 200,
    headers: new Headers(),
  }),
  categoriesControllerCreate: vi.fn(),
  categoriesControllerUpdate: vi.fn(),
  categoriesControllerRemove: vi.fn(),
}));

describe('CategoriesPage', () => {
  it('renders categories page with loaded categories', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CategoriesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Categorias de Tarefas')).toBeInTheDocument();
    expect(await screen.findByText('Trabalho')).toBeInTheDocument();
    expect(screen.getByText('3 tarefas')).toBeInTheDocument();
  });
});
