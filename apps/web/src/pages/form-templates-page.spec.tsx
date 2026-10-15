// =============================================================================
// Teste de componente da FormTemplatesPage (Construtor de Fichas)
// -----------------------------------------------------------------------------
// Mockamos o auth-context e o cliente gerado pelo Orval: roda sem API e sem banco.
// =============================================================================
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormTemplatesPage } from './form-templates-page';
import {
  formAccessControllerMe,
  formTemplatesControllerCreate,
  formTemplatesControllerFindAll,
  formTemplatesControllerFindById,
  formTemplatesControllerRemove,
  formTemplatesControllerTransition,
} from '../lib/api-client';

vi.mock('../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'USER' },
    isAuthenticated: true,
    isAdmin: false,
  }),
}));

vi.mock('../lib/api-client', () => ({
  formAccessControllerMe: vi.fn(),
  formTemplatesControllerFindAll: vi.fn(),
  formTemplatesControllerFindById: vi.fn(),
  formTemplatesControllerCreate: vi.fn(),
  formTemplatesControllerUpdate: vi.fn(),
  formTemplatesControllerRemove: vi.fn(),
  formTemplatesControllerTransition: vi.fn(),
  formTemplatesControllerDerive: vi.fn(),
}));

const ok = (data: unknown) => ({ data, status: 200, headers: new Headers() });

const CONFIGURADOR = {
  roles: ['CONFIGURADOR'],
  permissions: ['TEMPLATE_CREATE', 'TEMPLATE_READ_OWN', 'TEMPLATE_UPDATE', 'TEMPLATE_DELETE', 'PRONTUARIO_READ'],
  mock: true,
};
const SUPERVISAO = {
  roles: ['SUPERVISAO'],
  permissions: ['TEMPLATE_READ_ALL', 'TEMPLATE_REVIEW', 'PRONTUARIO_READ'],
  mock: false,
};
const PREENCHIMENTO = { roles: ['PREENCHIMENTO'], permissions: ['PRONTUARIO_READ'], mock: false };

const OWN = {
  id: 'tpl-1',
  code: 'FC-0001',
  name: 'Anamnese inicial',
  description: 'Ficha de primeira consulta',
  clinicalArea: 'NUTRICAO',
  sigtapCode: '03.01.01.004-8',
  responsibleName: 'Ada Lovelace',
  complexity: 'SIMPLES',
  version: '1.0.0',
  status: 'RASCUNHO',
  prontuarioComponents: ['PRT.IDENT@3.1'],
  derivedFromId: null,
  ownerId: 'usr-1',
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
};
const OTHER = {
  ...OWN,
  id: 'tpl-2',
  code: 'FC-0002',
  name: 'Evolução diária',
  description: null,
  status: 'EM_REVISAO',
  ownerId: 'usr-2-abcdefgh',
};
const COUNTS = { total: 2, RASCUNHO: 1, EM_REVISAO: 1, APROVADO: 0, PUBLICADO: 0, SUSPENSO: 0, INATIVO: 0 };

function listOf(items: unknown[]) {
  return ok({ data: items, meta: { page: 1, pageSize: 12, total: items.length, totalPages: 1 }, statusCounts: COUNTS });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FormTemplatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FormTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the ficha registration (code, area, SIGTAP, responsible, version, status) with status tabs', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(CONFIGURADOR) as never);
    vi.mocked(formTemplatesControllerFindAll).mockResolvedValue(listOf([OWN]) as never);

    renderPage();

    expect(await screen.findByText('Anamnese inicial')).toBeInTheDocument();
    expect(screen.getByText('FC-0001')).toBeInTheDocument();
    expect(screen.getByText('03.01.01.004-8')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /em revisão\s*1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /novo modelo/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Editar Anamnese inicial')).toBeInTheDocument();
    expect(screen.getByLabelText('Excluir Anamnese inicial')).toBeInTheDocument();
    expect(screen.getByText(/mock de primeira fase/i)).toBeInTheDocument();
  });

  it('only allows editing/deleting drafts', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(CONFIGURADOR) as never);
    vi.mocked(formTemplatesControllerFindAll).mockResolvedValue(
      listOf([{ ...OWN, status: 'PUBLICADO' }]) as never,
    );

    renderPage();

    expect(await screen.findByText('Anamnese inicial')).toBeInTheDocument();
    expect(screen.queryByLabelText('Editar Anamnese inicial')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Excluir Anamnese inicial')).not.toBeInTheDocument();
  });

  it('filters by status through the tabs', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(CONFIGURADOR) as never);
    vi.mocked(formTemplatesControllerFindAll).mockResolvedValue(listOf([OWN]) as never);

    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: /rascunho/i }));
    await waitFor(() =>
      expect(formTemplatesControllerFindAll).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'RASCUNHO' })),
    );
  });

  it('shows Supervisão without create/edit/delete, but able to approve a template in review', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(SUPERVISAO) as never);
    vi.mocked(formTemplatesControllerFindAll).mockResolvedValue(listOf([OTHER]) as never);
    vi.mocked(formTemplatesControllerFindById).mockResolvedValue(
      ok({ ...OTHER, derivedFromCode: null, versions: [] }) as never,
    );
    vi.mocked(formTemplatesControllerTransition).mockResolvedValue(ok({ ...OTHER, status: 'APROVADO' }) as never);

    renderPage();

    expect(await screen.findByText('Evolução diária')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /novo modelo/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editar Evolução diária')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Ver detalhes de Evolução diária'));
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(formTemplatesControllerTransition).toHaveBeenCalledWith('tpl-2', { action: 'APROVAR' }),
    );
    expect(await screen.findByText(/status alterado para "Aprovado"/i)).toBeInTheDocument();
  });

  it('hides edit on templates owned by someone else, even with update permission', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(CONFIGURADOR) as never);
    vi.mocked(formTemplatesControllerFindAll).mockResolvedValue(listOf([{ ...OTHER, status: 'RASCUNHO' }]) as never);

    renderPage();

    expect(await screen.findByText('Evolução diária')).toBeInTheDocument();
    expect(screen.queryByLabelText('Editar Evolução diária')).not.toBeInTheDocument();
  });

  it('blocks profiles without template read permission and never lists templates', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(PREENCHIMENTO) as never);

    renderPage();

    expect(await screen.findByText(/não tem acesso aos modelos de ficha/i)).toBeInTheDocument();
    expect(formTemplatesControllerFindAll).not.toHaveBeenCalled();
  });

  it('validates and registers the ficha with trimmed data', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(CONFIGURADOR) as never);
    vi.mocked(formTemplatesControllerFindAll).mockResolvedValue(listOf([]) as never);
    vi.mocked(formTemplatesControllerCreate).mockResolvedValue({ ...ok(OWN), status: 201 } as never);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /novo modelo/i }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: /cadastrar modelo/i }));
    expect(await screen.findByText('O nome deve ter no mínimo 3 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Selecione a área clínica.')).toBeInTheDocument();
    expect(screen.getByText('O código SIGTAP deve seguir o formato 00.00.00.000-0.')).toBeInTheDocument();
    expect(formTemplatesControllerCreate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  Anamnese inicial ' } });
    fireEvent.change(screen.getByLabelText('Área clínica'), { target: { value: 'NUTRICAO' } });
    // Máscara: dígitos viram 00.00.00.000-0
    fireEvent.change(screen.getByLabelText('Código SIGTAP'), { target: { value: '0301010048' } });
    fireEvent.change(screen.getByLabelText(/componentes do prontuário/i), { target: { value: 'prt.ident@3.1' } });
    fireEvent.click(screen.getByRole('button', { name: /cadastrar modelo/i }));

    await waitFor(() =>
      expect(formTemplatesControllerCreate).toHaveBeenCalledWith({
        name: 'Anamnese inicial',
        clinicalArea: 'NUTRICAO',
        sigtapCode: '03.01.01.004-8',
        responsibleName: 'Ada Lovelace',
        complexity: 'SIMPLES',
        prontuarioComponents: ['PRT.IDENT@3.1'],
      }),
    );
    expect(await screen.findByText(/FC-0001 "Anamnese inicial" cadastrado como Rascunho/i)).toBeInTheDocument();
  });

  it('shows the API conflict message when the name already exists', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(CONFIGURADOR) as never);
    vi.mocked(formTemplatesControllerFindAll).mockResolvedValue(listOf([]) as never);
    vi.mocked(formTemplatesControllerCreate).mockRejectedValue({
      status: 409,
      detail: 'Já existe um modelo chamado "Anamnese inicial".',
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /novo modelo/i }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Anamnese inicial' } });
    fireEvent.change(screen.getByLabelText('Área clínica'), { target: { value: 'NUTRICAO' } });
    fireEvent.change(screen.getByLabelText('Código SIGTAP'), { target: { value: '0301010048' } });
    fireEvent.click(screen.getByRole('button', { name: /cadastrar modelo/i }));

    expect(await screen.findByText('Já existe um modelo chamado "Anamnese inicial".')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting a draft', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(CONFIGURADOR) as never);
    vi.mocked(formTemplatesControllerFindAll).mockResolvedValue(listOf([OWN]) as never);
    vi.mocked(formTemplatesControllerRemove).mockResolvedValue({ data: undefined, status: 204 } as never);

    renderPage();

    fireEvent.click(await screen.findByLabelText('Excluir Anamnese inicial'));
    expect(formTemplatesControllerRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(formTemplatesControllerRemove).toHaveBeenCalledWith('tpl-1'));
    expect(await screen.findByText('Modelo excluído.')).toBeInTheDocument();
  });

  it('shows a dedicated state when the prontuário is unavailable (503)', async () => {
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(CONFIGURADOR) as never);
    vi.mocked(formTemplatesControllerFindAll).mockRejectedValue({ status: 503, detail: 'indisponível' });

    renderPage();

    expect(await screen.findByText('Prontuário indisponível')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
  });
});
