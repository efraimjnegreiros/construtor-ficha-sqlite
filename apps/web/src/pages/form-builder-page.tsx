// =============================================================================
// FormBuilderPage — Configuração de Campos e Componentes (rota /form-templates/:id/builder)
// -----------------------------------------------------------------------------
// Interface de montagem da ficha:
// - Seções (criar / renomear / excluir / reordenar)
// - Grupos dentro da seção (criar / renomear / excluir / reordenar)
// - Campos estáticos (texto, números, datas, seleções) via FieldFormModal
// com obrigatoriedade simples e lista de opções
// - Paleta de componentes (como no protótipo): clique adiciona ao grupo ativo
// - Regras por campo: obrigatório / "obrigatório se…", condição de exibição,
//   cálculo automático (Idade, IMC, soma, média) e vínculo com o Prontuário
// - Aba "Pré-visualização" usando FormPreview (aplica as regras ao vivo)
// - Estrutura só é editável pelo dono, com o modelo em Rascunho
// Toda mutação da API devolve a árvore completa (FormStructureDto), então o
// cache ['form-structure', id] é simplesmente substituído pela resposta.
// =============================================================================
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Asterisk,
  Calculator,
  Edit2,
  GitBranch,
  Eye,
  FolderPlus,
  Layers,
  Plus,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { useFormAccess } from '../hooks/use-form-access';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { ActionFeedback, EmptyState, ErrorState, LoadingState } from '../components/ui/state-feedback';
import { FieldFormModal, type FieldModalTarget } from '../components/form-builder/field-form-modal';
import { FIELD_TYPES, FIELD_TYPE_MAP, FORMULA_LABELS } from '../components/form-builder/field-types';
import { allFields, describeCondition } from '../components/form-builder/form-logic';
import { STATUS_LABELS } from './form-templates-page';
import { FormPreview } from '../components/form-builder/form-preview';
import {
  formStructureControllerCreateField,
  formStructureControllerCreateGroup,
  formStructureControllerCreateSection,
  formStructureControllerGetStructure,
  formStructureControllerRemoveField,
  formStructureControllerRemoveGroup,
  formStructureControllerRemoveSection,
  formStructureControllerReorderFields,
  formStructureControllerReorderGroups,
  formStructureControllerReorderSections,
  formStructureControllerUpdateField,
  formStructureControllerUpdateGroup,
  formStructureControllerUpdateSection,
  formTemplatesControllerFindById,
} from '../lib/api-client';
import type {
  CreateFormFieldDto,
  FormFieldDefinitionDto,
  FormGroupDto,
  FormSectionDto,
  FormFieldType,
  FormStructureDto,
  FormTemplateDetailDto,
  UpdateFormFieldDto,
} from '../lib/api-client/models';

// ----------------------------------------------------------------- helpers
interface ApiError {
  status?: number;
  detail?: string;
  message?: string;
}
const getStatus = (err: unknown) => (err as ApiError)?.status;
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.detail || (err as ApiError)?.message || fallback;

/** Move o item `index` em `delta` posições e devolve os ids na nova ordem. */
function moveIds<T extends { id: string }>(items: T[], index: number, delta: -1 | 1): string[] | null {
  const target = index + delta;
  if (target < 0 || target >= items.length) return null;
  const ids = items.map((i) => i.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

// Seção e grupo usam o mesmo formulário (título + descrição)
const containerSchema = z.object({
  title: z.string().trim().min(1, 'O título é obrigatório.').max(120, 'Máximo de 120 caracteres.'),
  description: z.string().max(500, 'Máximo de 500 caracteres.'),
  prontuarioComponent: z
    .string()
    .trim()
    .refine((v) => v === '' || /^PRT(\.[A-Z0-9]+)+@\d+\.\d+$/.test(v.toUpperCase()), 'Use o formato PRT.CODIGO@1.0.'),
});
type ContainerValues = z.infer<typeof containerSchema>;

type ContainerTarget =
  | { kind: 'section'; mode: 'create' }
  | { kind: 'section'; mode: 'edit'; section: FormSectionDto }
  | { kind: 'group'; mode: 'create'; sectionId: string }
  | { kind: 'group'; mode: 'edit'; group: FormGroupDto };

type DeleteTarget =
  | { kind: 'section'; item: FormSectionDto }
  | { kind: 'group'; item: FormGroupDto }
  | { kind: 'field'; item: FormFieldDefinitionDto };

// =============================================================================
export function FormBuilderPage() {
  const { id: templateId = '' } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const access = useFormAccess();
  const queryClient = useQueryClient();
  const structureKey = ['form-structure', templateId];

  const [tab, setTab] = useState<'build' | 'preview'>('build');
  const [containerTarget, setContainerTarget] = useState<ContainerTarget | null>(null);
  const [fieldTarget, setFieldTarget] = useState<FieldModalTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Grupo ativo: destino dos componentes clicados na paleta (como no protótipo).
  const [active, setActive] = useState<{ sectionId: string; groupId: string | null } | null>(null);

  // ------------------------------------------------------------- LEITURA
  const { data: template } = useQuery({
    queryKey: ['form-template', templateId],
    enabled: !!templateId && access.canRead,
    queryFn: async () => (await formTemplatesControllerFindById(templateId)).data as FormTemplateDetailDto,
  });

  const {
    data: structure,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: structureKey,
    enabled: !!templateId && access.canRead,
    queryFn: async () => (await formStructureControllerGetStructure(templateId)).data as FormStructureDto,
  });

  // ------------------------------------------------------------- ESCRITA
  // Wrapper: toda mutação devolve a árvore → atualiza o cache e mostra feedback.
  const mutation = useMutation({
    mutationFn: async ({ run }: { run: () => Promise<{ data: unknown }>; success?: string }) =>
      (await run()).data as FormStructureDto,
    onSuccess: (tree, { success }) => {
      queryClient.setQueryData(structureKey, tree);
      if (success) setFeedback({ type: 'success', message: success });
      setContainerTarget(null);
      setFieldTarget(null);
      setDeleteTarget(null);
    },
    onError: (err) => setFeedback({ type: 'error', message: getErrorMessage(err, 'Não foi possível salvar.') }),
  });
  const run = (fn: () => Promise<{ data: unknown }>, success?: string) => mutation.mutate({ run: fn, success });

  // Seções / grupos
  const saveContainer = (values: ContainerValues) => {
    if (!containerTarget) return;
    const body = { title: values.title.trim(), description: values.description.trim() || undefined };
    const component = values.prontuarioComponent.trim().toUpperCase();
    if (containerTarget.kind === 'section') {
      if (containerTarget.mode === 'create')
        run(() => formStructureControllerCreateSection(templateId, body), 'Seção criada.');
      else
        run(
          () => formStructureControllerUpdateSection(templateId, containerTarget.section.id, {
            ...body,
            description: body.description ?? null,
          }),
          'Seção atualizada.',
        );
    } else if (containerTarget.mode === 'create') {
      run(
        () =>
          formStructureControllerCreateGroup(templateId, containerTarget.sectionId, {
            ...body,
            ...(component ? { prontuarioComponent: component } : {}),
          }),
        'Grupo criado.',
      );
    } else {
      run(
        () => formStructureControllerUpdateGroup(templateId, containerTarget.group.id, {
          ...body,
          description: body.description ?? null,
          prontuarioComponent: component || null,
        }),
        'Grupo atualizado.',
      );
    }
  };

  // Campos
  const createField = (data: CreateFormFieldDto) =>
    run(() => formStructureControllerCreateField(templateId, data), `Campo "${data.label}" criado.`);
  const updateField = (fieldId: string, data: UpdateFormFieldDto) =>
    run(() => formStructureControllerUpdateField(templateId, fieldId, data), 'Campo atualizado.');

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const { kind, item } = deleteTarget;
    if (kind === 'section') run(() => formStructureControllerRemoveSection(templateId, item.id), 'Seção excluída.');
    if (kind === 'group') run(() => formStructureControllerRemoveGroup(templateId, item.id), 'Grupo excluído.');
    if (kind === 'field') run(() => formStructureControllerRemoveField(templateId, item.id), 'Campo excluído.');
  };

  // Reordenação (setas ↑ ↓)
  const reorderSections = (index: number, delta: -1 | 1) => {
    const ids = moveIds(structure?.sections ?? [], index, delta);
    if (ids) run(() => formStructureControllerReorderSections(templateId, { orderedIds: ids }));
  };
  const reorderGroups = (section: FormSectionDto, index: number, delta: -1 | 1) => {
    const ids = moveIds(section.groups, index, delta);
    if (ids) run(() => formStructureControllerReorderGroups(templateId, section.id, { orderedIds: ids }));
  };
  const reorderFields = (
    fields: FormFieldDefinitionDto[],
    sectionId: string,
    groupId: string | null,
    index: number,
    delta: -1 | 1,
  ) => {
    const ids = moveIds(fields, index, delta);
    if (ids)
      run(() => formStructureControllerReorderFields(templateId, { orderedIds: ids, sectionId, groupId }));
  };

  // ------------------------------------------------------------- ESTADOS
  if (access.isLoading) return <LoadingState message="Verificando permissões..." />;
  if (!access.canRead || getStatus(error) === 403) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-10 w-10 text-amber-500" />}
        title="Acesso negado"
        description="Seu perfil não tem permissão para ver a estrutura desta ficha."
      />
    );
  }
  if (isLoading) return <LoadingState message="Carregando estrutura da ficha..." />;
  if (isError || !structure) {
    const status = getStatus(error);
    return (
      <ErrorState
        title={status === 404 ? 'Modelo não encontrado' : status === 503 ? 'Prontuário indisponível' : undefined}
        message={getErrorMessage(error, 'Erro ao carregar a estrutura.')}
        onRetry={() => refetch()}
      />
    );
  }

  const busy = mutation.isPending;
  // A API só deixa o DONO (ou ADMIN) alterar, e só com o modelo em Rascunho.
  const isOwner = isAdmin || (!!template && template.ownerId === user?.id);
  const canEdit = access.can('TEMPLATE_UPDATE') && structure.editable && isOwner;
  const fieldsAll = allFields(structure);
  const target = active ?? (structure.sections.length ? { sectionId: structure.sections[structure.sections.length - 1].id, groupId: null } : null);
  const targetLabel = (() => {
    if (!target) return null;
    const section = structure.sections.find((s) => s.id === target.sectionId);
    const group = section?.groups.find((g) => g.id === target.groupId);
    return section ? (group ? `${section.title} › ${group.title}` : section.title) : null;
  })();
  const addFromPalette = (type: FormFieldType) => {
    if (target) setFieldTarget({ mode: 'create', sectionId: target.sectionId, groupId: target.groupId, type });
  };
  const isActive = (sectionId: string, groupId: string | null) =>
    canEdit && target?.sectionId === sectionId && target?.groupId === groupId;

  // ------------------------------------------------------------- RENDER
  const renderField = (
    field: FormFieldDefinitionDto,
    index: number,
    list: FormFieldDefinitionDto[],
    sectionId: string,
    groupId: string | null,
  ) => {
    const meta = FIELD_TYPE_MAP[field.type];
    return (
      <li
        key={field.id}
        className="flex items-center gap-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2"
      >
        <span className="text-slate-500 shrink-0">{meta?.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{field.label}</span>
            {field.unit && <span className="text-xs text-slate-400">{field.unit}</span>}
            {field.required && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                <Asterisk className="h-3 w-3 mr-0.5" /> Obrigatório
              </Badge>
            )}
            {field.requiredWhen && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0" title={describeCondition(field.requiredWhen, fieldsAll)}>
                Obrigatório se {describeCondition(field.requiredWhen, fieldsAll)}
              </Badge>
            )}
            {field.visibleWhen && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0" title={describeCondition(field.visibleWhen, fieldsAll)}>
                <GitBranch className="h-3 w-3 mr-0.5" /> Condicional
              </Badge>
            )}
            {field.calculation && (
              <Badge variant="success" className="text-[10px] px-1.5 py-0">
                <Calculator className="h-3 w-3 mr-0.5" /> {FORMULA_LABELS[field.calculation.formula]?.label}
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-500 flex gap-2 flex-wrap">
            <span>{meta?.label ?? field.type}</span>
            <code className="text-[11px]">{field.key}</code>
            {field.prontuarioCode && <code className="text-[11px] text-blue-600">{field.prontuarioCode}</code>}
            {field.options.length > 0 && field.type !== 'YES_NO' && <span>{field.options.length} opções</span>}
            {field.visibleWhen && <span>exibe se {describeCondition(field.visibleWhen, fieldsAll)}</span>}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-0.5 shrink-0">
            <IconBtn label="Subir" disabled={busy || index === 0} onClick={() => reorderFields(list, sectionId, groupId, index, -1)}>
              <ArrowUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label="Descer"
              disabled={busy || index === list.length - 1}
              onClick={() => reorderFields(list, sectionId, groupId, index, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn label="Editar campo" onClick={() => setFieldTarget({ mode: 'edit', field })}>
              <Edit2 className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn label="Excluir campo" danger onClick={() => setDeleteTarget({ kind: 'field', item: field })}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        )}
      </li>
    );
  };

  const renderFieldList = (fields: FormFieldDefinitionDto[], sectionId: string, groupId: string | null) => (
    <div className="space-y-2">
      {fields.length === 0 ? (
        <p className="text-xs italic text-slate-400 px-1">Nenhum campo ainda.</p>
      ) : (
        <ul className="space-y-2">{fields.map((f, i) => renderField(f, i, fields, sectionId, groupId))}</ul>
      )}
      {canEdit && (
        <Button size="sm" variant="ghost" onClick={() => setFieldTarget({ mode: 'create', sectionId, groupId })}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar campo
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/form-templates"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Modelos de ficha
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">
            {template?.name ?? 'Construtor de ficha'}
          </h1>
          {template && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{template.code}</span>
              <span className="font-mono">v{template.version}</span>
              <Badge variant={template.status === 'RASCUNHO' ? 'secondary' : 'warning'}>{STATUS_LABELS[template.status]}</Badge>
              <span className="font-mono">SIGTAP {template.sigtapCode}</span>
            </div>
          )}
          <p className="text-sm text-slate-500 mt-1">
            {structure.sections.length} seções · {structure.fieldCount} campos · {structure.requiredCount} obrigatórios ·{' '}
            {structure.conditionalCount} condicionais · {structure.calculationCount} cálculos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === 'build' ? 'default' : 'outline'} size="sm" onClick={() => setTab('build')}>
            <Wrench className="h-4 w-4 mr-1" /> Montagem
          </Button>
          <Button variant={tab === 'preview' ? 'default' : 'outline'} size="sm" onClick={() => setTab('preview')}>
            <Eye className="h-4 w-4 mr-1" /> Pré-visualização
          </Button>
        </div>
      </div>

      {feedback && <ActionFeedback type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {!canEdit && tab === 'build' && (
        <ActionFeedback
          type="info"
          message={
            !structure.editable
              ? `Estrutura congelada: o modelo está "${template ? STATUS_LABELS[template.status] : 'fora de Rascunho'}". Só modelos em Rascunho podem ser alterados — para mudar, derive um novo modelo.`
              : 'Você está em modo somente leitura: só o dono do modelo, com perfil Configurador, edita a estrutura.'
          }
        />
      )}

      {tab === 'preview' ? (
        <FormPreview structure={structure} />
      ) : (
        <div className={canEdit ? 'grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4 items-start' : ''}>
        <div className="min-w-0">
          {structure.sections.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-10 w-10 text-slate-400" />}
              title="Ficha vazia"
              description="Comece criando uma seção (ex.: Identificação, Anamnese, Exame físico)."
              action={
                canEdit ? (
                  <Button onClick={() => setContainerTarget({ kind: 'section', mode: 'create' })}>
                    <Plus className="h-4 w-4 mr-1" /> Nova seção
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              {structure.sections.map((section, sIndex) => (
                <Card
                  key={section.id}
                  className={isActive(section.id, null) ? 'ring-2 ring-blue-500' : ''}
                  onClick={() => canEdit && setActive({ sectionId: section.id, groupId: null })}
                >
                  <CardContent className="p-4 space-y-4">
                    {/* Cabeçalho da seção */}
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-xs font-bold">
                        {sIndex + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-slate-900 dark:text-white">§{sIndex + 1} · {section.title}</h2>
                        {section.description && <p className="text-xs text-slate-500">{section.description}</p>}
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <IconBtn label="Subir seção" disabled={busy || sIndex === 0} onClick={() => reorderSections(sIndex, -1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn
                            label="Descer seção"
                            disabled={busy || sIndex === structure.sections.length - 1}
                            onClick={() => reorderSections(sIndex, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn label="Editar seção" onClick={() => setContainerTarget({ kind: 'section', mode: 'edit', section })}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn label="Excluir seção" danger onClick={() => setDeleteTarget({ kind: 'section', item: section })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconBtn>
                        </div>
                      )}
                    </div>

                    {/* Campos soltos da seção (fora de grupos) */}
                    {renderFieldList(section.fields, section.id, null)}

                    {/* Grupos */}
                    {section.groups.map((group, gIndex) => (
                      <div
                        key={group.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canEdit) setActive({ sectionId: section.id, groupId: group.id });
                        }}
                        className={`rounded-lg border border-dashed p-3 space-y-3 bg-slate-50/60 dark:bg-slate-900/40 ${
                          isActive(section.id, group.id) ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {group.title}
                              {group.prontuarioComponent && (
                                <code className="ml-2 text-[11px] font-normal text-blue-600">{group.prontuarioComponent}</code>
                              )}
                              {isActive(section.id, group.id) && (
                                <Badge variant="default" className="ml-2 text-[10px] px-1.5 py-0">
                                  Grupo ativo
                                </Badge>
                              )}
                            </h3>
                            {group.description && <p className="text-xs text-slate-500">{group.description}</p>}
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <IconBtn label="Subir grupo" disabled={busy || gIndex === 0} onClick={() => reorderGroups(section, gIndex, -1)}>
                                <ArrowUp className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                label="Descer grupo"
                                disabled={busy || gIndex === section.groups.length - 1}
                                onClick={() => reorderGroups(section, gIndex, 1)}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn label="Editar grupo" onClick={() => setContainerTarget({ kind: 'group', mode: 'edit', group })}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn label="Excluir grupo" danger onClick={() => setDeleteTarget({ kind: 'group', item: group })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconBtn>
                            </div>
                          )}
                        </div>
                        {renderFieldList(group.fields, section.id, group.id)}
                      </div>
                    ))}

                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setContainerTarget({ kind: 'group', mode: 'create', sectionId: section.id })}
                      >
                        <FolderPlus className="h-3.5 w-3.5 mr-1" /> Novo grupo
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}

              {canEdit && (
                <Button variant="outline" className="w-full" onClick={() => setContainerTarget({ kind: 'section', mode: 'create' })}>
                  <Plus className="h-4 w-4 mr-1" /> Nova seção
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Paleta de componentes */}
        {canEdit && (
          <aside className="lg:sticky lg:top-4">
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Componentes</p>
                <p className="text-xs text-slate-500">
                  {targetLabel ? (
                    <>
                      Clique para adicionar em <strong className="text-slate-700 dark:text-slate-200">{targetLabel}</strong>.
                      Clique em uma seção ou grupo para torná-lo ativo.
                    </>
                  ) : (
                    'Crie uma seção para começar a adicionar campos.'
                  )}
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-1">
                  {FIELD_TYPES.map((meta) => (
                    <button
                      key={meta.type}
                      type="button"
                      disabled={!target || busy}
                      onClick={() => addFromPalette(meta.type)}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50"
                    >
                      <span className="text-blue-600">{meta.icon}</span>
                      {meta.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>
        )}
        </div>
      )}

      {/* Modais */}
      {containerTarget && (
        <ContainerModal
          target={containerTarget}
          isLoading={busy}
          onClose={() => setContainerTarget(null)}
          onSubmit={saveContainer}
        />
      )}

      {fieldTarget && (
        <FieldFormModal
          target={fieldTarget}
          sections={structure.sections}
          isLoading={busy}
          onClose={() => setFieldTarget(null)}
          onCreate={createField}
          onUpdate={updateField}
        />
      )}

      {deleteTarget && (
        <Modal title="Confirmar exclusão" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {deleteTarget.kind === 'field' && <>Excluir o campo <strong>{deleteTarget.item.label}</strong>?</>}
            {deleteTarget.kind === 'group' && (
              <>Excluir o grupo <strong>{deleteTarget.item.title}</strong> e todos os campos dentro dele?</>
            )}
            {deleteTarget.kind === 'section' && (
              <>Excluir a seção <strong>{deleteTarget.item.title}</strong> com todos os grupos e campos?</>
            )}
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" isLoading={busy} onClick={confirmDelete}>
              Excluir
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =============================================================================
// Componentes auxiliares
// =============================================================================
function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={`h-7 w-7 p-0 ${danger ? 'text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30' : 'text-slate-500'}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ContainerModal({
  target,
  isLoading,
  onClose,
  onSubmit,
}: {
  target: ContainerTarget;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (values: ContainerValues) => void;
}) {
  const current =
    target.mode === 'edit' ? (target.kind === 'section' ? target.section : target.group) : null;
  const noun = target.kind === 'section' ? 'seção' : 'grupo';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContainerValues>({
    resolver: zodResolver(containerSchema),
    defaultValues: {
      title: current?.title ?? '',
      description: current?.description ?? '',
      prontuarioComponent: target.mode === 'edit' && target.kind === 'group' ? (target.group.prontuarioComponent ?? '') : '',
    },
  });

  return (
    <Modal title={target.mode === 'create' ? `Nova ${noun}` : `Editar ${noun}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Título *</label>
          <Input
            {...register('title')}
            autoFocus
            placeholder={target.kind === 'section' ? 'Ex.: Anamnese' : 'Ex.: Sinais vitais'}
          />
          {errors.title && <p className="text-xs text-red-600">{errors.title.message}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Descrição</label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
          />
          {errors.description && <p className="text-xs text-red-600">{errors.description.message}</p>}
        </div>
        {target.kind === 'group' && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Componente do Prontuário</label>
            <Input {...register('prontuarioComponent')} placeholder="Ex.: PRT.ANTRO@1.2" className="font-mono uppercase" />
            {errors.prontuarioComponent && <p className="text-xs text-red-600">{errors.prontuarioComponent.message}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
