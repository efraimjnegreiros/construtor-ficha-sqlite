// // =============================================================================
// // FormTemplatesPage — Construtor de Fichas: modelos de ficha (rota /form-templates)
// // -----------------------------------------------------------------------------
// // Mesmo padrão da categories-page.tsx:
// //   - Busca/paginação guardadas na URL (useSearchParams)
// //   - Leitura com useQuery e escrita com useMutation (TanStack Query)
// //   - Formulário com React Hook Form + Zod (espelha o CreateFormTemplateDto)
// //   - Estados de UX: Loading, Error, Empty e ActionFeedback
// // Específico deste módulo:
// //   - RBAC granular: botões de criar/editar/excluir aparecem conforme as
// //     permissões de GET /form-access/me (a API continua sendo a autoridade).
// //   - Tratamento dedicado de 403 (sem permissão) e 503 (prontuário indisponível).
// //   - Modal de detalhes (somente leitura) usando GET /form-templates/:id.
// // As funções formTemplatesController* são GERADAS pelo Orval (npm run api:generate).
// // =============================================================================
// import { useEffect, useState } from 'react';
// import { useSearchParams } from 'react-router-dom';
// import { useForm } from 'react-hook-form';
// import { zodResolver } from '@hookform/resolvers/zod';
// import { z } from 'zod';
// import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
// import {
//   ChevronLeft,
//   ChevronRight,
//   ClipboardList,
//   Edit2,
//   Eye,
//   Lock,
//   Plus,
//   Search,
//   ShieldAlert,
//   Trash2,
//   X,
// } from 'lucide-react';
// import { useAuth } from '../context/auth-context';
// import { useFormAccess } from '../hooks/use-form-access';
// import { Badge } from '../components/ui/badge';
// import { Button } from '../components/ui/button';
// import { Card, CardContent } from '../components/ui/card';
// import { Input } from '../components/ui/input';
// import { ActionFeedback, EmptyState, ErrorState, LoadingState } from '../components/ui/state-feedback';
// import {
//   formTemplatesControllerCreate,
//   formTemplatesControllerFindAll,
//   formTemplatesControllerFindById,
//   formTemplatesControllerRemove,
//   formTemplatesControllerUpdate,
// } from '../lib/api-client';
// import type { FormTemplateDto, PaginatedFormTemplatesResponseDto } from '../lib/api-client/models';

// const PAGE_SIZE = 12;
// const NAME_MAX = 120;
// const DESCRIPTION_MAX = 500;

// const ROLE_LABELS: Record<string, string> = {
//   CONFIGURADOR: 'Configurador',
//   PREENCHIMENTO: 'Preenchimento',
//   SUPERVISAO: 'Supervisão',
// };

// // Validação no FRONT — espelha as regras de CreateFormTemplateDto/UpdateFormTemplateDto.
// const templateFormSchema = z.object({
//   name: z
//     .string()
//     .trim()
//     .min(3, 'O nome deve ter no mínimo 3 caracteres.')
//     .max(NAME_MAX, `O nome deve ter no máximo ${NAME_MAX} caracteres.`),
//   description: z.string().max(DESCRIPTION_MAX, `A descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`),
// });

// type TemplateFormValues = z.infer<typeof templateFormSchema>;

// interface ApiError {
//   status?: number;
//   detail?: string;
//   message?: string;
// }

// function getStatus(err: unknown): number | undefined {
//   return (err as ApiError)?.status;
// }

// function getErrorMessage(err: unknown, fallback: string): string {
//   return (err as ApiError)?.detail || (err as ApiError)?.message || fallback;
// }

// function formatDate(iso: string): string {
//   const date = new Date(iso);
//   if (Number.isNaN(date.getTime())) return '—';
//   return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
// }

// function formatDateTime(iso: string): string {
//   const date = new Date(iso);
//   if (Number.isNaN(date.getTime())) return '—';
//   return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
// }

// export function FormTemplatesPage() {
//   const { user, isAdmin } = useAuth();
//   const access = useFormAccess();
//   const queryClient = useQueryClient();
//   const [searchParams, setSearchParams] = useSearchParams();

//   const page = Number(searchParams.get('page')) || 1;
//   const search = searchParams.get('search') || '';

//   // formTarget: null = fechado | 'new' = criando | FormTemplateDto = editando
//   const [formTarget, setFormTarget] = useState<'new' | FormTemplateDto | null>(null);
//   const [detailId, setDetailId] = useState<string | null>(null);
//   const [deleteTarget, setDeleteTarget] = useState<FormTemplateDto | null>(null);
//   const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

//   const updateParams = (newParams: Record<string, string | number | undefined>) => {
//     const updated = new URLSearchParams(searchParams);
//     for (const [key, value] of Object.entries(newParams)) {
//       if (value === undefined || value === '') updated.delete(key);
//       else updated.set(key, String(value));
//     }
//     setSearchParams(updated);
//   };

//   const canCreate = access.can('TEMPLATE_CREATE');
//   const canSeeAll = access.can('TEMPLATE_READ_ALL');
//   // A API só deixa editar/excluir o DONO do modelo (ou um ADMIN do sistema).
//   const canMutate = (template: FormTemplateDto, permission: 'TEMPLATE_UPDATE' | 'TEMPLATE_DELETE') =>
//     access.can(permission) && (isAdmin || template.ownerId === user?.id);

//   // ---------------------------------------------------------------------------
//   // LEITURA — só dispara quando o perfil permite ler modelos
//   // ---------------------------------------------------------------------------
//   const {
//     data: listData,
//     isLoading: isLoadingList,
//     isError,
//     error,
//     refetch,
//   } = useQuery({
//     queryKey: ['form-templates', { page, search }],
//     enabled: access.canRead,
//     queryFn: async () => {
//       const res = await formTemplatesControllerFindAll({
//         page,
//         pageSize: PAGE_SIZE,
//         ...(search ? { search } : {}),
//       });
//       return res.data as PaginatedFormTemplatesResponseDto;
//     },
//   });

//   const templates: FormTemplateDto[] = listData?.data ?? [];
//   const meta = listData?.meta ?? { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };

//   const invalidate = () => queryClient.invalidateQueries({ queryKey: ['form-templates'] });

//   // ---------------------------------------------------------------------------
//   // ESCRITA
//   // ---------------------------------------------------------------------------
//   const saveMutation = useMutation({
//     mutationFn: async ({ id, data }: { id?: string; data: TemplateFormValues }) => {
//       const description = data.description.trim();
//       if (id) {
//         // Na edição, texto vazio vira null (limpa a descrição no banco).
//         const res = await formTemplatesControllerUpdate(id, { name: data.name, description: description || null });
//         return res.data;
//       }
//       const res = await formTemplatesControllerCreate({
//         name: data.name,
//         ...(description ? { description } : {}),
//       });
//       return res.data;
//     },
//     onSuccess: (_data, variables) => {
//       setFeedback({
//         type: 'success',
//         message: variables.id
//           ? 'Modelo atualizado com sucesso!'
//           : `Modelo "${variables.data.name}" criado com sucesso!`,
//       });
//       setFormTarget(null);
//       invalidate();
//       if (variables.id) queryClient.invalidateQueries({ queryKey: ['form-template', variables.id] });
//     },
//     onError: (err: unknown) => {
//       setFeedback({ type: 'error', message: friendlyWriteError(err, 'Não foi possível salvar o modelo.') });
//     },
//   });

//   const deleteMutation = useMutation({
//     mutationFn: async (id: string) => {
//       await formTemplatesControllerRemove(id);
//     },
//     onSuccess: () => {
//       setFeedback({ type: 'success', message: 'Modelo excluído.' });
//       setDeleteTarget(null);
//       invalidate();
//     },
//     onError: (err: unknown) => {
//       setDeleteTarget(null);
//       setFeedback({ type: 'error', message: friendlyWriteError(err, 'Falha ao excluir o modelo.') });
//     },
//   });

//   // ---------------------------------------------------------------------------
//   // Render
//   // ---------------------------------------------------------------------------
//   return (
//     <div className="space-y-6">
//       {/* Cabeçalho */}
//       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
//         <div>
//           <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
//             <ClipboardList className="h-6 w-6 text-blue-600" />
//             Construtor de Fichas
//           </h1>
//           <p className="text-sm text-slate-500 dark:text-slate-400">
//             {canSeeAll
//               ? 'Acompanhe os modelos de ficha de todos os configuradores (somente leitura).'
//               : 'Crie e mantenha os modelos de ficha que serão preenchidos no prontuário.'}
//           </p>
//           {access.roles.length > 0 && (
//             <div className="mt-2 flex flex-wrap items-center gap-1.5">
//               <span className="text-xs text-slate-500">Seu perfil:</span>
//               {access.roles.map((role) => (
//                 <Badge key={role} variant="secondary">
//                   {ROLE_LABELS[role] ?? role}
//                 </Badge>
//               ))}
//             </div>
//           )}
//         </div>

//         {canCreate && (
//           <Button onClick={() => setFormTarget('new')} className="gap-1.5 shrink-0">
//             <Plus className="h-4 w-4" />
//             Novo Modelo
//           </Button>
//         )}
//       </div>

//       {access.isMock && (
//         <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
//           <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
//           <span>
//             Os perfis de acesso desta tela vêm de um <strong>mock de primeira fase</strong>: a atribuição real de
//             perfis por usuário ainda não existe.
//           </span>
//         </div>
//       )}

//       {feedback && (
//         <ActionFeedback type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
//       )}

//       {/* Corpo: depende primeiro do perfil de acesso */}
//       {access.isLoading ? (
//         <LoadingState message="Verificando permissões..." />
//       ) : access.isError ? (
//         <ErrorState
//           title="Não foi possível verificar suas permissões"
//           message="Recarregue a página para tentar novamente."
//         />
//       ) : !access.canRead ? (
//         <EmptyState
//           icon={<Lock className="h-6 w-6" />}
//           title="Seu perfil não tem acesso aos modelos de ficha"
//           description="Peça a um administrador o perfil Configurador (para criar modelos) ou Supervisão (para acompanhá-los)."
//         />
//       ) : (
//         <>
//           {/* Busca por nome */}
//           <Card>
//             <CardContent className="p-4">
//               <div className="relative max-w-sm">
//                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
//                 <input
//                   type="text"
//                   aria-label="Buscar modelos por nome"
//                   placeholder="Buscar por nome..."
//                   maxLength={120}
//                   defaultValue={search}
//                   onChange={(e) => updateParams({ search: e.target.value || undefined, page: 1 })}
//                   className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
//                 />
//               </div>
//             </CardContent>
//           </Card>

//           {isLoadingList ? (
//             <LoadingState message="Carregando modelos..." />
//           ) : isError ? (
//             <ListError error={error} onRetry={() => refetch()} />
//           ) : templates.length === 0 ? (
//             <EmptyState
//               icon={<ClipboardList className="h-6 w-6" />}
//               title="Nenhum modelo encontrado"
//               description={
//                 search
//                   ? 'Nenhum modelo corresponde à busca.'
//                   : canCreate
//                     ? 'Você ainda não criou modelos de ficha.'
//                     : 'Ainda não há modelos cadastrados.'
//               }
//               action={
//                 search ? (
//                   <Button variant="outline" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>
//                     Limpar busca
//                   </Button>
//                 ) : canCreate ? (
//                   <Button size="sm" onClick={() => setFormTarget('new')}>
//                     Criar primeiro modelo
//                   </Button>
//                 ) : undefined
//               }
//             />
//           ) : (
//             <div className="space-y-4">
//               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//                 {templates.map((template) => (
//                   <Card key={template.id} className="shadow-sm">
//                     <CardContent className="p-4 flex flex-col gap-3 h-full">
//                       <div className="flex items-start justify-between gap-2">
//                         <div className="min-w-0">
//                           <p className="font-semibold text-sm text-slate-900 dark:text-white truncate" title={template.name}>
//                             {template.name}
//                           </p>
//                           <p className="text-xs text-slate-500 mt-0.5">
//                             Atualizado em {formatDate(template.updatedAt)}
//                             {canSeeAll && (
//                               <span className="ml-1 text-slate-400">· dono {template.ownerId.slice(0, 8)}</span>
//                             )}
//                           </p>
//                         </div>
//                         {template.ownerId === user?.id && <Badge variant="outline">Meu</Badge>}
//                       </div>

//                       <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 min-h-[3rem]">
//                         {template.description || <span className="italic text-slate-400">Sem descrição</span>}
//                       </p>

//                       <div className="flex items-center justify-end gap-1 pt-2 mt-auto border-t border-slate-100 dark:border-slate-800">
//                         <Button
//                           size="sm"
//                           variant="ghost"
//                           className="h-8 w-8 p-0"
//                           title="Ver detalhes"
//                           aria-label={`Ver detalhes de ${template.name}`}
//                           onClick={() => setDetailId(template.id)}
//                         >
//                           <Eye className="h-3.5 w-3.5 text-slate-500" />
//                         </Button>
//                         {canMutate(template, 'TEMPLATE_UPDATE') && (
//                           <Button
//                             size="sm"
//                             variant="ghost"
//                             className="h-8 w-8 p-0"
//                             title="Editar modelo"
//                             aria-label={`Editar ${template.name}`}
//                             onClick={() => setFormTarget(template)}
//                           >
//                             <Edit2 className="h-3.5 w-3.5 text-slate-500" />
//                           </Button>
//                         )}
//                         {canMutate(template, 'TEMPLATE_DELETE') && (
//                           <Button
//                             size="sm"
//                             variant="ghost"
//                             className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
//                             title="Excluir modelo"
//                             aria-label={`Excluir ${template.name}`}
//                             onClick={() => setDeleteTarget(template)}
//                           >
//                             <Trash2 className="h-3.5 w-3.5" />
//                           </Button>
//                         )}
//                       </div>
//                     </CardContent>
//                   </Card>
//                 ))}
//               </div>

//               {/* Paginação */}
//               <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500">
//                 <div>
//                   Mostrando <strong>{templates.length}</strong> de <strong>{meta.total}</strong> modelos
//                 </div>
//                 <div className="flex items-center gap-1.5">
//                   <Button
//                     variant="outline"
//                     size="sm"
//                     className="h-8 px-2"
//                     aria-label="Página anterior"
//                     disabled={meta.page <= 1}
//                     onClick={() => updateParams({ page: Math.max(1, meta.page - 1) })}
//                   >
//                     <ChevronLeft className="h-4 w-4" />
//                   </Button>
//                   <span className="px-2 font-medium">
//                     {meta.page} de {meta.totalPages}
//                   </span>
//                   <Button
//                     variant="outline"
//                     size="sm"
//                     className="h-8 px-2"
//                     aria-label="Próxima página"
//                     disabled={meta.page >= meta.totalPages}
//                     onClick={() => updateParams({ page: meta.page + 1 })}
//                   >
//                     <ChevronRight className="h-4 w-4" />
//                   </Button>
//                 </div>
//               </div>
//             </div>
//           )}
//         </>
//       )}

//       {/* Modais */}
//       {formTarget && (
//         <TemplateFormModal
//           key={formTarget === 'new' ? 'new' : formTarget.id}
//           template={formTarget === 'new' ? null : formTarget}
//           isLoading={saveMutation.isPending}
//           onClose={() => setFormTarget(null)}
//           onSubmit={(data) => {
//             setFeedback(null);
//             saveMutation.mutate({ id: formTarget === 'new' ? undefined : formTarget.id, data });
//           }}
//         />
//       )}

//       {detailId && <TemplateDetailModal id={detailId} canSeeAll={canSeeAll} onClose={() => setDetailId(null)} />}

//       {deleteTarget && (
//         <ConfirmDeleteModal
//           template={deleteTarget}
//           isLoading={deleteMutation.isPending}
//           onCancel={() => setDeleteTarget(null)}
//           onConfirm={() => {
//             setFeedback(null);
//             deleteMutation.mutate(deleteTarget.id);
//           }}
//         />
//       )}
//     </div>
//   );
// }

// // 403/404/409/503 em escrita: mensagens mais úteis que o texto genérico.
// function friendlyWriteError(err: unknown, fallback: string): string {
//   switch (getStatus(err)) {
//     case 403:
//       return 'Você não tem permissão para esta ação.';
//     case 404:
//       return 'Este modelo não existe mais (talvez tenha sido excluído por outra pessoa).';
//     case 503:
//       return 'O prontuário está indisponível no momento. Tente novamente em instantes.';
//     default:
//       // 400/409 trazem a mensagem exata no campo `detail` (ex.: "Já existe um modelo chamado ...").
//       return getErrorMessage(err, fallback);
//   }
// }

// function ListError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
//   const status = getStatus(error);
//   if (status === 403) {
//     return (
//       <EmptyState
//         icon={<Lock className="h-6 w-6" />}
//         title="Acesso negado"
//         description="Seu perfil não pode listar modelos de ficha."
//       />
//     );
//   }
//   if (status === 503) {
//     return (
//       <ErrorState
//         title="Prontuário indisponível"
//         message="O serviço de prontuário não está respondendo. Os modelos voltam a aparecer assim que ele for restabelecido."
//         onRetry={onRetry}
//       />
//     );
//   }
//   return (
//     <ErrorState
//       title="Erro ao buscar modelos"
//       message="Não foi possível carregar os modelos no momento."
//       onRetry={onRetry}
//     />
//   );
// }

// // =============================================================================
// // Estrutura base dos modais (fecha com Esc e clique no fundo)
// // =============================================================================
// function ModalShell({
//   title,
//   subtitle,
//   onClose,
//   children,
// }: {
//   title: string;
//   subtitle?: string;
//   onClose: () => void;
//   children: React.ReactNode;
// }) {
//   useEffect(() => {
//     const onKey = (e: KeyboardEvent) => {
//       if (e.key === 'Escape') onClose();
//     };
//     window.addEventListener('keydown', onKey);
//     return () => window.removeEventListener('keydown', onKey);
//   }, [onClose]);

//   return (
//     <div
//       className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
//       onMouseDown={(e) => {
//         if (e.target === e.currentTarget) onClose();
//       }}
//     >
//       <div
//         role="dialog"
//         aria-modal="true"
//         aria-label={title}
//         className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 relative"
//       >
//         <button
//           type="button"
//           aria-label="Fechar"
//           onClick={onClose}
//           className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
//         >
//           <X className="h-5 w-5" />
//         </button>
//         <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 pr-6">{title}</h3>
//         {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{subtitle}</p>}
//         {children}
//       </div>
//     </div>
//   );
// }

// // =============================================================================
// // Criar / editar
// // =============================================================================
// function TemplateFormModal({
//   template,
//   isLoading,
//   onClose,
//   onSubmit,
// }: {
//   template: FormTemplateDto | null;
//   isLoading: boolean;
//   onClose: () => void;
//   onSubmit: (data: TemplateFormValues) => void;
// }) {
//   const {
//     register,
//     handleSubmit,
//     watch,
//     formState: { errors },
//   } = useForm<TemplateFormValues>({
//     resolver: zodResolver(templateFormSchema),
//     defaultValues: { name: template?.name ?? '', description: template?.description ?? '' },
//   });

//   const descriptionLength = watch('description')?.length ?? 0;

//   return (
//     <ModalShell
//       title={template ? 'Editar Modelo' : 'Novo Modelo de Ficha'}
//       subtitle="Defina o nome e a descrição. Os campos da ficha serão configurados em uma próxima etapa."
//       onClose={onClose}
//     >
//       <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
//         <Input
//           label="Nome"
//           placeholder="Ex.: Anamnese inicial"
//           maxLength={NAME_MAX + 20}
//           autoFocus
//           {...register('name')}
//           error={errors.name?.message}
//         />

//         <div className="flex flex-col gap-1.5">
//           <label htmlFor="description" className="text-sm font-medium text-slate-700 dark:text-slate-300">
//             Descrição <span className="text-slate-400 font-normal">(opcional)</span>
//           </label>
//           <textarea
//             id="description"
//             rows={4}
//             placeholder="Ex.: Ficha de primeira consulta"
//             {...register('description')}
//             className={`flex w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 resize-y ${
//               errors.description
//                 ? 'border-red-500 focus-visible:ring-red-500'
//                 : 'border-slate-300 dark:border-slate-700 focus-visible:ring-blue-500'
//             }`}
//           />
//           <div className="flex items-center justify-between text-xs">
//             <span className="text-red-500">{errors.description?.message}</span>
//             <span className={descriptionLength > DESCRIPTION_MAX ? 'text-red-500' : 'text-slate-400'}>
//               {descriptionLength}/{DESCRIPTION_MAX}
//             </span>
//           </div>
//         </div>

//         <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
//           <Button type="button" variant="outline" size="sm" onClick={onClose}>
//             Cancelar
//           </Button>
//           <Button type="submit" size="sm" isLoading={isLoading}>
//             {template ? 'Salvar Alterações' : 'Criar Modelo'}
//           </Button>
//         </div>
//       </form>
//     </ModalShell>
//   );
// }

// // =============================================================================
// // Detalhes (somente leitura) — GET /form-templates/:id
// // =============================================================================
// function TemplateDetailModal({ id, canSeeAll, onClose }: { id: string; canSeeAll: boolean; onClose: () => void }) {
//   const { data, isLoading, isError, error } = useQuery({
//     queryKey: ['form-template', id],
//     queryFn: async () => (await formTemplatesControllerFindById(id)).data as FormTemplateDto,
//   });

//   return (
//     <ModalShell title={data?.name ?? 'Detalhes do Modelo'} onClose={onClose}>
//       {isLoading ? (
//         <LoadingState message="Carregando modelo..." />
//       ) : isError || !data ? (
//         <p className="text-sm text-red-500">
//           {getStatus(error) === 404
//             ? 'Este modelo não existe mais.'
//             : getStatus(error) === 403
//               ? 'Você não tem acesso a este modelo.'
//               : getErrorMessage(error, 'Não foi possível carregar o modelo.')}
//         </p>
//       ) : (
//         <dl className="space-y-3 text-sm">
//           <div>
//             <dt className="text-xs font-medium text-slate-500">Descrição</dt>
//             <dd className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
//               {data.description || <span className="italic text-slate-400">Sem descrição</span>}
//             </dd>
//           </div>
//           <div className="grid grid-cols-2 gap-3">
//             <div>
//               <dt className="text-xs font-medium text-slate-500">Criado em</dt>
//               <dd className="text-slate-800 dark:text-slate-200">{formatDateTime(data.createdAt)}</dd>
//             </div>
//             <div>
//               <dt className="text-xs font-medium text-slate-500">Atualizado em</dt>
//               <dd className="text-slate-800 dark:text-slate-200">{formatDateTime(data.updatedAt)}</dd>
//             </div>
//           </div>
//           {canSeeAll && (
//             <div>
//               <dt className="text-xs font-medium text-slate-500">Dono</dt>
//               <dd className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all">{data.ownerId}</dd>
//             </div>
//           )}
//         </dl>
//       )}
//       <div className="flex justify-end pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
//         <Button type="button" variant="outline" size="sm" onClick={onClose}>
//           Fechar
//         </Button>
//       </div>
//     </ModalShell>
//   );
// }

// // =============================================================================
// // Confirmação de exclusão
// // =============================================================================
// function ConfirmDeleteModal({
//   template,
//   isLoading,
//   onCancel,
//   onConfirm,
// }: {
//   template: FormTemplateDto;
//   isLoading: boolean;
//   onCancel: () => void;
//   onConfirm: () => void;
// }) {
//   return (
//     <ModalShell title="Excluir modelo?" onClose={onCancel}>
//       <p className="text-sm text-slate-600 dark:text-slate-300">
//         O modelo <strong>{template.name}</strong> deixará de aparecer na lista. A exclusão é lógica: o registro é
//         preservado no banco.
//       </p>
//       <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
//         <Button type="button" variant="outline" size="sm" onClick={onCancel}>
//           Cancelar
//         </Button>
//         <Button type="button" variant="destructive" size="sm" isLoading={isLoading} onClick={onConfirm}>
//           Excluir
//         </Button>
//       </div>
//     </ModalShell>
//   );
// }
// =============================================================================
// FormTemplatesPage — Construtor de Fichas: cadastro e governança de modelos (rota /form-templates)
// -----------------------------------------------------------------------------
// Mesmo padrão da categories-page.tsx:
//   - Busca, filtros, aba de status e paginação guardados na URL (useSearchParams)
//   - Leitura com useQuery e escrita com useMutation (TanStack Query)
//   - Formulário com React Hook Form + Zod (espelha o CreateFormTemplateDto)
//   - Estados de UX: Loading, Error, Empty e ActionFeedback
// Regras de negócio (protótipo "Governança de modelos"):
//   - Cadastro da ficha dentro do modelo: código FC-xxxx (gerado pela API), nome,
//     área clínica, SIGTAP, responsável, complexidade, componentes do Prontuário.
//   - Ciclo de vida: Rascunho → Em revisão → Aprovado → Publicado ⇄ Suspenso → Inativo.
//     Aprovar, publicar e suspender exigem o perfil de Supervisor (TEMPLATE_REVIEW).
//   - Só Rascunho pode ser editado/excluído; para alterar um publicado, derive.
//   - Histórico de versões (data, nota e autor) no modal de detalhes.
// RBAC granular: botões aparecem conforme GET /form-access/me (a API continua sendo a autoridade).
// As funções formTemplatesController* são GERADAS pelo Orval (npm run api:generate).
// =============================================================================
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  LayoutList,
  Edit2,
  Eye,
  History,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { useFormAccess } from '../hooks/use-form-access';
import { Badge, type BadgeProps } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { ActionFeedback, EmptyState, ErrorState, LoadingState } from '../components/ui/state-feedback';
import {
  formTemplatesControllerCreate,
  formTemplatesControllerDerive,
  formTemplatesControllerFindAll,
  formTemplatesControllerFindById,
  formTemplatesControllerRemove,
  formTemplatesControllerTransition,
  formTemplatesControllerUpdate,
} from '../lib/api-client';
import type {
  ClinicalArea,
  FormTemplateAction,
  FormTemplateComplexity,
  FormTemplateDetailDto,
  FormTemplateDto,
  FormTemplateStatus,
  FormTemplateStatusCountsDto,
  PaginatedFormTemplatesResponseDto,
} from '../lib/api-client/models';

const PAGE_SIZE = 12;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const NOTE_MAX = 300;
const SIGTAP_PATTERN = /^\d{2}\.\d{2}\.\d{2}\.\d{3}-\d$/;
const COMPONENT_PATTERN = /^PRT(\.[A-Z0-9]+)+@\d+\.\d+$/;

const ROLE_LABELS: Record<string, string> = {
  CONFIGURADOR: 'Configurador',
  PREENCHIMENTO: 'Preenchimento',
  SUPERVISAO: 'Supervisão',
};

export const STATUS_LABELS: Record<FormTemplateStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_REVISAO: 'Em revisão',
  APROVADO: 'Aprovado',
  PUBLICADO: 'Publicado',
  SUSPENSO: 'Suspenso',
  INATIVO: 'Inativo',
};

const STATUS_VARIANTS: Record<FormTemplateStatus, BadgeProps['variant']> = {
  RASCUNHO: 'secondary',
  EM_REVISAO: 'warning',
  APROVADO: 'default',
  PUBLICADO: 'success',
  SUSPENSO: 'destructive',
  INATIVO: 'outline',
};

const STATUS_ORDER: FormTemplateStatus[] = ['RASCUNHO', 'EM_REVISAO', 'APROVADO', 'PUBLICADO', 'SUSPENSO', 'INATIVO'];

export const AREA_LABELS: Record<ClinicalArea, string> = {
  ENFERMAGEM: 'Enfermagem',
  NUTRICAO: 'Nutrição',
  CLINICA_MEDICA: 'Clínica Médica',
  FISIOTERAPIA: 'Fisioterapia',
  ODONTOLOGIA: 'Odontologia',
  PSICOLOGIA: 'Psicologia',
  OBSTETRICIA: 'Obstetrícia',
};

const COMPLEXITY_LABELS: Record<FormTemplateComplexity, string> = {
  SIMPLES: 'Simples',
  COMPLEXA: 'Complexa',
  LONGITUDINAL: 'Longitudinal',
};

// Ações do ciclo de vida — espelham a matriz TRANSITIONS da API.
interface ActionRule {
  label: string;
  from: FormTemplateStatus[];
  who: 'owner' | 'review' | 'owner-or-review';
  noteRequired: boolean;
  variant: 'default' | 'outline' | 'destructive';
}

const ACTIONS: Record<FormTemplateAction, ActionRule> = {
  ENVIAR_REVISAO: { label: 'Enviar para revisão', from: ['RASCUNHO'], who: 'owner', noteRequired: false, variant: 'default' },
  APROVAR: { label: 'Aprovar', from: ['EM_REVISAO'], who: 'review', noteRequired: false, variant: 'default' },
  DEVOLVER: { label: 'Devolver p/ rascunho', from: ['EM_REVISAO', 'APROVADO'], who: 'review', noteRequired: true, variant: 'outline' },
  PUBLICAR: { label: 'Publicar', from: ['APROVADO'], who: 'review', noteRequired: false, variant: 'default' },
  SUSPENDER: { label: 'Suspender', from: ['PUBLICADO'], who: 'review', noteRequired: true, variant: 'outline' },
  REATIVAR: { label: 'Reativar', from: ['SUSPENSO'], who: 'review', noteRequired: false, variant: 'default' },
  INATIVAR: {
    label: 'Inativar',
    from: ['RASCUNHO', 'EM_REVISAO', 'APROVADO', 'PUBLICADO', 'SUSPENSO'],
    who: 'owner-or-review',
    noteRequired: true,
    variant: 'destructive',
  },
};

// Validação no FRONT — espelha as regras de CreateFormTemplateDto/UpdateFormTemplateDto.
const templateFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'O nome deve ter no mínimo 3 caracteres.')
    .max(NAME_MAX, `O nome deve ter no máximo ${NAME_MAX} caracteres.`),
  clinicalArea: z.enum(Object.keys(AREA_LABELS) as [ClinicalArea, ...ClinicalArea[]], {
    message: 'Selecione a área clínica.',
  }),
  sigtapCode: z.string().trim().regex(SIGTAP_PATTERN, 'O código SIGTAP deve seguir o formato 00.00.00.000-0.'),
  responsibleName: z
    .string()
    .trim()
    .min(3, 'O responsável deve ter no mínimo 3 caracteres.')
    .max(NAME_MAX, `O responsável deve ter no máximo ${NAME_MAX} caracteres.`),
  complexity: z.enum(['SIMPLES', 'COMPLEXA', 'LONGITUDINAL']),
  prontuarioComponents: z.string().refine(
    (value) => parseComponents(value).every((c) => COMPONENT_PATTERN.test(c)),
    'Use o formato PRT.CODIGO@1.0, separados por vírgula.',
  ),
  description: z.string().max(DESCRIPTION_MAX, `A descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`),
  versionNote: z.string().max(NOTE_MAX, `A nota da versão deve ter no máximo ${NOTE_MAX} caracteres.`),
});

type TemplateFormValues = z.infer<typeof templateFormSchema>;

interface ApiError {
  status?: number;
  detail?: string;
  message?: string;
}

function getStatus(err: unknown): number | undefined {
  return (err as ApiError)?.status;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.detail || (err as ApiError)?.message || fallback;
}

function parseComponents(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n;]/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

// Máscara simples do SIGTAP: 0301010048 → 03.01.01.004-8
function maskSigtap(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6), d.slice(6, 9)].filter(Boolean);
  let out = parts.join('.');
  if (d.length > 9) out += `-${d.slice(9)}`;
  return out;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const selectClass =
  'flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

export function FormTemplatesPage() {
  const { user, isAdmin } = useAuth();
  const access = useFormAccess();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;
  const search = searchParams.get('search') || '';
  const status = (searchParams.get('status') || '') as FormTemplateStatus | '';
  const clinicalArea = (searchParams.get('area') || '') as ClinicalArea | '';
  const sigtapCode = searchParams.get('sigtap') || '';
  const responsible = searchParams.get('responsible') || '';
  const hasFilters = Boolean(search || clinicalArea || sigtapCode || responsible);

  // formTarget: null = fechado | 'new' = criando | FormTemplateDto = editando
  const [formTarget, setFormTarget] = useState<'new' | FormTemplateDto | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormTemplateDto | null>(null);
  // deriveSource: null = fechado | 'pick' = escolher a origem | FormTemplateDto = origem já definida
  const [deriveSource, setDeriveSource] = useState<'pick' | FormTemplateDto | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const updateParams = (newParams: Record<string, string | number | undefined>) => {
    const updated = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(newParams)) {
      if (value === undefined || value === '') updated.delete(key);
      else updated.set(key, String(value));
    }
    setSearchParams(updated);
  };

  const canCreate = access.can('TEMPLATE_CREATE');
  const canSeeAll = access.can('TEMPLATE_READ_ALL');
  const canReview = access.can('TEMPLATE_REVIEW');
  const isOwner = (template: FormTemplateDto) => isAdmin || template.ownerId === user?.id;
  // A API só deixa editar/excluir o DONO do modelo (ou um ADMIN do sistema) e somente em Rascunho.
  const canMutate = (template: FormTemplateDto, permission: 'TEMPLATE_UPDATE' | 'TEMPLATE_DELETE') =>
    access.can(permission) && isOwner(template) && template.status === 'RASCUNHO';

  const allowedActions = (template: FormTemplateDto): FormTemplateAction[] =>
    (Object.keys(ACTIONS) as FormTemplateAction[]).filter((action) => {
      const rule = ACTIONS[action];
      if (!rule.from.includes(template.status)) return false;
      const ownerOk = isOwner(template) && access.can('TEMPLATE_UPDATE');
      if (rule.who === 'owner') return ownerOk;
      if (rule.who === 'review') return canReview;
      return ownerOk || canReview;
    });

  // ---------------------------------------------------------------------------
  // LEITURA — só dispara quando o perfil permite ler modelos
  // ---------------------------------------------------------------------------
  const {
    data: listData,
    isLoading: isLoadingList,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['form-templates', { page, search, status, clinicalArea, sigtapCode, responsible }],
    enabled: access.canRead,
    queryFn: async () => {
      const res = await formTemplatesControllerFindAll({
        page,
        pageSize: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(clinicalArea ? { clinicalArea } : {}),
        ...(sigtapCode ? { sigtapCode } : {}),
        ...(responsible ? { responsible } : {}),
      });
      return res.data as PaginatedFormTemplatesResponseDto;
    },
  });

  const templates: FormTemplateDto[] = listData?.data ?? [];
  const meta = listData?.meta ?? { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };
  const counts: Partial<FormTemplateStatusCountsDto> = listData?.statusCounts ?? {};

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ['form-templates'] });
    if (id) queryClient.invalidateQueries({ queryKey: ['form-template', id] });
  };

  // ---------------------------------------------------------------------------
  // ESCRITA
  // ---------------------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: TemplateFormValues }) => {
      const description = data.description.trim();
      const common = {
        name: data.name,
        clinicalArea: data.clinicalArea,
        sigtapCode: data.sigtapCode.trim(),
        responsibleName: data.responsibleName.trim(),
        complexity: data.complexity,
        prontuarioComponents: parseComponents(data.prontuarioComponents),
      };
      if (id) {
        // Na edição, texto vazio vira null (limpa a descrição no banco).
        const res = await formTemplatesControllerUpdate(id, {
          ...common,
          description: description || null,
          ...(data.versionNote.trim() ? { versionNote: data.versionNote.trim() } : {}),
        });
        return res.data;
      }
      const res = await formTemplatesControllerCreate({ ...common, ...(description ? { description } : {}) });
      return res.data as FormTemplateDto;
    },
    onSuccess: (data, variables) => {
      const created = data as FormTemplateDto;
      setFeedback({
        type: 'success',
        message: variables.id
          ? 'Cadastro do modelo atualizado (nova versão registrada).'
          : `Modelo ${created?.code ?? ''} "${variables.data.name}" cadastrado como Rascunho.`,
      });
      setFormTarget(null);
      invalidate(variables.id);
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: friendlyWriteError(err, 'Não foi possível salvar o modelo.') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await formTemplatesControllerRemove(id);
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Modelo excluído.' });
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err: unknown) => {
      setDeleteTarget(null);
      setFeedback({ type: 'error', message: friendlyWriteError(err, 'Falha ao excluir o modelo.') });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: FormTemplateAction; note?: string }) => {
      const res = await formTemplatesControllerTransition(id, { action, ...(note ? { note } : {}) });
      return res.data as FormTemplateDto;
    },
    onSuccess: (data, variables) => {
      setFeedback({
        type: 'success',
        message: `${data?.code ?? 'Modelo'}: status alterado para "${STATUS_LABELS[data?.status] ?? data?.status}".`,
      });
      invalidate(variables.id);
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: friendlyWriteError(err, 'Não foi possível alterar o status.') });
    },
  });

  const deriveMutation = useMutation({
    mutationFn: async ({ id, name, responsibleName }: { id: string; name: string; responsibleName?: string }) => {
      const res = await formTemplatesControllerDerive(id, { name, ...(responsibleName ? { responsibleName } : {}) });
      return res.data as FormTemplateDto;
    },
    onSuccess: (data) => {
      setFeedback({ type: 'success', message: `Modelo ${data?.code ?? ''} derivado e criado como Rascunho.` });
      setDeriveSource(null);
      setDetailId(null);
      invalidate();
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: friendlyWriteError(err, 'Não foi possível derivar o modelo.') });
    },
  });

  const lastUpdate = templates.reduce<string | null>(
    (acc, t) => (!acc || t.updatedAt > acc ? t.updatedAt : acc),
    null,
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-600" />
            Construtor de Fichas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Governança de modelos: cada ficha passa por revisão, aprovação e publicação antes de chegar às clínicas.
            {canReview ? '' : ' Aprovar, publicar e suspender exigem o perfil de Supervisor.'}
          </p>
          {access.roles.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Seu perfil:</span>
              {access.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABELS[role] ?? role}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {canCreate && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" onClick={() => setDeriveSource('pick')} className="gap-1.5">
              <Copy className="h-4 w-4" />
              Derivar de modelo existente
            </Button>
            <Button onClick={() => setFormTarget('new')} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Novo Modelo
            </Button>
          </div>
        )}
      </div>

      {access.isMock && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Os perfis de acesso desta tela vêm de um <strong>mock de primeira fase</strong>: a atribuição real de
            perfis por usuário ainda não existe.
          </span>
        </div>
      )}

      {feedback && (
        <ActionFeedback type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
      )}

      {/* Corpo: depende primeiro do perfil de acesso */}
      {access.isLoading ? (
        <LoadingState message="Verificando permissões..." />
      ) : access.isError ? (
        <ErrorState
          title="Não foi possível verificar suas permissões"
          message="Recarregue a página para tentar novamente."
        />
      ) : !access.canRead ? (
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Seu perfil não tem acesso aos modelos de ficha"
          description="Peça a um administrador o perfil Configurador (para criar modelos) ou Supervisão (para acompanhá-los)."
        />
      ) : (
        <>
          {/* Abas de status com contagem */}
          <div role="tablist" aria-label="Filtrar por status" className="flex flex-wrap gap-1.5">
            {(['', ...STATUS_ORDER] as Array<FormTemplateStatus | ''>).map((value) => {
              const active = status === value;
              const count = value ? counts[value] : counts.total;
              return (
                <button
                  key={value || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => updateParams({ status: value || undefined, page: 1 })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {value ? STATUS_LABELS[value] : 'Todos'}
                  <span className={active ? 'text-blue-100' : 'text-slate-400'}>{count ?? 0}</span>
                </button>
              );
            })}
          </div>

          {/* Filtros */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-end">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    aria-label="Buscar modelos por nome ou código"
                    placeholder="Buscar por nome ou código (FC-...)"
                    maxLength={120}
                    defaultValue={search}
                    key={`search-${search === '' ? 'empty' : 'set'}`}
                    onChange={(e) => updateParams({ search: e.target.value || undefined, page: 1 })}
                    className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                </div>
                <select
                  aria-label="Filtrar por área clínica"
                  value={clinicalArea}
                  onChange={(e) => updateParams({ area: e.target.value || undefined, page: 1 })}
                  className={selectClass}
                >
                  <option value="">Todas as áreas</option>
                  {(Object.keys(AREA_LABELS) as ClinicalArea[]).map((area) => (
                    <option key={area} value={area}>
                      {AREA_LABELS[area]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label="Filtrar por código SIGTAP"
                  placeholder="SIGTAP"
                  maxLength={20}
                  defaultValue={sigtapCode}
                  key={`sigtap-${sigtapCode === '' ? 'empty' : 'set'}`}
                  onChange={(e) => updateParams({ sigtap: e.target.value || undefined, page: 1 })}
                  className={selectClass}
                />
                <input
                  type="text"
                  aria-label="Filtrar por responsável"
                  placeholder="Responsável"
                  maxLength={120}
                  defaultValue={responsible}
                  key={`resp-${responsible === '' ? 'empty' : 'set'}`}
                  onChange={(e) => updateParams({ responsible: e.target.value || undefined, page: 1 })}
                  className={selectClass}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10"
                  disabled={!hasFilters}
                  onClick={() => updateParams({ search: undefined, area: undefined, sigtap: undefined, responsible: undefined, page: 1 })}
                >
                  Limpar
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoadingList ? (
            <LoadingState message="Carregando modelos..." />
          ) : isError ? (
            <ListError error={error} onRetry={() => refetch()} />
          ) : templates.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="Nenhum modelo encontrado"
              description={
                hasFilters || status
                  ? 'Nenhum modelo corresponde aos filtros.'
                  : canCreate
                    ? 'Você ainda não cadastrou modelos de ficha.'
                    : 'Ainda não há modelos cadastrados.'
              }
              action={
                hasFilters || status ? (
                  <Button variant="outline" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>
                    Limpar filtros
                  </Button>
                ) : canCreate ? (
                  <Button size="sm" onClick={() => setFormTarget('new')}>
                    Cadastrar primeiro modelo
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              <Card className="shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">Modelo</th>
                        <th className="text-left font-medium px-4 py-3">Área</th>
                        <th className="text-left font-medium px-4 py-3">SIGTAP</th>
                        <th className="text-left font-medium px-4 py-3">Responsável</th>
                        <th className="text-left font-medium px-4 py-3">Versão</th>
                        <th className="text-left font-medium px-4 py-3">Status</th>
                        <th className="text-right font-medium px-4 py-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {templates.map((template) => (
                        <tr key={template.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 min-w-[14rem]">
                            <button
                              type="button"
                              className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 text-left"
                              onClick={() => setDetailId(template.id)}
                            >
                              {template.name}
                            </button>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="font-mono">{template.code}</span>
                              <span>·</span>
                              <span>{COMPLEXITY_LABELS[template.complexity]}</span>
                              {template.ownerId === user?.id && <Badge variant="outline" className="ml-1">Meu</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {AREA_LABELS[template.clinicalArea] ?? template.clinicalArea}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {template.sigtapCode}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{template.responsibleName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">v{template.version}</td>
                          <td className="px-4 py-3">
                            <Badge variant={STATUS_VARIANTS[template.status]}>{STATUS_LABELS[template.status]}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Ver detalhes"
                                aria-label={`Ver detalhes de ${template.name}`}
                                onClick={() => setDetailId(template.id)}
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-500" />
                              </Button>
                              <Link
                                to={`/form-templates/${template.id}/builder`}
                                title="Montar ficha (seções, grupos e campos)"
                                aria-label={`Montar ficha ${template.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <LayoutList className="h-3.5 w-3.5 text-blue-600" />
                              </Link>
                              {canMutate(template, 'TEMPLATE_UPDATE') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Editar cadastro"
                                  aria-label={`Editar ${template.name}`}
                                  onClick={() => setFormTarget(template)}
                                >
                                  <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                                </Button>
                              )}
                              {canMutate(template, 'TEMPLATE_DELETE') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  title="Excluir rascunho"
                                  aria-label={`Excluir ${template.name}`}
                                  onClick={() => setDeleteTarget(template)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Paginação */}
              <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500">
                <div>
                  Mostrando <strong>{templates.length}</strong> de <strong>{meta.total}</strong> modelos
                  {lastUpdate && <span> · última alteração {formatDate(lastUpdate)}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    aria-label="Página anterior"
                    disabled={meta.page <= 1}
                    onClick={() => updateParams({ page: Math.max(1, meta.page - 1) })}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 font-medium">
                    {meta.page} de {meta.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    aria-label="Próxima página"
                    disabled={meta.page >= meta.totalPages}
                    onClick={() => updateParams({ page: meta.page + 1 })}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modais */}
      {formTarget && (
        <TemplateFormModal
          key={formTarget === 'new' ? 'new' : formTarget.id}
          template={formTarget === 'new' ? null : formTarget}
          defaultResponsible={user?.name ?? ''}
          isLoading={saveMutation.isPending}
          onClose={() => setFormTarget(null)}
          onSubmit={(data) => {
            setFeedback(null);
            saveMutation.mutate({ id: formTarget === 'new' ? undefined : formTarget.id, data });
          }}
        />
      )}

      {detailId && (
        <TemplateDetailModal
          id={detailId}
          canSeeAll={canSeeAll}
          canDerive={canCreate}
          allowedActions={allowedActions}
          isTransitioning={transitionMutation.isPending}
          onTransition={(template, action, note) => {
            setFeedback(null);
            transitionMutation.mutate({ id: template.id, action, note });
          }}
          onEdit={(template) => (canMutate(template, 'TEMPLATE_UPDATE') ? () => setFormTarget(template) : undefined)}
          onDerive={(template) => setDeriveSource(template)}
          onClose={() => setDetailId(null)}
        />
      )}

      {deriveSource && (
        <DeriveModal
          source={deriveSource === 'pick' ? null : deriveSource}
          isLoading={deriveMutation.isPending}
          onClose={() => setDeriveSource(null)}
          onSubmit={(id, name, responsibleName) => {
            setFeedback(null);
            deriveMutation.mutate({ id, name, responsibleName });
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          template={deleteTarget}
          isLoading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            setFeedback(null);
            deleteMutation.mutate(deleteTarget.id);
          }}
        />
      )}
    </div>
  );
}

// 403/404/409/503 em escrita: mensagens mais úteis que o texto genérico.
function friendlyWriteError(err: unknown, fallback: string): string {
  switch (getStatus(err)) {
    case 403:
      return getErrorMessage(err, 'Você não tem permissão para esta ação.');
    case 404:
      return 'Este modelo não existe mais (talvez tenha sido excluído por outra pessoa).';
    case 503:
      return 'O prontuário está indisponível no momento. Tente novamente em instantes.';
    default:
      // 400/409 trazem a mensagem exata no campo `detail` (ex.: "Somente modelos em Rascunho...").
      return getErrorMessage(err, fallback);
  }
}

function ListError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = getStatus(error);
  if (status === 403) {
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="Acesso negado"
        description="Seu perfil não pode listar modelos de ficha."
      />
    );
  }
  if (status === 503) {
    return (
      <ErrorState
        title="Prontuário indisponível"
        message="O serviço de prontuário não está respondendo. Os modelos voltam a aparecer assim que ele for restabelecido."
        onRetry={onRetry}
      />
    );
  }
  return (
    <ErrorState
      title="Erro ao buscar modelos"
      message="Não foi possível carregar os modelos no momento."
      onRetry={onRetry}
    />
  );
}

// =============================================================================
// Estrutura base dos modais (fecha com Esc e clique no fundo)
// =============================================================================
function ModalShell({
  title,
  subtitle,
  size = 'md',
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg';
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl w-full p-6 relative max-h-[90vh] overflow-y-auto ${
          size === 'lg' ? 'max-w-2xl' : 'max-w-md'
        }`}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 pr-6">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-300">
      {children} {optional && <span className="text-slate-400 font-normal">(opcional)</span>}
    </label>
  );
}

// =============================================================================
// Cadastrar / editar a ficha do modelo
// =============================================================================
function TemplateFormModal({
  template,
  defaultResponsible,
  isLoading,
  onClose,
  onSubmit,
}: {
  template: FormTemplateDto | null;
  defaultResponsible: string;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: TemplateFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: template?.name ?? '',
      clinicalArea: template?.clinicalArea ?? ('' as ClinicalArea),
      sigtapCode: template?.sigtapCode ?? '',
      responsibleName: template?.responsibleName ?? defaultResponsible,
      complexity: template?.complexity ?? 'SIMPLES',
      prontuarioComponents: template?.prontuarioComponents.join(', ') ?? '',
      description: template?.description ?? '',
      versionNote: '',
    },
  });

  const descriptionLength = watch('description')?.length ?? 0;
  const sigtapField = register('sigtapCode');

  return (
    <ModalShell
      title={template ? `Editar ${template.code}` : 'Novo Modelo de Ficha'}
      subtitle={
        template
          ? `Versão atual v${template.version}. Salvar gera a próxima versão e registra no histórico.`
          : 'O código FC-xxxx é gerado automaticamente. O modelo nasce como Rascunho, v1.0.0.'
      }
      size="lg"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Nome"
          placeholder="Ex.: Avaliação Clínico-Nutricional"
          maxLength={NAME_MAX + 20}
          autoFocus
          {...register('name')}
          error={errors.name?.message}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="clinicalArea">Área clínica</FieldLabel>
            <select id="clinicalArea" {...register('clinicalArea')} className={selectClass}>
              <option value="">Selecione...</option>
              {(Object.keys(AREA_LABELS) as ClinicalArea[]).map((area) => (
                <option key={area} value={area}>
                  {AREA_LABELS[area]}
                </option>
              ))}
            </select>
            {errors.clinicalArea && <span className="text-xs text-red-500">{errors.clinicalArea.message}</span>}
          </div>

          <Input
            label="Código SIGTAP"
            id="sigtapCode"
            placeholder="00.00.00.000-0"
            inputMode="numeric"
            maxLength={14}
            {...sigtapField}
            onChange={(e) => {
              e.target.value = maskSigtap(e.target.value);
              void sigtapField.onChange(e);
            }}
            error={errors.sigtapCode?.message}
          />

          <Input
            label="Responsável"
            id="responsibleName"
            placeholder="Ex.: Prof. Ricardo Menezes"
            maxLength={NAME_MAX + 20}
            {...register('responsibleName')}
            error={errors.responsibleName?.message}
          />

          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="complexity">Complexidade</FieldLabel>
            <select id="complexity" {...register('complexity')} className={selectClass}>
              {(Object.keys(COMPLEXITY_LABELS) as FormTemplateComplexity[]).map((c) => (
                <option key={c} value={c}>
                  {COMPLEXITY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="prontuarioComponents" optional>
            Componentes do Prontuário
          </FieldLabel>
          <input
            id="prontuarioComponents"
            placeholder="PRT.IDENT@3.1, PRT.ANTRO@1.2"
            {...register('prontuarioComponents')}
            onBlur={(e) => setValue('prontuarioComponents', parseComponents(e.target.value).join(', '), { shouldValidate: true })}
            className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 ${
              errors.prontuarioComponents ? 'border-red-500 focus-visible:ring-red-500' : 'border-slate-300 dark:border-slate-700 focus-visible:ring-blue-500'
            }`}
          />
          <span className={`text-xs ${errors.prontuarioComponents ? 'text-red-500' : 'text-slate-400'}`}>
            {errors.prontuarioComponents?.message ?? 'Separe por vírgula. Formato: CÓDIGO@versão.'}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="description" optional>
            Descrição
          </FieldLabel>
          <textarea
            id="description"
            rows={3}
            placeholder="Ex.: Ficha de primeira consulta"
            {...register('description')}
            className={`flex w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 resize-y ${
              errors.description
                ? 'border-red-500 focus-visible:ring-red-500'
                : 'border-slate-300 dark:border-slate-700 focus-visible:ring-blue-500'
            }`}
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-red-500">{errors.description?.message}</span>
            <span className={descriptionLength > DESCRIPTION_MAX ? 'text-red-500' : 'text-slate-400'}>
              {descriptionLength}/{DESCRIPTION_MAX}
            </span>
          </div>
        </div>

        {template && (
          <Input
            label="Nota da versão (opcional)"
            id="versionNote"
            placeholder="O que mudou nesta versão?"
            maxLength={NOTE_MAX}
            {...register('versionNote')}
            error={errors.versionNote?.message}
          />
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" isLoading={isLoading}>
            {template ? 'Salvar nova versão' : 'Cadastrar Modelo'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// =============================================================================
// Detalhes + ciclo de vida + histórico — GET /form-templates/:id
// =============================================================================
function TemplateDetailModal({
  id,
  canSeeAll,
  canDerive,
  allowedActions,
  isTransitioning,
  onTransition,
  onEdit,
  onDerive,
  onClose,
}: {
  id: string;
  canSeeAll: boolean;
  canDerive: boolean;
  allowedActions: (template: FormTemplateDto) => FormTemplateAction[];
  isTransitioning: boolean;
  onTransition: (template: FormTemplateDto, action: FormTemplateAction, note?: string) => void;
  onEdit: (template: FormTemplateDto) => (() => void) | undefined;
  onDerive: (template: FormTemplateDto) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<FormTemplateAction | null>(null);
  const [note, setNote] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['form-template', id],
    queryFn: async () => (await formTemplatesControllerFindById(id)).data as FormTemplateDetailDto,
  });

  const actions = data ? allowedActions(data) : [];
  const edit = data ? onEdit(data) : undefined;

  const run = (action: FormTemplateAction) => {
    if (!data) return;
    if (ACTIONS[action].noteRequired || action === 'APROVAR' || action === 'PUBLICAR') {
      setPending(action);
      setNote('');
      return;
    }
    onTransition(data, action);
  };

  return (
    <ModalShell
      title={data ? data.name : 'Detalhes do Modelo'}
      subtitle={data ? `${data.code} · v${data.version}` : undefined}
      size="lg"
      onClose={onClose}
    >
      {isLoading ? (
        <LoadingState message="Carregando modelo..." />
      ) : isError || !data ? (
        <p className="text-sm text-red-500">
          {getStatus(error) === 404
            ? 'Este modelo não existe mais.'
            : getStatus(error) === 403
              ? 'Você não tem acesso a este modelo.'
              : getErrorMessage(error, 'Não foi possível carregar o modelo.')}
        </p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANTS[data.status]}>{STATUS_LABELS[data.status]}</Badge>
            <Badge variant="secondary">{COMPLEXITY_LABELS[data.complexity]}</Badge>
            {data.derivedFromCode && <Badge variant="outline">Derivado de {data.derivedFromCode}</Badge>}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <DetailItem label="Área">{AREA_LABELS[data.clinicalArea]}</DetailItem>
            <DetailItem label="SIGTAP">
              <span className="font-mono">{data.sigtapCode}</span>
            </DetailItem>
            <DetailItem label="Responsável">{data.responsibleName}</DetailItem>
            <DetailItem label="Criado em">{formatDateTime(data.createdAt)}</DetailItem>
            <DetailItem label="Atualizado em">{formatDateTime(data.updatedAt)}</DetailItem>
            {canSeeAll && (
              <DetailItem label="Dono">
                <span className="font-mono text-xs break-all">{data.ownerId.slice(0, 8)}</span>
              </DetailItem>
            )}
          </dl>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Descrição</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
              {data.description || <span className="italic text-slate-400">Sem descrição</span>}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Componentes do Prontuário</p>
            {data.prontuarioComponents.length === 0 ? (
              <p className="text-xs italic text-slate-400">Nenhum componente informado.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.prontuarioComponents.map((c) => (
                  <span
                    key={c}
                    className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-0.5 font-mono text-xs text-slate-700 dark:text-slate-300"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ciclo de vida */}
          {(actions.length > 0 || canDerive || edit) && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-3">
              <p className="text-xs font-medium text-slate-500">Ações</p>
              <div className="flex flex-wrap gap-2">
                {edit && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={edit}>
                    <Edit2 className="h-3.5 w-3.5" /> Editar cadastro
                  </Button>
                )}
                {canDerive && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onDerive(data)}>
                    <Copy className="h-3.5 w-3.5" /> Derivar
                  </Button>
                )}
                {actions.map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={ACTIONS[action].variant}
                    disabled={isTransitioning}
                    onClick={() => run(action)}
                  >
                    {ACTIONS[action].label}
                  </Button>
                ))}
              </div>
              {data.status !== 'RASCUNHO' && data.status !== 'INATIVO' && (
                <p className="text-xs text-slate-400">
                  Só modelos em Rascunho podem ser editados. Para alterar este modelo, derive um novo.
                </p>
              )}

              {pending && (
                <form
                  className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ACTIONS[pending].noteRequired && !note.trim()) return;
                    onTransition(data, pending, note.trim() || undefined);
                    setPending(null);
                  }}
                >
                  <label htmlFor="transitionNote" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {ACTIONS[pending].label} — {ACTIONS[pending].noteRequired ? 'justificativa (obrigatória)' : 'observação (opcional)'}
                  </label>
                  <textarea
                    id="transitionNote"
                    rows={2}
                    maxLength={NOTE_MAX}
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="flex w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setPending(null)}>
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      variant={ACTIONS[pending].variant === 'destructive' ? 'destructive' : 'default'}
                      disabled={ACTIONS[pending].noteRequired && !note.trim()}
                      isLoading={isTransitioning}
                    >
                      Confirmar
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Histórico de versões */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Histórico de versões
            </p>
            <ol className="space-y-2 border-l border-slate-200 dark:border-slate-800 pl-4">
              {data.versions.map((v) => (
                <li key={v.id} className="text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">v{v.version}</span>
                    <span>·</span>
                    <span>{formatDateTime(v.createdAt)}</span>
                    <span>·</span>
                    <span>{v.authorName}</span>
                    {v.toStatus && v.fromStatus && (
                      <span className="text-slate-400">
                        ({STATUS_LABELS[v.fromStatus]} → {STATUS_LABELS[v.toStatus]})
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{v.note}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <div className="flex justify-end pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </ModalShell>
  );
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}

// =============================================================================
// Derivar de modelo existente — POST /form-templates/:id/derive
// =============================================================================
function DeriveModal({
  source,
  isLoading,
  onClose,
  onSubmit,
}: {
  source: FormTemplateDto | null;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (sourceId: string, name: string, responsibleName?: string) => void;
}) {
  const [sourceId, setSourceId] = useState(source?.id ?? '');
  const [name, setName] = useState(source ? `${source.name} (derivado)` : '');
  const [responsibleName, setResponsibleName] = useState('');

  // Sem origem definida: lista os modelos visíveis para escolher.
  const { data: options, isLoading: loadingOptions } = useQuery({
    queryKey: ['form-templates', 'derive-options'],
    enabled: !source,
    queryFn: async () => {
      const res = await formTemplatesControllerFindAll({ page: 1, pageSize: 100 });
      return (res.data as PaginatedFormTemplatesResponseDto).data;
    },
  });

  const selected = source ?? options?.find((t) => t.id === sourceId) ?? null;
  const nameError = name.trim().length > 0 && name.trim().length < 3 ? 'O nome deve ter no mínimo 3 caracteres.' : undefined;

  return (
    <ModalShell
      title="Derivar de modelo existente"
      subtitle="O novo modelo copia o cadastro da origem e nasce como Rascunho, v1.0.0, com novo código."
      onClose={onClose}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected || name.trim().length < 3) return;
          onSubmit(selected.id, name.trim(), responsibleName.trim() || undefined);
        }}
      >
        {source ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Origem: <strong>{source.code}</strong> · {source.name} (v{source.version})
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="deriveSource">Modelo de origem</FieldLabel>
            <select
              id="deriveSource"
              value={sourceId}
              disabled={loadingOptions}
              onChange={(e) => {
                setSourceId(e.target.value);
                const tpl = options?.find((t) => t.id === e.target.value);
                if (tpl && !name) setName(`${tpl.name} (derivado)`);
              }}
              className={selectClass}
            >
              <option value="">{loadingOptions ? 'Carregando...' : 'Selecione...'}</option>
              {options?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name} (v{t.version} · {STATUS_LABELS[t.status]})
                </option>
              ))}
            </select>
          </div>
        )}

        <Input label="Nome do novo modelo" id="deriveName" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} error={nameError} />
        <Input
          label="Responsável (opcional)"
          id="deriveResponsible"
          placeholder={selected?.responsibleName ?? 'Mesmo do modelo de origem'}
          value={responsibleName}
          onChange={(e) => setResponsibleName(e.target.value)}
          maxLength={NAME_MAX}
        />

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" isLoading={isLoading} disabled={!selected || name.trim().length < 3}>
            Derivar
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// =============================================================================
// Confirmação de exclusão (somente Rascunho)
// =============================================================================
function ConfirmDeleteModal({
  template,
  isLoading,
  onCancel,
  onConfirm,
}: {
  template: FormTemplateDto;
  isLoading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Excluir rascunho?" onClose={onCancel}>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        O modelo <strong>{template.code} · {template.name}</strong> deixará de aparecer na lista. A exclusão é lógica: o
        registro é preservado no banco e o código não é reaproveitado.
      </p>
      <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" variant="destructive" size="sm" isLoading={isLoading} onClick={onConfirm}>
          Excluir
        </Button>
      </div>
    </ModalShell>
  );
}
