// =============================================================================
// Teste de componente da FormBuilderPage (cadastro dos campos da ficha)
// Mockamos o auth-context e o cliente gerado pelo Orval: roda sem API e sem banco.
// =============================================================================
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormBuilderPage } from './form-builder-page';
import {
  formAccessControllerMe,
  formStructureControllerCreateField,
  formStructureControllerGetStructure,
  formTemplatesControllerFindById,
} from '../lib/api-client';

vi.mock('../context/auth-context', () => ({
  useAuth: () => ({ user: { id: 'usr-1', name: 'Ada', email: 'a@a', role: 'ADMIN' }, isAuthenticated: true, isAdmin: true }),
}));

vi.mock('../lib/api-client', () => ({
  formAccessControllerMe: vi.fn(),
  formTemplatesControllerFindById: vi.fn(),
  formStructureControllerGetStructure: vi.fn(),
  formStructureControllerCreateField: vi.fn(),
  formStructureControllerCreateGroup: vi.fn(),
  formStructureControllerCreateSection: vi.fn(),
  formStructureControllerRemoveField: vi.fn(),
  formStructureControllerRemoveGroup: vi.fn(),
  formStructureControllerRemoveSection: vi.fn(),
  formStructureControllerReorderFields: vi.fn(),
  formStructureControllerReorderGroups: vi.fn(),
  formStructureControllerReorderSections: vi.fn(),
  formStructureControllerUpdateField: vi.fn(),
  formStructureControllerUpdateGroup: vi.fn(),
  formStructureControllerUpdateSection: vi.fn(),
}));

const ok = (data: unknown) => ({ data, status: 200, headers: new Headers() });

const ADMIN_ACCESS = {
  roles: ['CONFIGURADOR', 'SUPERVISAO'],
  permissions: ['TEMPLATE_CREATE', 'TEMPLATE_READ_OWN', 'TEMPLATE_READ_ALL', 'TEMPLATE_UPDATE', 'TEMPLATE_DELETE', 'TEMPLATE_REVIEW'],
  mock: true,
};

const TEMPLATE = {
  id: 'tpl-1',
  code: 'FC-0001',
  name: 'Avaliação Nutricional',
  description: null,
  clinicalArea: 'NUTRICAO',
  sigtapCode: '03.01.01.004-8',
  responsibleName: 'Ada',
  complexity: 'COMPLEXA',
  version: '1.0.0',
  status: 'RASCUNHO',
  prontuarioComponents: [],
  derivedFromId: null,
  derivedFromCode: null,
  ownerId: 'usr-1',
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
  versions: [],
};

const base = {
  sectionId: 'sec-1',
  helpText: null,
  placeholder: null,
  prontuarioCode: null,
  options: [],
  config: {},
  visibleWhen: null,
  requiredWhen: null,
  calculation: null,
};

const STRUCTURE = {
  templateId: 'tpl-1',
  editable: true,
  fieldCount: 3,
  requiredCount: 2,
  conditionalCount: 0,
  calculationCount: 1,
  sections: [
    {
      id: 'sec-1',
      title: 'Antropometria',
      description: null,
      position: 0,
      fields: [],
      groups: [
        {
          id: 'grp-1',
          sectionId: 'sec-1',
          title: 'Medidas',
          description: null,
          prontuarioComponent: 'PRT.ANTRO@1.2',
          position: 0,
          fields: [
            { ...base, id: 'f1', groupId: 'grp-1', key: 'peso', label: 'Peso', type: 'NUMBER', required: true, unit: 'kg', position: 0 },
            { ...base, id: 'f2', groupId: 'grp-1', key: 'altura', label: 'Altura', type: 'NUMBER', required: true, unit: 'cm', position: 1 },
            {
              ...base,
              id: 'f3',
              groupId: 'grp-1',
              key: 'imc',
              label: 'IMC',
              type: 'CALCULATED',
              required: false,
              unit: 'kg/m²',
              calculation: { formula: 'BMI', sourceKeys: ['peso', 'altura'], decimals: 1 },
              position: 2,
            },
          ],
        },
      ],
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/form-templates/tpl-1/builder']}>
        <Routes>
          <Route path="/form-templates/:id/builder" element={<FormBuilderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FormBuilderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(formAccessControllerMe).mockResolvedValue(ok(ADMIN_ACCESS) as never);
    vi.mocked(formTemplatesControllerFindById).mockResolvedValue(ok(TEMPLATE) as never);
    vi.mocked(formStructureControllerGetStructure).mockResolvedValue(ok(STRUCTURE) as never);
  });

  it('shows sections, groups, fields and their rules', async () => {
    renderPage();
    expect(await screen.findByText('§1 · Antropometria')).toBeInTheDocument();
    expect(screen.getByText('PRT.ANTRO@1.2')).toBeInTheDocument();
    expect(screen.getByText('Peso')).toBeInTheDocument();
    expect(screen.getAllByText('IMC (kg/m²)').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 cálculos/)).toBeInTheDocument();
  });

  it('adds a field from the palette to the active group', async () => {
    vi.mocked(formStructureControllerCreateField).mockResolvedValue(ok(STRUCTURE) as never);
    renderPage();

    fireEvent.click(await screen.findByText('Medidas')); // torna o grupo ativo
    expect(screen.getByText('Grupo ativo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Número$/ }));
    fireEvent.change(screen.getByLabelText('Rótulo *'), { target: { value: 'Circunferência abdominal' } });
    expect(screen.getByLabelText('Chave técnica *')).toHaveValue('circunferencia_abdominal');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Adicionar campo' }));

    await waitFor(() =>
      expect(formStructureControllerCreateField).toHaveBeenCalledWith(
        'tpl-1',
        expect.objectContaining({
          label: 'Circunferência abdominal',
          key: 'circunferencia_abdominal',
          type: 'NUMBER',
          sectionId: 'sec-1',
          groupId: 'grp-1',
          required: false,
          calculation: null,
        }),
      ),
    );
  });

  it('freezes the structure when the template is no longer a draft', async () => {
    vi.mocked(formStructureControllerGetStructure).mockResolvedValue(ok({ ...STRUCTURE, editable: false }) as never);
    vi.mocked(formTemplatesControllerFindById).mockResolvedValue(ok({ ...TEMPLATE, status: 'PUBLICADO' }) as never);
    renderPage();

    expect(await screen.findByText(/Estrutura congelada/)).toBeInTheDocument();
    expect(screen.queryByText('Componentes')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editar campo')).not.toBeInTheDocument();
  });

  it('previews the form with automatic IMC and required counter', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /pré-visualização/i }));

    expect(screen.getByText('Preencha os campos de origem')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Peso/), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText(/^Altura/), { target: { value: '170' } });

    expect(await screen.findByText(/27\.7/)).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });
});
