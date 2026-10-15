// =============================================================================
// Testes unitários do CategoriesService
// -----------------------------------------------------------------------------
// Mesmo estilo de tasks.service.spec.ts: o Prisma é substituído por um objeto
// "falso" (mock) com vi.fn(), então os testes NÃO precisam de banco de dados.
// Rodar com: pnpm --dir apps/api test
// =============================================================================
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;

  const mockUser = { id: 'user-uuid-1', role: 'USER' };
  const mockOtherUser = { id: 'user-uuid-2', role: 'USER' };
  const mockAdmin = { id: 'admin-uuid-1', role: 'ADMIN' };

  const mockCategory = {
    id: 'cat-uuid-1',
    name: 'Trabalho',
    color: '#3B82F6',
    ownerId: 'user-uuid-1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { tasks: 2 },
  };

  beforeEach(() => {
    prisma = {
      taskCategory: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      task: {
        updateMany: vi.fn(),
      },
      // $transaction recebe um array de operações; no mock só resolvemos todas.
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    };
    // Checagem de duplicidade usa findMany (SQLite não tem mode: 'insensitive'): por padrão, nome livre.
    prisma.taskCategory.findMany.mockResolvedValue([]);
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates category for authenticated user with normalized color', async () => {
      prisma.taskCategory.findMany.mockResolvedValue([]); // nome livre
      prisma.taskCategory.create.mockResolvedValue(mockCategory);

      const result = await service.create(mockUser.id, { name: '  Trabalho  ', color: '#3b82f6' });

      expect(result.id).toBe(mockCategory.id);
      expect(result.taskCount).toBe(2);
      expect(prisma.taskCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Trabalho', color: '#3B82F6', ownerId: mockUser.id },
        }),
      );
    });

    it('rejects duplicated name for the same owner', async () => {
      prisma.taskCategory.findMany.mockResolvedValue([{ name: mockCategory.name }]); // já existe (comparação sem diferenciar caixa)

      await expect(service.create(mockUser.id, { name: 'trabalho' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.taskCategory.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('restricts query to own categories for regular users', async () => {
      prisma.taskCategory.count.mockResolvedValue(1);
      prisma.taskCategory.findMany.mockResolvedValue([mockCategory]);

      const result = await service.findAll(mockUser, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1);
      expect(prisma.taskCategory.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ deletedAt: null, ownerId: mockUser.id }),
      );
    });

    it('allows admin to list categories from all users', async () => {
      prisma.taskCategory.count.mockResolvedValue(1);
      prisma.taskCategory.findMany.mockResolvedValue([mockCategory]);

      await service.findAll(mockAdmin, { page: 1, pageSize: 10 });

      expect(prisma.taskCategory.findMany.mock.calls[0][0].where.ownerId).toBeUndefined();
    });
  });

  describe('findById and Ownership', () => {
    it('throws NotFoundException when category does not exist', async () => {
      prisma.taskCategory.findFirst.mockResolvedValue(null);

      await expect(service.findById(mockUser, 'x')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for another regular user', async () => {
      prisma.taskCategory.findFirst.mockResolvedValue(mockCategory);

      await expect(service.findById(mockOtherUser, mockCategory.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('updates name when it is available', async () => {
      // 1ª chamada: busca a categoria existente; 2ª: checagem de duplicidade
      prisma.taskCategory.findFirst.mockResolvedValueOnce(mockCategory);
      prisma.taskCategory.findMany.mockResolvedValue([]);
      prisma.taskCategory.update.mockResolvedValue({ ...mockCategory, name: 'Pessoal' });

      const result = await service.update(mockUser, mockCategory.id, { name: 'Pessoal' });

      expect(result.name).toBe('Pessoal');
    });
  });

  describe('remove (Soft Delete)', () => {
    it('unlinks tasks and sets deletedAt inside a transaction', async () => {
      prisma.taskCategory.findFirst.mockResolvedValue(mockCategory);

      await service.remove(mockUser, mockCategory.id);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { categoryId: mockCategory.id },
        data: { categoryId: null },
      });
      expect(prisma.taskCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockCategory.id },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('prevents non-owner regular user from deleting category', async () => {
      prisma.taskCategory.findFirst.mockResolvedValue(mockCategory);

      await expect(service.remove(mockOtherUser, mockCategory.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
