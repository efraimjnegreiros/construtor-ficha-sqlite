import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  PaginatedTasksResponseDto,
  TaskDto,
  TaskPriorityEnum,
  TaskStatusEnum,
  UpdateTaskDto,
} from './task.dto';

interface UserContext {
  id: string;
  role: string;
}

// [CATEGORIA] O mesmo "include" era repetido em todo método (owner). Agora ele
// também traz a categoria, então centralizamos numa constante para não esquecer
// de incluir a categoria em nenhuma consulta.
const TASK_INCLUDE = {
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
} as const;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateTaskDto): Promise<TaskDto> {
    if (dto.dueDate) {
      const due = new Date(dto.dueDate);
      if (isNaN(due.getTime())) {
        throw new BadRequestException('Data de entrega limite inválida.');
      }
      if (due < new Date(Date.now() - 60000)) {
        throw new BadRequestException('A data limite não pode ser anterior à data atual.');
      }
    }

    // [CATEGORIA] Se veio categoria, ela precisa existir e ser do mesmo dono da tarefa.
    if (dto.categoryId) {
      await this.assertCategoryBelongsToOwner(dto.categoryId, ownerId);
    }

    const created = await this.prisma.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: (dto.priority as TaskPriorityEnum) || TaskPriorityEnum.MEDIUM,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        categoryId: dto.categoryId || null, // [CATEGORIA]
        ownerId,
      },
      include: TASK_INCLUDE, // [CATEGORIA] owner + category
    });

    return this.serializeTask(created);
  }

  async findAll(user: UserContext, query: ListTasksQueryDto): Promise<PaginatedTasksResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    // Autorização: Usuários comuns veem apenas suas próprias tarefas; ADMIN pode ver todas
    if (user.role !== 'ADMIN') {
      where.ownerId = user.id;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    // [CATEGORIA] Filtro por categoria
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    const allowedSortFields = ['createdAt', 'dueDate', 'title', 'priority', 'status'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, items] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: TASK_INCLUDE, // [CATEGORIA] owner + category
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      data: items.map((item) => this.serializeTask(item)),
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async findById(user: UserContext, id: string): Promise<TaskDto> {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: TASK_INCLUDE, // [CATEGORIA] owner + category
    });

    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    if (user.role !== 'ADMIN' && task.ownerId !== user.id) {
      throw new ForbiddenException('Você não tem permissão para acessar esta tarefa.');
    }

    return this.serializeTask(task);
  }

  async update(user: UserContext, id: string, dto: UpdateTaskDto): Promise<TaskDto> {
    const existing = await this.prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    if (user.role !== 'ADMIN' && existing.ownerId !== user.id) {
      throw new ForbiddenException('Você não tem permissão para modificar esta tarefa.');
    }

    // Regra de Negócio de Referência: Tarefas concluídas não podem ser alteradas sem reabrir
    const isReopening = dto.status && dto.status !== TaskStatusEnum.COMPLETED;
    const isAlreadyCompleted = existing.status === TaskStatusEnum.COMPLETED;
    const hasFieldChanges =
      (dto.title !== undefined && dto.title !== existing.title) ||
      (dto.description !== undefined && dto.description !== existing.description) ||
      (dto.priority !== undefined && dto.priority !== existing.priority) ||
      // [CATEGORIA] Trocar a categoria também conta como "alterar detalhes"
      (dto.categoryId !== undefined && dto.categoryId !== existing.categoryId) ||
      (dto.dueDate !== undefined);

    if (isAlreadyCompleted && !isReopening && hasFieldChanges) {
      throw new BadRequestException(
        'Tarefas com status COMPLETED não podem ter seus detalhes modificados sem antes serem reabertas (altere o status para PENDING ou IN_PROGRESS).',
      );
    }

    if (dto.dueDate) {
      const due = new Date(dto.dueDate);
      if (isNaN(due.getTime())) {
        throw new BadRequestException('Data de entrega limite inválida.');
      }
      if (due < new Date(Date.now() - 60000)) {
        throw new BadRequestException('A data limite não pode ser anterior à data atual.');
      }
    }

    // [CATEGORIA] Valida a nova categoria contra o DONO da tarefa (existing.ownerId),
    // e não contra quem está editando — assim um ADMIN não consegue colocar numa
    // tarefa de um usuário a categoria de outro usuário.
    if (dto.categoryId) {
      await this.assertCategoryBelongsToOwner(dto.categoryId, existing.ownerId);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status as TaskStatusEnum } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority as TaskPriorityEnum } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        // [CATEGORIA] undefined = não mexe | null = remove | uuid = troca
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId || null } : {}),
      },
      include: TASK_INCLUDE, // [CATEGORIA] owner + category
    });

    return this.serializeTask(updated);
  }

  async remove(user: UserContext, id: string): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    if (user.role !== 'ADMIN' && existing.ownerId !== user.id) {
      throw new ForbiddenException('Você não tem permissão para excluir esta tarefa.');
    }

    // Remoção lógica (Soft Delete)
    await this.prisma.task.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // [CATEGORIA] Garante que a categoria existe, não foi removida e pertence ao dono da tarefa.
  private async assertCategoryBelongsToOwner(categoryId: string, ownerId: string): Promise<void> {
    const category = await this.prisma.taskCategory.findFirst({
      where: {
        id: categoryId,
        ownerId,
        deletedAt: null,
      },
    });

    if (!category) {
      throw new BadRequestException('Categoria inválida ou inexistente para o dono desta tarefa.');
    }
  }

  private serializeTask(task: any): TaskDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status as TaskStatusEnum,
      priority: task.priority as TaskPriorityEnum,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
      ownerId: task.ownerId,
      owner: task.owner
        ? {
            id: task.owner.id,
            name: task.owner.name,
            email: task.owner.email,
          }
        : undefined,
      // [CATEGORIA]
      categoryId: task.categoryId ?? null,
      category: task.category
        ? {
            id: task.category.id,
            name: task.category.name,
            color: task.category.color,
          }
        : null,
      createdAt: new Date(task.createdAt).toISOString(),
      updatedAt: new Date(task.updatedAt).toISOString(),
    };
  }
}
