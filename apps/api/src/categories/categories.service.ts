// =============================================================================
// CategoriesService — regras de negócio das categorias de tarefas
// -----------------------------------------------------------------------------
// Mesmo padrão do TasksService:
//   - Ownership: USER só enxerga/altera as próprias categorias; ADMIN vê todas.
//   - Soft delete: nunca apagamos a linha, só preenchemos deletedAt.
//   - serializeCategory(): converte o objeto do Prisma no DTO de saída.
// Regras específicas deste módulo:
//   - Nome único por usuário (sem diferenciar maiúsculas/minúsculas).
//   - Ao remover uma categoria, as tarefas dela ficam "sem categoria".
// =============================================================================
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryDto,
  CreateCategoryDto,
  DEFAULT_CATEGORY_COLOR,
  ListCategoriesQueryDto,
  PaginatedCategoriesResponseDto,
  UpdateCategoryDto,
} from './category.dto';

// Mesmo "contexto de usuário" mínimo usado pelo TasksService.
interface UserContext {
  id: string;
  role: string;
}

// Bloco reutilizado em todas as consultas: pede ao Prisma para contar
// apenas as tarefas ativas (deletedAt = null) de cada categoria.
const TASK_COUNT_INCLUDE = {
  _count: {
    select: {
      tasks: { where: { deletedAt: null } },
    },
  },
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CRIAR
  // ---------------------------------------------------------------------------
  async create(ownerId: string, dto: CreateCategoryDto): Promise<CategoryDto> {
    const name = dto.name.trim();

    // Regra: o mesmo usuário não pode ter duas categorias com o mesmo nome.
    await this.assertNameIsAvailable(ownerId, name);

    const created = await this.prisma.taskCategory.create({
      data: {
        name,
        // Guardamos sempre em maiúsculas para padronizar (#3b82f6 -> #3B82F6).
        color: (dto.color || DEFAULT_CATEGORY_COLOR).toUpperCase(),
        ownerId,
      },
      include: TASK_COUNT_INCLUDE,
    });

    return this.serializeCategory(created);
  }

  // ---------------------------------------------------------------------------
  // LISTAR (paginado + busca por nome)
  // ---------------------------------------------------------------------------
  async findAll(user: UserContext, query: ListCategoriesQueryDto): Promise<PaginatedCategoriesResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    // Nunca listamos categorias removidas logicamente.
    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    // Autorização: USER vê só as suas; ADMIN vê de todos.
    if (user.role !== 'ADMIN') {
      where.ownerId = user.id;
    }

    if (query.search) {
      where.name = { contains: query.search.trim() };
    }

    // count + findMany em paralelo (mesmo padrão do TasksService).
    const [total, items] = await Promise.all([
      this.prisma.taskCategory.count({ where }),
      this.prisma.taskCategory.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' }, // categorias ficam mais fáceis de achar em ordem alfabética
        include: TASK_COUNT_INCLUDE,
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      data: items.map((item) => this.serializeCategory(item)),
      meta: { page, pageSize, total, totalPages },
    };
  }

  // ---------------------------------------------------------------------------
  // DETALHAR
  // ---------------------------------------------------------------------------
  async findById(user: UserContext, id: string): Promise<CategoryDto> {
    const category = await this.prisma.taskCategory.findFirst({
      where: { id, deletedAt: null },
      include: TASK_COUNT_INCLUDE,
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    if (user.role !== 'ADMIN' && category.ownerId !== user.id) {
      throw new ForbiddenException('Você não tem permissão para acessar esta categoria.');
    }

    return this.serializeCategory(category);
  }

  // ---------------------------------------------------------------------------
  // ATUALIZAR
  // ---------------------------------------------------------------------------
  async update(user: UserContext, id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const existing = await this.prisma.taskCategory.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    if (user.role !== 'ADMIN' && existing.ownerId !== user.id) {
      throw new ForbiddenException('Você não tem permissão para modificar esta categoria.');
    }

    // Se o nome mudou, checamos duplicidade entre as categorias do DONO
    // (usamos existing.ownerId para que um ADMIN editando não "misture" usuários).
    if (dto.name !== undefined) {
      await this.assertNameIsAvailable(existing.ownerId, dto.name.trim(), id);
    }

    const updated = await this.prisma.taskCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color.toUpperCase() } : {}),
      },
      include: TASK_COUNT_INCLUDE,
    });

    return this.serializeCategory(updated);
  }

  // ---------------------------------------------------------------------------
  // REMOVER (soft delete)
  // ---------------------------------------------------------------------------
  async remove(user: UserContext, id: string): Promise<void> {
    const existing = await this.prisma.taskCategory.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    if (user.role !== 'ADMIN' && existing.ownerId !== user.id) {
      throw new ForbiddenException('Você não tem permissão para excluir esta categoria.');
    }

    // Por que uma transação?
    // O "ON DELETE SET NULL" do banco só dispara em DELETE físico. Como aqui
    // fazemos soft delete (UPDATE), precisamos desvincular as tarefas na mão.
    // A transação garante que as duas operações acontecem juntas ou nenhuma.
    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.taskCategory.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Auxiliares privados
  // ---------------------------------------------------------------------------

  // Lança 409 (Conflict) se já existir categoria ATIVA com o mesmo nome para o dono.
  // ignoreId serve para o update: a própria categoria não conta como duplicada.
  // SQLite não tem `mode: 'insensitive'` e `=` diferencia maiúsculas; por isso comparamos em JS
  // (as categorias de um único dono são poucas).
  private async assertNameIsAvailable(ownerId: string, name: string, ignoreId?: string): Promise<void> {
    const candidates = await this.prisma.taskCategory.findMany({
      where: {
        ownerId,
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { name: true },
    });
    const wanted = name.toLocaleLowerCase('pt-BR');

    if (candidates.some((c) => c.name.toLocaleLowerCase('pt-BR') === wanted)) {
      throw new ConflictException(`Já existe uma categoria chamada "${name}".`);
    }
  }

  // Converte o registro do Prisma no DTO de saída (datas em ISO, contador de tarefas).
  private serializeCategory(category: any): CategoryDto {
    return {
      id: category.id,
      name: category.name,
      color: category.color,
      ownerId: category.ownerId,
      taskCount: category._count?.tasks ?? 0,
      createdAt: new Date(category.createdAt).toISOString(),
      updatedAt: new Date(category.updatedAt).toISOString(),
    };
  }
}
