// =============================================================================
// FormTemplatesService — cadastro de fichas (modelos) com governança
// -----------------------------------------------------------------------------
// Camadas de autorização (de fora para dentro):
//   1. Guards (controller): perfil do construtor tem a permissão da rota?
//   2. Este service: ownership + regras do ciclo de vida.
//      - Criador e ADMIN do sistema editam/excluem (somente em RASCUNHO).
//      - Leitura de modelos alheios exige TEMPLATE_READ_ALL (Supervisão).
//      - Aprovar, devolver, publicar, suspender e reativar exigem TEMPLATE_REVIEW
//        (regra do protótipo: "exigem o perfil de Supervisor").
// Regras de negócio (protótipo de governança de modelos):
//   - Código FC-xxxx sequencial, gerado aqui e nunca reaproveitado.
//   - Ciclo: RASCUNHO → EM_REVISAO → APROVADO → PUBLICADO ⇄ SUSPENSO; → INATIVO (final).
//   - Só RASCUNHO pode ser editado/excluído. Para mudar um modelo publicado,
//     deriva-se um novo modelo a partir dele.
//   - Toda criação, edição, transição e derivação gera entrada no histórico de
//     versões (data, nota e autor). Cada edição incrementa o PATCH da versão.
// Soft delete: nunca apagamos a linha, só preenchemos deletedAt.
// =============================================================================
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FormAccessService } from '../form-access/form-access.service';
import { FormPermission, type FormAccessSubject } from '../form-access/form-access.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFormTemplateDto,
  DeriveFormTemplateDto,
  FormTemplateAction,
  FormTemplateDetailDto,
  FormTemplateDto,
  FormTemplateEventKind,
  FormTemplateStatus,
  FormTemplateStatusCountsDto,
  FormTemplateTransitionDto,
  FormTemplateVersionDto,
  ListFormTemplatesQueryDto,
  PaginatedFormTemplatesResponseDto,
  UpdateFormTemplateDto,
  type ClinicalArea,
  type FormTemplateComplexity,
} from './form-template.dto';

/** Usuário autenticado com o nome (gravado como autor no histórico). */
export type FormTemplateActor = FormAccessSubject & { name?: string };

interface TransitionRule {
  from: readonly FormTemplateStatus[];
  to: FormTemplateStatus;
  /** 'review' = exige TEMPLATE_REVIEW; 'owner' = dono/ADMIN com TEMPLATE_UPDATE; 'owner-or-review' = qualquer um dos dois. */
  who: 'review' | 'owner' | 'owner-or-review';
  noteRequired: boolean;
  defaultNote: string;
}

const S = FormTemplateStatus;

/** Matriz de transições do ciclo de vida (fonte única de verdade). */
export const TRANSITIONS: Readonly<Record<FormTemplateAction, TransitionRule>> = {
  ENVIAR_REVISAO: { from: [S.RASCUNHO], to: S.EM_REVISAO, who: 'owner', noteRequired: false, defaultNote: 'Enviado para revisão' },
  DEVOLVER: { from: [S.EM_REVISAO, S.APROVADO], to: S.RASCUNHO, who: 'review', noteRequired: true, defaultNote: '' },
  APROVAR: { from: [S.EM_REVISAO], to: S.APROVADO, who: 'review', noteRequired: false, defaultNote: 'Modelo aprovado' },
  PUBLICAR: { from: [S.APROVADO], to: S.PUBLICADO, who: 'review', noteRequired: false, defaultNote: 'Modelo publicado' },
  SUSPENDER: { from: [S.PUBLICADO], to: S.SUSPENSO, who: 'review', noteRequired: true, defaultNote: '' },
  REATIVAR: { from: [S.SUSPENSO], to: S.PUBLICADO, who: 'review', noteRequired: false, defaultNote: 'Modelo reativado' },
  INATIVAR: {
    from: [S.RASCUNHO, S.EM_REVISAO, S.APROVADO, S.PUBLICADO, S.SUSPENSO],
    to: S.INATIVO,
    who: 'owner-or-review',
    noteRequired: true,
    defaultNote: '',
  },
};

const STATUS_LABELS: Record<FormTemplateStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_REVISAO: 'Em revisão',
  APROVADO: 'Aprovado',
  PUBLICADO: 'Publicado',
  SUSPENSO: 'Suspenso',
  INATIVO: 'Inativo',
};

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  clinicalArea: string;
  sigtapCode: string;
  responsibleName: string;
  complexity: string;
  version: string;
  status: string;
  prontuarioComponents: string;
  derivedFromId: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class FormTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FormAccessService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cadastro
  // ---------------------------------------------------------------------------
  async create(user: FormTemplateActor, dto: CreateFormTemplateDto): Promise<FormTemplateDto> {
    const name = dto.name.trim();
    await this.assertNameIsAvailable(user.id, name);

    const created = await this.prisma.$transaction(async (tx) => {
      const code = await this.nextCode(tx);
      const template = await tx.formTemplate.create({
        data: {
          code,
          name,
          description: normalizeDescription(dto.description),
          clinicalArea: dto.clinicalArea,
          sigtapCode: dto.sigtapCode.trim(),
          responsibleName: dto.responsibleName.trim(),
          complexity: dto.complexity ?? 'SIMPLES',
          version: '1.0.0',
          status: S.RASCUNHO,
          prontuarioComponents: JSON.stringify(normalizeComponents(dto.prontuarioComponents)),
          ownerId: user.id,
        },
      });
      await tx.formTemplateVersion.create({
        data: historyEntry(template.id, '1.0.0', FormTemplateEventKind.CRIACAO, user, 'Modelo criado', null, S.RASCUNHO),
      });
      return template;
    });
    return serialize(created);
  }

  async findAll(user: FormAccessSubject, query: ListFormTemplatesQueryDto): Promise<PaginatedFormTemplatesResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    // Filtros comuns (sem status): usados também na contagem das abas de status.
    const base: Record<string, unknown> = { deletedAt: null };
    if (!(await this.access.can(user, FormPermission.TEMPLATE_READ_ALL))) {
      base.ownerId = user.id;
    }
    const search = query.search?.trim();
    if (search) {
      base.OR = [{ name: { contains: search } }, { code: { contains: search.toUpperCase() } }];
    }
    if (query.clinicalArea) base.clinicalArea = query.clinicalArea;
    if (query.sigtapCode?.trim()) base.sigtapCode = { contains: query.sigtapCode.trim() };
    if (query.responsible?.trim()) base.responsibleName = { contains: query.responsible.trim() };

    const where = query.status ? { ...base, status: query.status } : base;

    const [total, items, grouped] = await Promise.all([
      this.prisma.formTemplate.count({ where }),
      this.prisma.formTemplate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.formTemplate.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);

    return {
      data: items.map(serialize),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
      statusCounts: buildStatusCounts(grouped as Array<{ status: string; _count: { _all: number } }>),
    };
  }

  async findById(user: FormAccessSubject, id: string): Promise<FormTemplateDetailDto> {
    const template = await this.findActiveOrFail(id);
    await this.assertCanRead(user, template.ownerId);

    const [versions, origin] = await Promise.all([
      this.prisma.formTemplateVersion.findMany({ where: { templateId: id }, orderBy: { createdAt: 'desc' } }),
      template.derivedFromId
        ? this.prisma.formTemplate.findFirst({ where: { id: template.derivedFromId }, select: { code: true } })
        : Promise.resolve(null),
    ]);

    return {
      ...serialize(template),
      derivedFromCode: origin?.code ?? null,
      versions: versions.map(serializeVersion),
    };
  }

  async update(user: FormTemplateActor, id: string, dto: UpdateFormTemplateDto): Promise<FormTemplateDto> {
    const existing = await this.findActiveOrFail(id);
    this.assertCanMutate(user, existing.ownerId, 'modificar');
    this.assertIsDraft(existing.status, 'editados');

    if (dto.name !== undefined) {
      await this.assertNameIsAvailable(existing.ownerId, dto.name.trim(), id);
    }

    const data: Record<string, unknown> = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: normalizeDescription(dto.description) } : {}),
      ...(dto.clinicalArea !== undefined ? { clinicalArea: dto.clinicalArea } : {}),
      ...(dto.sigtapCode !== undefined ? { sigtapCode: dto.sigtapCode.trim() } : {}),
      ...(dto.responsibleName !== undefined ? { responsibleName: dto.responsibleName.trim() } : {}),
      ...(dto.complexity !== undefined ? { complexity: dto.complexity } : {}),
      ...(dto.prontuarioComponents !== undefined
        ? { prontuarioComponents: JSON.stringify(normalizeComponents(dto.prontuarioComponents)) }
        : {}),
    };

    // Nada mudou de fato: não gera nova versão.
    if (Object.keys(data).length === 0) return serialize(existing);

    const version = bumpPatch(existing.version);
    const note = dto.versionNote?.trim() || 'Cadastro atualizado';

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.formTemplate.update({ where: { id }, data: { ...data, version } });
      await tx.formTemplateVersion.create({
        data: historyEntry(id, version, FormTemplateEventKind.EDICAO, user, note, null, null),
      });
      return row;
    });
    return serialize(updated);
  }

  async remove(user: FormAccessSubject, id: string): Promise<void> {
    const existing = await this.findActiveOrFail(id);
    this.assertCanMutate(user, existing.ownerId, 'excluir');
    this.assertIsDraft(existing.status, 'excluídos (use "Inativar" para os demais)');
    await this.prisma.formTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ---------------------------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------------------------
  async transition(user: FormTemplateActor, id: string, dto: FormTemplateTransitionDto): Promise<FormTemplateDto> {
    const rule = TRANSITIONS[dto.action];
    if (!rule) throw new BadRequestException('Ação de ciclo de vida inválida.');

    const existing = await this.findActiveOrFail(id);
    await this.assertCanRead(user, existing.ownerId);
    await this.assertCanTransition(user, existing.ownerId, rule);

    const from = existing.status as FormTemplateStatus;
    if (!rule.from.includes(from)) {
      throw new ConflictException(
        `Não é possível ${actionVerb(dto.action)} um modelo com status "${STATUS_LABELS[from]}".`,
      );
    }

    const note = dto.note?.trim() || rule.defaultNote;
    if (rule.noteRequired && !dto.note?.trim()) {
      throw new BadRequestException(`Informe a justificativa para ${actionVerb(dto.action)} o modelo.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.formTemplate.update({ where: { id }, data: { status: rule.to } });
      await tx.formTemplateVersion.create({
        data: historyEntry(id, existing.version, FormTemplateEventKind.TRANSICAO, user, note, from, rule.to),
      });
      return row;
    });
    return serialize(updated);
  }

  // ---------------------------------------------------------------------------
  // Derivação: novo RASCUNHO (v1.0.0) copiando o cadastro do modelo de origem.
  // ---------------------------------------------------------------------------
  async derive(user: FormTemplateActor, sourceId: string, dto: DeriveFormTemplateDto): Promise<FormTemplateDto> {
    const source = await this.findActiveOrFail(sourceId);
    await this.assertCanRead(user, source.ownerId);

    const name = dto.name.trim();
    await this.assertNameIsAvailable(user.id, name);

    const created = await this.prisma.$transaction(async (tx) => {
      const code = await this.nextCode(tx);
      const template = await tx.formTemplate.create({
        data: {
          code,
          name,
          description: source.description,
          clinicalArea: source.clinicalArea,
          sigtapCode: source.sigtapCode,
          responsibleName: dto.responsibleName?.trim() || source.responsibleName,
          complexity: source.complexity,
          version: '1.0.0',
          status: S.RASCUNHO,
          prontuarioComponents: source.prontuarioComponents,
          derivedFromId: source.id,
          ownerId: user.id,
        },
      });
      await copyStructure(tx, source.id, template.id);
      await tx.formTemplateVersion.create({
        data: historyEntry(
          template.id,
          '1.0.0',
          FormTemplateEventKind.DERIVACAO,
          user,
          `Derivado de ${source.code} v${source.version}`,
          null,
          S.RASCUNHO,
        ),
      });
      return template;
    });
    return serialize(created);
  }

  // ---------------------------------------------------------------------------
  // Auxiliares
  // ---------------------------------------------------------------------------
  private async findActiveOrFail(id: string) {
    const template = await this.prisma.formTemplate.findFirst({ where: { id, deletedAt: null } });
    if (!template) throw new NotFoundException('Modelo de ficha não encontrado.');
    return template;
  }

  private async assertCanRead(user: FormAccessSubject, ownerId: string): Promise<void> {
    if (ownerId !== user.id && !(await this.access.can(user, FormPermission.TEMPLATE_READ_ALL))) {
      throw new ForbiddenException('Você não tem permissão para acessar este modelo.');
    }
  }

  private assertCanMutate(user: FormAccessSubject, ownerId: string, verb: string): void {
    if (user.role !== 'ADMIN' && ownerId !== user.id) {
      throw new ForbiddenException(`Você não tem permissão para ${verb} este modelo.`);
    }
  }

  private assertIsDraft(status: string, verb: string): void {
    if (status !== S.RASCUNHO) {
      throw new ConflictException(
        `Somente modelos em Rascunho podem ser ${verb}. Status atual: "${STATUS_LABELS[status as FormTemplateStatus] ?? status}".`,
      );
    }
  }

  private async assertCanTransition(user: FormAccessSubject, ownerId: string, rule: TransitionRule): Promise<void> {
    const isOwner = user.role === 'ADMIN' || ownerId === user.id;
    const ownerAllowed = isOwner && (await this.access.can(user, FormPermission.TEMPLATE_UPDATE));
    const reviewAllowed = await this.access.can(user, FormPermission.TEMPLATE_REVIEW);

    const allowed =
      rule.who === 'owner' ? ownerAllowed : rule.who === 'review' ? reviewAllowed : ownerAllowed || reviewAllowed;
    if (!allowed) {
      throw new ForbiddenException(
        rule.who === 'review'
          ? 'Aprovar, devolver, publicar, suspender e reativar exigem o perfil de Supervisor.'
          : 'Você não tem permissão para alterar o status deste modelo.',
      );
    }
  }

  /** Próximo código FC-xxxx considerando também modelos excluídos (códigos não se repetem). */
  private async nextCode(tx: Pick<PrismaService, 'formTemplate'>): Promise<string> {
    const rows = await tx.formTemplate.findMany({ select: { code: true } });
    const max = rows.reduce((acc, { code }) => {
      const n = Number(/^FC-(\d+)$/.exec(code)?.[1] ?? 0);
      return n > acc ? n : acc;
    }, 0);
    return `FC-${String(max + 1).padStart(4, '0')}`;
  }

  // Nome único (sem diferenciar maiúsculas) entre os modelos ativos do mesmo dono.
  // SQLite não tem `mode: 'insensitive'` e `=` diferencia maiúsculas; por isso comparamos em JS
  // (a lista de modelos de um único dono é pequena).
  private async assertNameIsAvailable(ownerId: string, name: string, ignoreId?: string): Promise<void> {
    const candidates = await this.prisma.formTemplate.findMany({
      where: {
        ownerId,
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { name: true },
    });
    const wanted = name.toLocaleLowerCase('pt-BR');
    if (candidates.some((c) => c.name.toLocaleLowerCase('pt-BR') === wanted)) {
      throw new ConflictException(`Já existe um modelo chamado "${name}".`);
    }
  }
}

// -----------------------------------------------------------------------------
// Derivação: copia seções, grupos e campos (com regras) do modelo de origem.
// As regras referenciam campos pela CHAVE, que é preservada, então seguem válidas.
// -----------------------------------------------------------------------------
type StructureTx = Pick<PrismaService, 'formSection' | 'formGroup' | 'formField'>;

export async function copyStructure(tx: StructureTx, sourceId: string, targetId: string): Promise<void> {
  if (!tx.formSection) return;
  const sections = await tx.formSection.findMany({ where: { templateId: sourceId }, orderBy: { position: 'asc' } });
  for (const section of sections) {
    const newSection = await tx.formSection.create({
      data: { templateId: targetId, title: section.title, description: section.description, position: section.position },
    });
    const groups = await tx.formGroup.findMany({ where: { sectionId: section.id }, orderBy: { position: 'asc' } });
    const groupMap = new Map<string, string>();
    for (const group of groups) {
      const newGroup = await tx.formGroup.create({
        data: {
          sectionId: newSection.id,
          title: group.title,
          description: group.description,
          prontuarioComponent: group.prontuarioComponent,
          position: group.position,
        },
      });
      groupMap.set(group.id, newGroup.id);
    }
    const fields = await tx.formField.findMany({ where: { sectionId: section.id }, orderBy: { position: 'asc' } });
    for (const field of fields) {
      const { id: _id, createdAt: _c, updatedAt: _u, templateId: _t, sectionId: _s, groupId, ...rest } = field;
      await tx.formField.create({
        data: {
          ...rest,
          templateId: targetId,
          sectionId: newSection.id,
          groupId: groupId ? (groupMap.get(groupId) ?? null) : null,
        },
      });
    }
  }
}

// -----------------------------------------------------------------------------
// Funções puras (exportadas para teste)
// -----------------------------------------------------------------------------

/** 1.0.0 → 1.0.1 (valores inválidos recomeçam em 1.0.1). */
export function bumpPatch(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return '1.0.1';
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function actionVerb(action: FormTemplateAction): string {
  const verbs: Record<FormTemplateAction, string> = {
    ENVIAR_REVISAO: 'enviar para revisão',
    DEVOLVER: 'devolver',
    APROVAR: 'aprovar',
    PUBLICAR: 'publicar',
    SUSPENDER: 'suspender',
    REATIVAR: 'reativar',
    INATIVAR: 'inativar',
  };
  return verbs[action];
}

function historyEntry(
  templateId: string,
  version: string,
  kind: FormTemplateEventKind,
  user: FormTemplateActor,
  note: string,
  fromStatus: FormTemplateStatus | null,
  toStatus: FormTemplateStatus | null,
) {
  return {
    templateId,
    version,
    kind,
    note,
    fromStatus,
    toStatus,
    authorId: user.id,
    authorName: user.name?.trim() || 'Usuário',
  };
}

function buildStatusCounts(grouped: Array<{ status: string; _count: { _all: number } }>): FormTemplateStatusCountsDto {
  const counts: FormTemplateStatusCountsDto = {
    total: 0,
    RASCUNHO: 0,
    EM_REVISAO: 0,
    APROVADO: 0,
    PUBLICADO: 0,
    SUSPENSO: 0,
    INATIVO: 0,
  };
  for (const row of grouped ?? []) {
    if (row.status in counts) counts[row.status as FormTemplateStatus] = row._count._all;
    counts.total += row._count._all;
  }
  return counts;
}

// Texto vazio/em branco ou null viram NULL no banco.
function normalizeDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Remove vazios e duplicados, preservando a ordem informada.
function normalizeComponents(list: string[] | undefined): string[] {
  return [...new Set((list ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean))];
}

function parseComponents(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function serialize(template: TemplateRow): FormTemplateDto {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    description: template.description,
    clinicalArea: template.clinicalArea as ClinicalArea,
    sigtapCode: template.sigtapCode,
    responsibleName: template.responsibleName,
    complexity: template.complexity as FormTemplateComplexity,
    version: template.version,
    status: template.status as FormTemplateStatus,
    prontuarioComponents: parseComponents(template.prontuarioComponents),
    derivedFromId: template.derivedFromId,
    ownerId: template.ownerId,
    createdAt: new Date(template.createdAt).toISOString(),
    updatedAt: new Date(template.updatedAt).toISOString(),
  };
}

function serializeVersion(v: {
  id: string;
  version: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
}): FormTemplateVersionDto {
  return {
    id: v.id,
    version: v.version,
    kind: v.kind as FormTemplateEventKind,
    fromStatus: v.fromStatus as FormTemplateStatus | null,
    toStatus: v.toStatus as FormTemplateStatus | null,
    note: v.note,
    authorId: v.authorId,
    authorName: v.authorName,
    createdAt: new Date(v.createdAt).toISOString(),
  };
}
