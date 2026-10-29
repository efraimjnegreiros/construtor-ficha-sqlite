import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFormAccessService } from '../form-access/form-access.service';
import type { PrismaService } from '../prisma/prisma.service';
import { bumpPatch, FormTemplatesService, TRANSITIONS } from './form-templates.service';

describe('FormTemplatesService', () => {
  let service: FormTemplatesService;
  let prisma: any;

  // No mock de acesso: ADMIN = Configurador + Supervisão; USER = Preenchimento.
  const owner = { id: 'owner-1', role: 'USER', name: 'Lucas Andrade' };
  const stranger = { id: 'stranger-1', role: 'USER', name: 'Outra Pessoa' };
  const admin = { id: 'admin-1', role: 'ADMIN', name: 'Prof. Ricardo Menezes' };

  const template = {
    id: 'tpl-1',
    code: 'FC-0001',
    name: 'Anamnese inicial',
    description: 'Primeira consulta',
    clinicalArea: 'NUTRICAO',
    sigtapCode: '03.01.01.004-8',
    responsibleName: 'Prof. Ricardo Menezes',
    complexity: 'SIMPLES',
    version: '1.0.0',
    status: 'RASCUNHO',
    prontuarioComponents: '["PRT.IDENT@3.1"]',
    derivedFromId: null,
    ownerId: 'owner-1',
    deletedAt: null,
    createdAt: new Date('2026-10-08T10:00:00Z'),
    updatedAt: new Date('2026-10-08T10:00:00Z'),
  };

  const validCreate = {
    name: '  Anamnese inicial ',
    description: '  Primeira consulta ',
    clinicalArea: 'NUTRICAO' as const,
    sigtapCode: '03.01.01.004-8',
    responsibleName: ' Prof. Ricardo Menezes ',
    prontuarioComponents: ['prt.ident@3.1', 'PRT.IDENT@3.1'],
  };

  beforeEach(() => {
    prisma = {
      formTemplate: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      formTemplateVersion: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    // $transaction executa o callback com o próprio mock como "tx".
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    // Checagem de duplicidade e geração de código usam findMany: por padrão, nada cadastrado.
    prisma.formTemplate.findMany.mockResolvedValue([]);
    service = new FormTemplatesService(prisma as unknown as PrismaService, new MockFormAccessService());
  });

  describe('create', () => {
    it('stores the ficha registration as RASCUNHO v1.0.0 with a generated code and history entry', async () => {
      prisma.formTemplate.create.mockResolvedValue(template);

      const result = await service.create(owner, validCreate);

      expect(prisma.formTemplate.create).toHaveBeenCalledWith({
        data: {
          code: 'FC-0001',
          name: 'Anamnese inicial',
          description: 'Primeira consulta',
          clinicalArea: 'NUTRICAO',
          sigtapCode: '03.01.01.004-8',
          responsibleName: 'Prof. Ricardo Menezes',
          complexity: 'SIMPLES',
          version: '1.0.0',
          status: 'RASCUNHO',
          prontuarioComponents: '["PRT.IDENT@3.1"]',
          ownerId: 'owner-1',
        },
      });
      expect(prisma.formTemplateVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'CRIACAO', version: '1.0.0', authorName: 'Lucas Andrade', toStatus: 'RASCUNHO' }),
      });
      expect(result).toMatchObject({ code: 'FC-0001', status: 'RASCUNHO', prontuarioComponents: ['PRT.IDENT@3.1'] });
      expect(result.createdAt).toBe('2026-10-08T10:00:00.000Z');
    });

    it('generates the next sequential code, counting deleted templates too', async () => {
      prisma.formTemplate.findMany.mockImplementation(({ select }: any) =>
        Promise.resolve(select?.code ? [{ code: 'FC-0009' }, { code: 'FC-0027' }] : []),
      );
      prisma.formTemplate.create.mockResolvedValue(template);

      await service.create(owner, validCreate);

      expect(prisma.formTemplate.create).toHaveBeenCalledWith({ data: expect.objectContaining({ code: 'FC-0028' }) });
    });

    it('rejects a duplicate name for the same owner', async () => {
      prisma.formTemplate.findMany.mockResolvedValue([{ name: template.name }]);
      await expect(service.create(owner, { ...validCreate, name: 'anamnese inicial' })).rejects.toThrow(ConflictException);
      expect(prisma.formTemplate.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.formTemplate.count.mockResolvedValue(1);
      prisma.formTemplate.findMany.mockResolvedValue([template]);
    });

    it('restricts to own templates without TEMPLATE_READ_ALL', async () => {
      await service.findAll(owner, {});
      expect(prisma.formTemplate.count).toHaveBeenCalledWith({ where: { deletedAt: null, ownerId: 'owner-1' } });
    });

    it('lists everyone’s templates with TEMPLATE_READ_ALL (Supervisão)', async () => {
      await service.findAll(admin, {});
      expect(prisma.formTemplate.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    });

    it('filters by name/code, status, area, SIGTAP and responsible, and counts per status', async () => {
      prisma.formTemplate.count.mockResolvedValue(45);
      prisma.formTemplate.groupBy.mockResolvedValue([
        { status: 'PUBLICADO', _count: { _all: 3 } },
        { status: 'RASCUNHO', _count: { _all: 1 } },
      ]);

      const result = await service.findAll(admin, {
        page: 2,
        pageSize: 20,
        search: ' fc-00 ',
        status: 'PUBLICADO',
        clinicalArea: 'NUTRICAO',
        sigtapCode: '03.01',
        responsible: 'Ricardo',
      });

      const base = {
        deletedAt: null,
        OR: [{ name: { contains: 'fc-00' } }, { code: { contains: 'FC-00' } }],
        clinicalArea: 'NUTRICAO',
        sigtapCode: { contains: '03.01' },
        responsibleName: { contains: 'Ricardo' },
      };
      expect(prisma.formTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20, where: { ...base, status: 'PUBLICADO' } }),
      );
      // A contagem por status ignora o filtro de status (alimenta as abas).
      expect(prisma.formTemplate.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: base }));
      expect(result.meta).toEqual({ page: 2, pageSize: 20, total: 45, totalPages: 3 });
      expect(result.statusCounts).toMatchObject({ total: 4, PUBLICADO: 3, RASCUNHO: 1, INATIVO: 0 });
    });
  });

  describe('findById', () => {
    it('returns the template with its version history to the owner', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue(template);
      prisma.formTemplateVersion.findMany.mockResolvedValue([
        {
          id: 'v1',
          version: '1.0.0',
          kind: 'CRIACAO',
          fromStatus: null,
          toStatus: 'RASCUNHO',
          note: 'Modelo criado',
          authorId: 'owner-1',
          authorName: 'Lucas Andrade',
          createdAt: new Date('2026-10-08T10:00:00Z'),
        },
      ]);
      const result = await service.findById(owner, 'tpl-1');
      expect(result.id).toBe('tpl-1');
      expect(result.versions).toHaveLength(1);
      expect(result.derivedFromCode).toBeNull();
    });

    it('returns 404 for missing or soft-deleted templates', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue(null);
      await expect(service.findById(owner, 'x')).rejects.toThrow(NotFoundException);
    });

    it('forbids reading someone else’s template without TEMPLATE_READ_ALL', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue(template);
      await expect(service.findById(stranger, 'tpl-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('updates provided fields, bumps the PATCH version and logs the change', async () => {
      prisma.formTemplate.findFirst.mockResolvedValueOnce(template);
      prisma.formTemplate.update.mockResolvedValue({ ...template, name: 'Novo nome', version: '1.0.1' });

      await service.update(owner, 'tpl-1', { name: ' Novo nome ', versionNote: 'Renomeado' });

      expect(prisma.formTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { name: 'Novo nome', version: '1.0.1' },
      });
      expect(prisma.formTemplateVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'EDICAO', version: '1.0.1', note: 'Renomeado' }),
      });
    });

    it('blocks edits outside RASCUNHO', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue({ ...template, status: 'PUBLICADO' });
      await expect(service.update(owner, 'tpl-1', { name: 'X novo' })).rejects.toThrow(ConflictException);
      expect(prisma.formTemplate.update).not.toHaveBeenCalled();
    });

    it('forbids non-owners', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue(template);
      await expect(service.update(stranger, 'tpl-1', { name: 'Hack' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('soft deletes drafts', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue(template);
      await service.remove(owner, 'tpl-1');
      expect(prisma.formTemplate.update).toHaveBeenCalledWith({ where: { id: 'tpl-1' }, data: { deletedAt: expect.any(Date) } });
    });

    it('refuses to delete non-draft templates (they must be inactivated)', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue({ ...template, status: 'APROVADO' });
      await expect(service.remove(owner, 'tpl-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('transition (ciclo de vida)', () => {
    it('lets the owner send a draft to review', async () => {
      // Dono com TEMPLATE_UPDATE: no mock, só ADMIN tem; usamos o admin como dono.
      prisma.formTemplate.findFirst.mockResolvedValue({ ...template, ownerId: 'admin-1' });
      prisma.formTemplate.update.mockResolvedValue({ ...template, status: 'EM_REVISAO' });

      const result = await service.transition(admin, 'tpl-1', { action: 'ENVIAR_REVISAO' });

      expect(prisma.formTemplate.update).toHaveBeenCalledWith({ where: { id: 'tpl-1' }, data: { status: 'EM_REVISAO' } });
      expect(prisma.formTemplateVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'TRANSICAO', fromStatus: 'RASCUNHO', toStatus: 'EM_REVISAO' }),
      });
      expect(result.status).toBe('EM_REVISAO');
    });

    it('requires the Supervisor profile to approve/publish/suspend', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue({ ...template, status: 'EM_REVISAO' });
      await expect(service.transition(owner, 'tpl-1', { action: 'APROVAR' })).rejects.toThrow(ForbiddenException);
    });

    it('rejects transitions not allowed from the current status', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue({ ...template, status: 'RASCUNHO' });
      await expect(service.transition(admin, 'tpl-1', { action: 'PUBLICAR' })).rejects.toThrow(ConflictException);
    });

    it('requires a justification to suspend', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue({ ...template, status: 'PUBLICADO' });
      await expect(service.transition(admin, 'tpl-1', { action: 'SUSPENDER' })).rejects.toThrow(BadRequestException);
    });

    it('treats INATIVO as a final status', () => {
      for (const rule of Object.values(TRANSITIONS)) expect(rule.from).not.toContain('INATIVO');
    });
  });

  describe('derive', () => {
    it('copies the registration into a new draft v1.0.0 pointing to the origin', async () => {
      prisma.formTemplate.findFirst.mockResolvedValue({ ...template, status: 'PUBLICADO', version: '3.0.2' });
      prisma.formTemplate.findMany.mockImplementation(({ select }: any) =>
        Promise.resolve(select?.code ? [{ code: 'FC-0001' }] : []),
      );
      prisma.formTemplate.create.mockResolvedValue({ ...template, id: 'tpl-2', code: 'FC-0002', derivedFromId: 'tpl-1' });

      await service.derive(admin, 'tpl-1', { name: 'Anamnese v2' });

      expect(prisma.formTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'FC-0002',
          name: 'Anamnese v2',
          status: 'RASCUNHO',
          version: '1.0.0',
          derivedFromId: 'tpl-1',
          ownerId: 'admin-1',
          sigtapCode: '03.01.01.004-8',
        }),
      });
      expect(prisma.formTemplateVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'DERIVACAO', note: 'Derivado de FC-0001 v3.0.2' }),
      });
    });
  });

  it('bumpPatch increments the last segment', () => {
    expect(bumpPatch('3.0.2')).toBe('3.0.3');
    expect(bumpPatch('lixo')).toBe('1.0.1');
  });
});
