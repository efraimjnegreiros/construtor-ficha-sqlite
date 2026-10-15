// =============================================================================
// CategoriesPage — CRUD de categorias de tarefas (rota /categories)
// -----------------------------------------------------------------------------
// Segue o mesmo padrão da tasks-page.tsx:
//   - Filtros/paginação guardados na URL (useSearchParams)
//   - Leitura com useQuery e escrita com useMutation (TanStack Query)
//   - Formulário com React Hook Form + Zod
//   - Estados de UX: LoadingState, ErrorState, EmptyState e ActionFeedback
// As funções categoriesController* são GERADAS pelo Orval (pnpm api:generate).
// =============================================================================
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Edit2, Plus, Search, Tags, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { ActionFeedback, EmptyState, ErrorState, LoadingState } from '../components/ui/state-feedback';
import {
  categoriesControllerCreate,
  categoriesControllerFindAll,
  categoriesControllerRemove,
  categoriesControllerUpdate,
} from '../lib/api-client';
import type { CategoryDto, PaginatedCategoriesResponseDto } from '../lib/api-client/models';

// Paleta sugerida para o usuário escolher com um clique (ele também pode usar o seletor livre).
const SUGGESTED_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#64748B'];

// Validação do formulário no FRONT — espelha as regras do CreateCategoryDto do backend.
// (o backend valida de novo; aqui é só para dar feedback imediato ao usuário)
const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome deve ter no mínimo 2 caracteres.')
    .max(50, 'O nome deve ter no máximo 50 caracteres.'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use o formato #RRGGBB.'),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

// Extrai a mensagem de erro no formato Problem Details (detail) ou a mensagem genérica.
function getErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { detail?: string })?.detail ||
    (err as { message?: string })?.message ||
    fallback
  );
}

export function CategoriesPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Estado que vive na URL (permite compartilhar link e usar o "voltar" do navegador)
  const page = Number(searchParams.get('page')) || 1;
  const search = searchParams.get('search') || '';

  // Estado local da tela
  // formTarget: null = modal fechado | 'new' = criando | CategoryDto = editando
  const [formTarget, setFormTarget] = useState<'new' | CategoryDto | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Mesmo helper da tasks-page: atualiza apenas os parâmetros informados na URL.
  const updateParams = (newParams: Record<string, string | number | undefined>) => {
    const updated = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(newParams)) {
      if (value === undefined || value === '') {
        updated.delete(key);
      } else {
        updated.set(key, String(value));
      }
    }
    setSearchParams(updated);
  };

  // ---------------------------------------------------------------------------
  // LEITURA — a queryKey começa com 'categories'. Qualquer invalidate em
  // ['categories'] recarrega esta lista E o <select> da tela de tarefas.
  // ---------------------------------------------------------------------------
  const { data: response, isLoading, isError, refetch } = useQuery({
    queryKey: ['categories', { page, search }],
    queryFn: async () => {
      const res = await categoriesControllerFindAll({
        page,
        pageSize: 12,
        ...(search ? { search } : {}),
      });
      return res.data;
    },
  });

  // O Orval tipa a resposta como "sucesso | erro"; aqui garantimos que é a lista.
  const paginatedData =
    response && 'data' in (response as PaginatedCategoriesResponseDto)
      ? (response as PaginatedCategoriesResponseDto)
      : null;

  const categories: CategoryDto[] = paginatedData?.data || [];
  const meta = paginatedData?.meta || { page: 1, pageSize: 12, total: 0, totalPages: 1 };

  // Depois de criar/editar/excluir categoria, as TAREFAS também mudam
  // (nome/cor no card ou categoria removida), então invalidamos as duas chaves.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  // ---------------------------------------------------------------------------
  // ESCRITA — criar e editar compartilham a mesma mutation (decide pelo "id")
  // ---------------------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: CategoryFormValues }) => {
      const res = id
        ? await categoriesControllerUpdate(id, data)
        : await categoriesControllerCreate(data);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      setFeedback({
        type: 'success',
        message: variables.id
          ? 'Categoria atualizada com sucesso!'
          : `Categoria "${variables.data.name}" criada com sucesso!`,
      });
      setFormTarget(null);
      invalidateAll();
    },
    onError: (err: unknown) => {
      // Ex.: 409 "Já existe uma categoria chamada ..." vem no campo detail
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Não foi possível salvar a categoria.') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await categoriesControllerRemove(id);
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Categoria removida. As tarefas dela ficaram sem categoria.' });
      invalidateAll();
    },
    onError: (err: unknown) => {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Falha ao excluir a categoria.') });
    },
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho + botão de criar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Tags className="h-6 w-6 text-blue-600" />
            Categorias de Tarefas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organize suas tarefas por categoria. Cada usuário tem as próprias categorias.
          </p>
        </div>

        <Button onClick={() => setFormTarget('new')} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          Nova Categoria
        </Button>
      </div>

      {feedback && (
        <ActionFeedback type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
      )}

      {/* Busca por nome */}
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome..."
              defaultValue={search}
              onChange={(e) => updateParams({ search: e.target.value || undefined, page: 1 })}
              className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista / estados de UX */}
      {isLoading ? (
        <LoadingState message="Carregando categorias..." />
      ) : isError ? (
        <ErrorState
          title="Erro ao buscar categorias"
          message="Não foi possível carregar as categorias no momento."
          onRetry={() => refetch()}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria encontrada"
          description={search ? 'Nenhuma categoria corresponde à busca.' : 'Você ainda não criou categorias.'}
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>
                Limpar busca
              </Button>
            ) : (
              <Button size="sm" onClick={() => setFormTarget('new')}>
                Criar primeira categoria
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <Card key={category.id} className="shadow-sm">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Bolinha com a cor da categoria (cor dinâmica => style, não classe Tailwind) */}
                    <span
                      className="h-4 w-4 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{category.name}</p>
                      <p className="text-xs text-slate-500">
                        {category.taskCount} {category.taskCount === 1 ? 'tarefa' : 'tarefas'}
                        {/* ADMIN vê categorias de todos; mostramos de quem é para não confundir */}
                        {isAdmin && <span className="ml-1 text-slate-400">· dono {category.ownerId.slice(0, 8)}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      title="Editar Categoria"
                      onClick={() => setFormTarget(category)}
                    >
                      <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Excluir Categoria"
                      isLoading={deleteMutation.isPending && deleteMutation.variables === category.id}
                      onClick={() => {
                        if (
                          confirm(
                            `Remover a categoria "${category.name}"? As ${category.taskCount} tarefa(s) dela ficarão sem categoria.`,
                          )
                        ) {
                          deleteMutation.mutate(category.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Paginação (mesmo visual da tela de tarefas) */}
          <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500">
            <div>
              Mostrando <strong>{categories.length}</strong> de <strong>{meta.total}</strong> categorias
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
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
                disabled={meta.page >= meta.totalPages}
                onClick={() => updateParams({ page: meta.page + 1 })}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal único para criar e editar */}
      {formTarget && (
        <CategoryFormModal
          // key força o React a recriar o formulário ao trocar de categoria
          key={formTarget === 'new' ? 'new' : formTarget.id}
          category={formTarget === 'new' ? null : formTarget}
          isLoading={saveMutation.isPending}
          onClose={() => setFormTarget(null)}
          onSubmit={(data) => {
            setFeedback(null);
            saveMutation.mutate({ id: formTarget === 'new' ? undefined : formTarget.id, data });
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Modal de formulário (criação quando category = null, edição caso contrário)
// =============================================================================
function CategoryFormModal({
  category,
  isLoading,
  onClose,
  onSubmit,
}: {
  category: CategoryDto | null;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: CategoryFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: category?.name ?? '',
      color: category?.color ?? SUGGESTED_COLORS[0],
    },
  });

  // watch() "observa" o campo para a pré-visualização da cor atualizar em tempo real.
  const selectedColor = watch('color');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {category ? 'Editar Categoria' : 'Nova Categoria'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Defina um nome e uma cor para identificar a categoria nas tarefas.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nome"
            placeholder="Ex.: Trabalho, Estudos, Casa..."
            {...register('name')}
            error={errors.name?.message}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Cor</label>

            {/* Atalhos de cor: setValue altera o campo sem precisar de <input> */}
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onClick={() => setValue('color', color, { shouldValidate: true })}
                  className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                    selectedColor?.toUpperCase() === color ? 'border-slate-900 dark:border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            {/* Seletor livre de cor: o <input type="color"> já devolve #rrggbb */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                {...register('color')}
                className="h-9 w-12 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
              />
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: selectedColor }}
              >
                Pré-visualização
              </span>
            </div>
            {errors.color?.message && <span className="text-xs text-red-500">{errors.color.message}</span>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" isLoading={isLoading}>
              {category ? 'Salvar Alterações' : 'Criar Categoria'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
