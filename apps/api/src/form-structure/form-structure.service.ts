// =============================================================================
// FormStructureService — cadastro dos campos da ficha (seções, grupos e campos)
// -----------------------------------------------------------------------------
// Autorização (de fora para dentro):
//   1. Guards (controller): leitura exige TEMPLATE_READ_*; escrita, TEMPLATE_UPDATE.
//   2. Este service: só o DONO do modelo (ou ADMIN) altera, e somente com o
//      modelo em RASCUNHO — a estrutura de um modelo em revisão/publicado é congelada
//      (para mudar, deriva-se um novo modelo).
// Regras do construtor (protótipo):
//   - Chave técnica única por modelo; condições e cálculos referenciam campos pela chave.
//   - Seleção única/múltipla exigem ≥ 2 opções; Sim/Não tem opções fixas.
//   - Cálculo automático: Idade (1 Data), IMC (Peso kg + Altura cm), Soma/Média (≥ 2 números).
//     Campo calculado nunca é preenchido à mão, então não pode ser obrigatório.
//   - "Obrigatório se…" substitui o obrigatório fixo (um ou outro).
//   - Condição/cálculo não pode apontar para o próprio campo nem formar ciclo.
//   - Não se exclui (nem se renomeia a chave de) campo usado por outro campo.
// Toda mutação devolve a árvore completa (FormStructureDto).
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
  CreateFormFieldDto,
  CreateFormGroupDto,
  CreateFormSectionDto,
  FieldCalculationDto,
  FieldConditionDto,
  FieldConfigDto,
  FieldOptionDto,
  FormFieldDefinitionDto,
  FormFieldType,
  FormStructureDto,
  ReorderDto,
  ReorderFieldsDto,
  UpdateFormFieldDto,
  UpdateFormGroupDto,
  UpdateFormSectionDto,
} from './form-structure.dto';

const NUMERIC_TYPES: readonly FormFieldType[] = ['NUMBER', 'SCALE', 'CALCULATED'];
const SELECT_TYPES: readonly FormFieldType[] = ['SELECT_SINGLE', 'SELECT_MULTIPLE'];
export const YES_NO_OPTIONS: FieldOptionDto[] = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
];

/** Forma "lógica" de um campo, usada pelas validações (independente do banco). */
export interface FieldShape {
  id?: string;
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: FieldOptionDto[];
  config: FieldConfigDto;
  visibleWhen: FieldConditionDto | null;
  requiredWhen: FieldConditionDto | null;
  calculation: FieldCalculationDto | null;
}

type FieldRow = {
  id: string;
  templateId: string;
  sectionId: string;
  groupId: string | null;
  key: string;
  label: string;
  type: string;
  required: boolean;
  helpText: string | null;
  placeholder: string | null;
  unit: string | null;
  prontuarioCode: string | null;
  options: string;
  config: string;
  visibleWhen: string | null;
  requiredWhen: string | null;
  calculation: string | null;
  position: number;
};

@Injectable()
export class FormStructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FormAccessService,
  ) {}

  // ---------------------------------------------------------------------------
  // Leitura
  // ---------------------------------------------------------------------------
  async getStructure(user: FormAccessSubject, templateId: string): Promise<FormStructureDto> {
    const template = await this.findTemplateOrFail(templateId);
    if (template.ownerId !== user.id && !(await this.access.can(user, FormPermission.TEMPLATE_READ_ALL))) {
      throw new ForbiddenException('Você não tem permissão para acessar este modelo.');
    }
    return this.buildTree(templateId, template.status === 'RASCUNHO');
  }

  // ---------------------------------------------------------------------------
  // Seções
  // ---------------------------------------------------------------------------
  async createSection(user: FormAccessSubject, templateId: string, dto: CreateFormSectionDto) {
    await this.assertEditable(user, templateId);
    const position = await this.prisma.formSection.count({ where: { templateId } });
    await this.prisma.formSection.create({
      data: { templateId, title: dto.title.trim(), description: clean(dto.description), position },
    });
    return this.touchAndBuild(templateId);
  }

  async updateSection(user: FormAccessSubject, templateId: string, sectionId: string, dto: UpdateFormSectionDto) {
    await this.assertEditable(user, templateId);
    await this.findSectionOrFail(templateId, sectionId);
    await this.prisma.formSection.update({
      where: { id: sectionId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: clean(dto.description) } : {}),
      },
    });
    return this.touchAndBuild(templateId);
  }

  async removeSection(user: FormAccessSubject, templateId: string, sectionId: string) {
    await this.assertEditable(user, templateId);
    await this.findSectionOrFail(templateId, sectionId);
    const all = await this.loadFields(templateId);
    this.assertNotReferenced(all, all.filter((f) => f.sectionId === sectionId));
    await this.prisma.formSection.delete({ where: { id: sectionId } });
    await this.compactSections(templateId);
    return this.touchAndBuild(templateId);
  }

  async reorderSections(user: FormAccessSubject, templateId: string, dto: ReorderDto) {
    await this.assertEditable(user, templateId);
    const sections = await this.prisma.formSection.findMany({ where: { templateId }, select: { id: true } });
    assertSameSet(sections.map((s) => s.id), dto.orderedIds, 'seções');
    await this.prisma.$transaction(
      dto.orderedIds.map((id, position) => this.prisma.formSection.update({ where: { id }, data: { position } })),
    );
    return this.touchAndBuild(templateId);
  }

  // ---------------------------------------------------------------------------
  // Grupos
  // ---------------------------------------------------------------------------
  async createGroup(user: FormAccessSubject, templateId: string, sectionId: string, dto: CreateFormGroupDto) {
    await this.assertEditable(user, templateId);
    await this.findSectionOrFail(templateId, sectionId);
    const position = await this.prisma.formGroup.count({ where: { sectionId } });
    await this.prisma.formGroup.create({
      data: {
        sectionId,
        title: dto.title.trim(),
        description: clean(dto.description),
        prontuarioComponent: clean(dto.prontuarioComponent),
        position,
      },
    });
    return this.touchAndBuild(templateId);
  }

  async updateGroup(user: FormAccessSubject, templateId: string, groupId: string, dto: UpdateFormGroupDto) {
    await this.assertEditable(user, templateId);
    await this.findGroupOrFail(templateId, groupId);
    await this.prisma.formGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: clean(dto.description) } : {}),
        ...(dto.prontuarioComponent !== undefined ? { prontuarioComponent: clean(dto.prontuarioComponent) } : {}),
      },
    });
    return this.touchAndBuild(templateId);
  }

  async removeGroup(user: FormAccessSubject, templateId: string, groupId: string) {
    await this.assertEditable(user, templateId);
    const group = await this.findGroupOrFail(templateId, groupId);
    const all = await this.loadFields(templateId);
    this.assertNotReferenced(all, all.filter((f) => f.groupId === groupId));
    await this.prisma.formGroup.delete({ where: { id: groupId } });
    await this.compactGroups(group.sectionId);
    return this.touchAndBuild(templateId);
  }

  async reorderGroups(user: FormAccessSubject, templateId: string, sectionId: string, dto: ReorderDto) {
    await this.assertEditable(user, templateId);
    await this.findSectionOrFail(templateId, sectionId);
    const groups = await this.prisma.formGroup.findMany({ where: { sectionId }, select: { id: true } });
    assertSameSet(groups.map((g) => g.id), dto.orderedIds, 'grupos');
    await this.prisma.$transaction(
      dto.orderedIds.map((id, position) => this.prisma.formGroup.update({ where: { id }, data: { position } })),
    );
    return this.touchAndBuild(templateId);
  }

  // ---------------------------------------------------------------------------
  // Campos
  // ---------------------------------------------------------------------------
  async createField(user: FormAccessSubject, templateId: string, dto: CreateFormFieldDto) {
    await this.assertEditable(user, templateId);
    const groupId = dto.groupId ?? null;
    await this.assertPlacement(templateId, dto.sectionId, groupId);

    const all = await this.loadFields(templateId);
    const shape = normalizeShape({
      key: dto.key,
      label: dto.label,
      type: dto.type,
      required: dto.required ?? false,
      options: dto.options ?? [],
      config: dto.config ?? {},
      visibleWhen: dto.visibleWhen ?? null,
      requiredWhen: dto.requiredWhen ?? null,
      calculation: dto.calculation ?? null,
    });
    validateFieldRules(shape, all.map(toShape));

    const position = await this.prisma.formField.count({ where: { sectionId: dto.sectionId, groupId } });
    await this.prisma.formField.create({
      data: {
        templateId,
        sectionId: dto.sectionId,
        groupId,
        key: shape.key,
        label: shape.label,
        type: shape.type,
        required: shape.required,
        helpText: clean(dto.helpText),
        placeholder: clean(dto.placeholder),
        unit: clean(dto.unit),
        prontuarioCode: clean(dto.prontuarioCode),
        ...serializeShapeJson(shape),
        position,
      },
    });
    return this.touchAndBuild(templateId);
  }

  async updateField(user: FormAccessSubject, templateId: string, fieldId: string, dto: UpdateFormFieldDto) {
    await this.assertEditable(user, templateId);
    const all = await this.loadFields(templateId);
    const existing = all.find((f) => f.id === fieldId);
    if (!existing) throw new NotFoundException('Campo não encontrado.');

    const current = toShape(existing);
    const shape = normalizeShape({
      id: fieldId,
      key: dto.key ?? current.key,
      label: dto.label ?? current.label,
      type: dto.type ?? current.type,
      required: dto.required ?? current.required,
      options: dto.options ?? current.options,
      config: dto.config ?? current.config,
      visibleWhen: dto.visibleWhen !== undefined ? dto.visibleWhen : current.visibleWhen,
      requiredWhen: dto.requiredWhen !== undefined ? dto.requiredWhen : current.requiredWhen,
      calculation: dto.calculation !== undefined ? dto.calculation : current.calculation,
    });

    const others = all.filter((f) => f.id !== fieldId);
    // Renomear a chave ou mudar o tipo quebraria condições/cálculos de outros campos.
    if (shape.key !== current.key || shape.type !== current.type) {
      const dependents = dependentsOf(current.key, others.map(toShape));
      if (dependents.length > 0) {
        throw new ConflictException(
          `Não é possível alterar a chave ou o tipo de "${current.label}": usado por ${listLabels(dependents)}.`,
        );
      }
    }
    validateFieldRules(shape, others.map(toShape));

    const moving = dto.sectionId !== undefined || dto.groupId !== undefined;
    const sectionId = dto.sectionId ?? existing.sectionId;
    const groupId = dto.groupId !== undefined ? dto.groupId : dto.sectionId !== undefined ? null : existing.groupId;
    let position = existing.position;
    if (moving && (sectionId !== existing.sectionId || groupId !== existing.groupId)) {
      await this.assertPlacement(templateId, sectionId, groupId);
      position = await this.prisma.formField.count({ where: { sectionId, groupId } });
    }

    await this.prisma.formField.update({
      where: { id: fieldId },
      data: {
        sectionId,
        groupId,
        position,
        key: shape.key,
        label: shape.label,
        type: shape.type,
        required: shape.required,
        ...(dto.helpText !== undefined ? { helpText: clean(dto.helpText) } : {}),
        ...(dto.placeholder !== undefined ? { placeholder: clean(dto.placeholder) } : {}),
        ...(dto.unit !== undefined ? { unit: clean(dto.unit) } : {}),
        ...(dto.prontuarioCode !== undefined ? { prontuarioCode: clean(dto.prontuarioCode) } : {}),
        ...serializeShapeJson(shape),
      },
    });
    return this.touchAndBuild(templateId);
  }

  async removeField(user: FormAccessSubject, templateId: string, fieldId: string) {
    await this.assertEditable(user, templateId);
    const all = await this.loadFields(templateId);
    const field = all.find((f) => f.id === fieldId);
    if (!field) throw new NotFoundException('Campo não encontrado.');
    this.assertNotReferenced(all, [field]);
    await this.prisma.formField.delete({ where: { id: fieldId } });
    return this.touchAndBuild(templateId);
  }

  async reorderFields(user: FormAccessSubject, templateId: string, dto: ReorderFieldsDto) {
    await this.assertEditable(user, templateId);
    const groupId = dto.groupId ?? null;
    await this.assertPlacement(templateId, dto.sectionId, groupId);
    const fields = await this.prisma.formField.findMany({
      where: { templateId, sectionId: dto.sectionId, groupId },
      select: { id: true },
    });
    assertSameSet(fields.map((f) => f.id), dto.orderedIds, 'campos');
    await this.prisma.$transaction(
      dto.orderedIds.map((id, position) => this.prisma.formField.update({ where: { id }, data: { position } })),
    );
    return this.touchAndBuild(templateId);
  }

  // ---------------------------------------------------------------------------
  // Auxiliares
  // ---------------------------------------------------------------------------
  private async findTemplateOrFail(templateId: string) {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, deletedAt: null },
      select: { id: true, ownerId: true, status: true },
    });
    if (!template) throw new NotFoundException('Modelo de ficha não encontrado.');
    return template;
  }

  private async assertEditable(user: FormAccessSubject, templateId: string): Promise<void> {
    const template = await this.findTemplateOrFail(templateId);
    if (user.role !== 'ADMIN' && template.ownerId !== user.id) {
      throw new ForbiddenException('Você não tem permissão para alterar a estrutura deste modelo.');
    }
    if (template.status !== 'RASCUNHO') {
      throw new ConflictException(
        'A estrutura só pode ser alterada com o modelo em Rascunho. Para mudar um modelo já enviado, derive um novo.',
      );
    }
  }

  private async findSectionOrFail(templateId: string, sectionId: string) {
    const section = await this.prisma.formSection.findFirst({ where: { id: sectionId, templateId } });
    if (!section) throw new NotFoundException('Seção não encontrada.');
    return section;
  }

  private async findGroupOrFail(templateId: string, groupId: string) {
    const group = await this.prisma.formGroup.findFirst({ where: { id: groupId, section: { templateId } } });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    return group;
  }

  private async assertPlacement(templateId: string, sectionId: string, groupId: string | null) {
    await this.findSectionOrFail(templateId, sectionId);
    if (groupId) {
      const group = await this.findGroupOrFail(templateId, groupId);
      if (group.sectionId !== sectionId) throw new BadRequestException('O grupo informado não pertence à seção.');
    }
  }

  private loadFields(templateId: string): Promise<FieldRow[]> {
    return this.prisma.formField.findMany({ where: { templateId } }) as Promise<FieldRow[]>;
  }

  /** Bloqueia remover campos que outros campos (que ficarão) usam em condição/cálculo. */
  private assertNotReferenced(all: FieldRow[], removing: FieldRow[]) {
    const removingIds = new Set(removing.map((f) => f.id));
    const remaining = all.filter((f) => !removingIds.has(f.id)).map(toShape);
    for (const field of removing) {
      const dependents = dependentsOf(field.key, remaining);
      if (dependents.length > 0) {
        throw new ConflictException(
          `O campo "${field.label}" é usado por ${listLabels(dependents)}. Ajuste as regras antes de excluir.`,
        );
      }
    }
  }

  private async compactSections(templateId: string) {
    const rows = await this.prisma.formSection.findMany({ where: { templateId }, orderBy: { position: 'asc' } });
    await this.prisma.$transaction(
      rows.map((row, position) => this.prisma.formSection.update({ where: { id: row.id }, data: { position } })),
    );
  }

  private async compactGroups(sectionId: string) {
    const rows = await this.prisma.formGroup.findMany({ where: { sectionId }, orderBy: { position: 'asc' } });
    await this.prisma.$transaction(
      rows.map((row, position) => this.prisma.formGroup.update({ where: { id: row.id }, data: { position } })),
    );
  }

  private async touchAndBuild(templateId: string): Promise<FormStructureDto> {
    // Marca o modelo como alterado (ordena a lista de modelos por última alteração).
    await this.prisma.formTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
    return this.buildTree(templateId, true);
  }

  private async buildTree(templateId: string, editable: boolean): Promise<FormStructureDto> {
    const [sections, groups, fields] = await Promise.all([
      this.prisma.formSection.findMany({ where: { templateId }, orderBy: { position: 'asc' } }),
      this.prisma.formGroup.findMany({ where: { section: { templateId } }, orderBy: { position: 'asc' } }),
      this.prisma.formField.findMany({ where: { templateId }, orderBy: { position: 'asc' } }) as Promise<FieldRow[]>,
    ]);
    const dtoFields = fields.map(serializeField);

    return {
      templateId,
      editable,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        position: section.position,
        fields: dtoFields.filter((f) => f.sectionId === section.id && f.groupId === null),
        groups: groups
          .filter((g) => g.sectionId === section.id)
          .map((group) => ({
            id: group.id,
            sectionId: group.sectionId,
            title: group.title,
            description: group.description,
            prontuarioComponent: group.prontuarioComponent,
            position: group.position,
            fields: dtoFields.filter((f) => f.groupId === group.id),
          })),
      })),
      fieldCount: dtoFields.length,
      requiredCount: dtoFields.filter((f) => f.required || f.requiredWhen).length,
      conditionalCount: dtoFields.filter((f) => f.visibleWhen || f.requiredWhen).length,
      calculationCount: dtoFields.filter((f) => f.calculation).length,
    };
  }
}

// =============================================================================
// Regras puras (exportadas para teste)
// =============================================================================

/** Ajusta o que é derivado do tipo antes de validar (opções do Sim/Não, campos irrelevantes). */
export function normalizeShape(shape: FieldShape): FieldShape {
  const out: FieldShape = { ...shape, key: shape.key.trim(), label: shape.label.trim() };
  if (out.type === 'YES_NO') out.options = YES_NO_OPTIONS;
  else if (!SELECT_TYPES.includes(out.type)) out.options = [];
  if (out.type !== 'CALCULATED') out.calculation = null;
  if (out.type === 'SCALE') {
    out.config = { min: out.config.min ?? 0, max: out.config.max ?? 10, step: out.config.step ?? 1 };
  }
  return out;
}

export function validateFieldRules(field: FieldShape, others: FieldShape[]): void {
  const fail = (message: string) => {
    throw new BadRequestException(message);
  };

  if (others.some((o) => o.key === field.key)) {
    throw new ConflictException(`Já existe um campo com a chave "${field.key}" neste modelo.`);
  }

  // Opções
  if (SELECT_TYPES.includes(field.type)) {
    if (field.options.length < 2) fail('Campos de seleção precisam de pelo menos 2 opções.');
    const values = field.options.map((o) => o.value);
    if (new Set(values).size !== values.length) fail('Os valores das opções devem ser únicos.');
  }

  // Limites
  const { min, max } = field.config ?? {};
  if (min !== undefined && max !== undefined && min >= max) fail('O mínimo deve ser menor que o máximo.');

  // Cálculo automático
  if (field.type === 'CALCULATED') {
    if (!field.calculation) fail('Campos de cálculo automático precisam de uma fórmula.');
    if (field.required || field.requiredWhen) fail('Campo calculado é preenchido automaticamente e não pode ser obrigatório.');
    const calc = field.calculation!;
    const sources = calc.sourceKeys.map((key) => {
      if (key === field.key) fail('O cálculo não pode usar o próprio campo.');
      const source = others.find((o) => o.key === key);
      if (!source) fail(`Campo de origem "${key}" não existe neste modelo.`);
      return source!;
    });
    const allNumeric = sources.every((s) => NUMERIC_TYPES.includes(s.type));
    if (calc.formula === 'AGE_YEARS' && (sources.length !== 1 || sources[0].type !== 'DATE')) {
      fail('Idade usa exatamente 1 campo de Data (ex.: data de nascimento).');
    }
    if (calc.formula === 'BMI' && (sources.length !== 2 || !allNumeric)) {
      fail('IMC usa exatamente 2 campos numéricos: peso (kg) e altura (cm), nessa ordem.');
    }
    if ((calc.formula === 'SUM' || calc.formula === 'AVERAGE') && (sources.length < 2 || !allNumeric)) {
      fail('Soma e média usam pelo menos 2 campos numéricos.');
    }
  }

  // Obrigatoriedade
  if (field.required && field.requiredWhen) {
    fail('Escolha entre "obrigatório" e "obrigatório se…", não os dois.');
  }

  // Condições
  for (const [label, condition] of [
    ['exibição', field.visibleWhen],
    ['obrigatoriedade', field.requiredWhen],
  ] as const) {
    if (!condition) continue;
    if (condition.fieldKey === field.key) fail(`A condição de ${label} não pode depender do próprio campo.`);
    const source = others.find((o) => o.key === condition.fieldKey);
    if (!source) fail(`A condição de ${label} usa o campo "${condition.fieldKey}", que não existe neste modelo.`);
    const op = condition.operator;
    if (op === 'CONTAINS' && source!.type !== 'SELECT_MULTIPLE') {
      fail('"Contém" só se aplica a campos de seleção múltipla.');
    }
    if ((op === 'GREATER_THAN' || op === 'LESS_THAN') && !NUMERIC_TYPES.includes(source!.type)) {
      fail('"Maior que" e "menor que" só se aplicam a campos numéricos, escala ou calculados.');
    }
    if ((op === 'GREATER_THAN' || op === 'LESS_THAN') && Number.isNaN(Number(condition.value))) {
      fail('O valor de comparação deve ser numérico.');
    }
    if (
      (op === 'EQUALS' || op === 'NOT_EQUALS' || op === 'CONTAINS') &&
      (SELECT_TYPES.includes(source!.type) || source!.type === 'YES_NO') &&
      !source!.options.some((o) => o.value === condition.value)
    ) {
      fail(`"${condition.value}" não é uma opção do campo "${source!.label}".`);
    }
  }

  // Ciclos (A depende de B que depende de A)
  const graph = new Map<string, string[]>();
  for (const f of [...others, field]) graph.set(f.key, referencedKeys(f));
  const visiting = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    visiting.add(key);
    const hasCycle = (graph.get(key) ?? []).some(visit);
    visiting.delete(key);
    return hasCycle;
  };
  if (visit(field.key)) fail('As regras deste campo criam uma dependência circular entre campos.');
}

export function referencedKeys(field: Pick<FieldShape, 'visibleWhen' | 'requiredWhen' | 'calculation'>): string[] {
  return [
    ...(field.visibleWhen ? [field.visibleWhen.fieldKey] : []),
    ...(field.requiredWhen ? [field.requiredWhen.fieldKey] : []),
    ...(field.calculation?.sourceKeys ?? []),
  ];
}

export function dependentsOf(key: string, fields: FieldShape[]): FieldShape[] {
  return fields.filter((f) => referencedKeys(f).includes(key));
}

function listLabels(fields: FieldShape[]): string {
  return fields.map((f) => `"${f.label}"`).join(', ');
}

function assertSameSet(current: string[], ordered: string[], noun: string) {
  const a = new Set(current);
  if (a.size !== ordered.length || new Set(ordered).size !== ordered.length || !ordered.every((id) => a.has(id))) {
    throw new BadRequestException(`A nova ordem deve conter exatamente os ${noun} atuais.`);
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function serializeShapeJson(shape: FieldShape) {
  return {
    options: JSON.stringify(shape.options.map((o) => ({ value: o.value.trim(), label: o.label.trim() }))),
    config: JSON.stringify(shape.config ?? {}),
    visibleWhen: shape.visibleWhen ? JSON.stringify(shape.visibleWhen) : null,
    requiredWhen: shape.requiredWhen ? JSON.stringify(shape.requiredWhen) : null,
    calculation: shape.calculation ? JSON.stringify(shape.calculation) : null,
  };
}

function toShape(row: FieldRow): FieldShape {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type as FormFieldType,
    required: row.required,
    options: parseJson<FieldOptionDto[]>(row.options, []),
    config: parseJson<FieldConfigDto>(row.config, {}),
    visibleWhen: parseJson<FieldConditionDto | null>(row.visibleWhen, null),
    requiredWhen: parseJson<FieldConditionDto | null>(row.requiredWhen, null),
    calculation: parseJson<FieldCalculationDto | null>(row.calculation, null),
  };
}

function serializeField(row: FieldRow): FormFieldDefinitionDto {
  const shape = toShape(row);
  return {
    id: row.id,
    sectionId: row.sectionId,
    groupId: row.groupId,
    key: row.key,
    label: row.label,
    type: shape.type,
    required: row.required,
    helpText: row.helpText,
    placeholder: row.placeholder,
    unit: row.unit,
    prontuarioCode: row.prontuarioCode,
    options: shape.options,
    config: shape.config,
    visibleWhen: shape.visibleWhen,
    requiredWhen: shape.requiredWhen,
    calculation: shape.calculation,
    position: row.position,
  };
}
