import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFormAccessService } from '../form-access/form-access.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  FormStructureService,
  normalizeShape,
  validateFieldRules,
  type FieldShape,
} from './form-structure.service';

const shape = (over: Partial<FieldShape>): FieldShape =>
  normalizeShape({
    key: 'campo',
    label: 'Campo',
    type: 'SHORT_TEXT',
    required: false,
    options: [],
    config: {},
    visibleWhen: null,
    requiredWhen: null,
    calculation: null,
    ...over,
  });

const peso = shape({ key: 'peso', label: 'Peso', type: 'NUMBER' });
const altura = shape({ key: 'altura', label: 'Altura', type: 'NUMBER' });
const nascimento = shape({ key: 'data_nascimento', label: 'Data de nascimento', type: 'DATE' });
const tabagismo = shape({
  key: 'tabagismo',
  label: 'Tabagismo',
  type: 'SELECT_SINGLE',
  options: [
    { value: 'nunca', label: 'Nunca fumou' },
    { value: 'fumante', label: 'Fumante' },
  ],
});
const imc = shape({ key: 'imc', label: 'IMC', type: 'CALCULATED', calculation: { formula: 'BMI', sourceKeys: ['peso', 'altura'] } });

describe('validateFieldRules (regras do construtor)', () => {
  it('accepts the prototype’s IMC and Idade calculations', () => {
    expect(() => validateFieldRules(imc, [peso, altura])).not.toThrow();
    const idade = shape({ key: 'idade', type: 'CALCULATED', calculation: { formula: 'AGE_YEARS', sourceKeys: ['data_nascimento'] } });
    expect(() => validateFieldRules(idade, [nascimento])).not.toThrow();
  });

  it('rejects BMI with wrong sources and calculated fields marked as required', () => {
    const bad = shape({ key: 'imc', type: 'CALCULATED', calculation: { formula: 'BMI', sourceKeys: ['peso'] } });
    expect(() => validateFieldRules(bad, [peso])).toThrow(BadRequestException);
    expect(() => validateFieldRules({ ...imc, required: true }, [peso, altura])).toThrow(/não pode ser obrigatório/);
  });

  it('requires at least 2 unique options for selections and fixes Sim/Não options', () => {
    expect(() =>
      validateFieldRules(shape({ type: 'SELECT_SINGLE', options: [{ value: 'a', label: 'A' }] }), []),
    ).toThrow(/2 opções/);
    expect(shape({ type: 'YES_NO' }).options.map((o) => o.value)).toEqual(['sim', 'nao']);
  });

  it('validates conditional display (Cigarros por dia só se Fumante)', () => {
    const cigarros = shape({
      key: 'cigarros_dia',
      type: 'NUMBER',
      visibleWhen: { fieldKey: 'tabagismo', operator: 'EQUALS', value: 'fumante' },
    });
    expect(() => validateFieldRules(cigarros, [tabagismo])).not.toThrow();
    expect(() =>
      validateFieldRules({ ...cigarros, visibleWhen: { fieldKey: 'tabagismo', operator: 'EQUALS', value: 'x' } }, [tabagismo]),
    ).toThrow(/não é uma opção/);
    expect(() => validateFieldRules(cigarros, [])).toThrow(/não existe/);
  });

  it('validates "obrigatório se IMC > 25" and forbids mixing with fixed required', () => {
    const circ = shape({
      key: 'circunferencia',
      type: 'NUMBER',
      requiredWhen: { fieldKey: 'imc', operator: 'GREATER_THAN', value: '25' },
    });
    expect(() => validateFieldRules(circ, [peso, altura, imc])).not.toThrow();
    expect(() => validateFieldRules({ ...circ, required: true }, [peso, altura, imc])).toThrow(/não os dois/);
    expect(() =>
      validateFieldRules({ ...circ, requiredWhen: { fieldKey: 'tabagismo', operator: 'GREATER_THAN', value: '1' } }, [tabagismo]),
    ).toThrow(/numéricos/);
  });

  it('rejects duplicate keys and circular dependencies', () => {
    expect(() => validateFieldRules(shape({ key: 'peso' }), [peso])).toThrow(ConflictException);
    const a = shape({ key: 'a', type: 'NUMBER', visibleWhen: { fieldKey: 'b', operator: 'IS_FILLED' } });
    const b = shape({ key: 'b', type: 'NUMBER', visibleWhen: { fieldKey: 'a', operator: 'IS_FILLED' } });
    expect(() => validateFieldRules(a, [b])).toThrow(/circular/);
  });
});

describe('FormStructureService', () => {
  let service: FormStructureService;
  let prisma: any;
  const owner = { id: 'owner-1', role: 'USER' };
  const stranger = { id: 'stranger-1', role: 'USER' };
  const draft = { id: 'tpl-1', ownerId: 'owner-1', status: 'RASCUNHO' };

  const row = (over: Record<string, unknown>) => ({
    id: 'f-x',
    templateId: 'tpl-1',
    sectionId: 'sec-1',
    groupId: null,
    key: 'x',
    label: 'X',
    type: 'NUMBER',
    required: false,
    helpText: null,
    placeholder: null,
    unit: null,
    prontuarioCode: null,
    options: '[]',
    config: '{}',
    visibleWhen: null,
    requiredWhen: null,
    calculation: null,
    position: 0,
    ...over,
  });

  beforeEach(() => {
    prisma = {
      formTemplate: { findFirst: vi.fn().mockResolvedValue(draft), update: vi.fn() },
      formSection: {
        findFirst: vi.fn().mockResolvedValue({ id: 'sec-1', templateId: 'tpl-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      formGroup: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      formField: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(2),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new FormStructureService(prisma as unknown as PrismaService, new MockFormAccessService());
  });

  it('creates a field at the end of its section, storing rules as JSON', async () => {
    await service.createField(owner, 'tpl-1', {
      sectionId: 'sec-1',
      label: 'Diabetes',
      key: 'diabetes',
      type: 'SELECT_SINGLE',
      required: true,
      options: [
        { value: 'nao', label: 'Não' },
        { value: 'tipo_2', label: 'Tipo 2' },
      ],
    });
    expect(prisma.formField.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: 'diabetes',
        type: 'SELECT_SINGLE',
        required: true,
        groupId: null,
        position: 2,
        options: '[{"value":"nao","label":"Não"},{"value":"tipo_2","label":"Tipo 2"}]',
        calculation: null,
      }),
    });
  });

  it('freezes the structure outside Rascunho and blocks non-owners', async () => {
    prisma.formTemplate.findFirst.mockResolvedValue({ ...draft, status: 'PUBLICADO' });
    await expect(service.createSection(owner, 'tpl-1', { title: 'Anamnese' })).rejects.toThrow(ConflictException);

    prisma.formTemplate.findFirst.mockResolvedValue(draft);
    await expect(service.createSection(stranger, 'tpl-1', { title: 'Anamnese' })).rejects.toThrow(ForbiddenException);
  });

  it('refuses to delete a field used by another field’s rule', async () => {
    prisma.formField.findMany.mockResolvedValue([
      row({ id: 'f-peso', key: 'peso', label: 'Peso' }),
      row({ id: 'f-alt', key: 'altura', label: 'Altura' }),
      row({ id: 'f-imc', key: 'imc', label: 'IMC', type: 'CALCULATED', calculation: '{"formula":"BMI","sourceKeys":["peso","altura"]}' }),
    ]);
    await expect(service.removeField(owner, 'tpl-1', 'f-peso')).rejects.toThrow(/usado por "IMC"/);
    expect(prisma.formField.delete).not.toHaveBeenCalled();
  });

  it('rejects a reorder that does not contain exactly the current items', async () => {
    prisma.formSection.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await expect(service.reorderSections(owner, 'tpl-1', { orderedIds: ['a'] })).rejects.toThrow(BadRequestException);
  });

  it('builds the tree with counters for the header', async () => {
    prisma.formSection.findMany.mockResolvedValue([{ id: 'sec-1', title: 'Antropometria', description: null, position: 0 }]);
    prisma.formGroup.findMany.mockResolvedValue([
      { id: 'g-1', sectionId: 'sec-1', title: 'Medidas', description: null, prontuarioComponent: 'PRT.ANTRO@1.2', position: 0 },
    ]);
    prisma.formField.findMany.mockResolvedValue([
      row({ id: 'f-peso', key: 'peso', required: true, groupId: 'g-1' }),
      row({ id: 'f-imc', key: 'imc', type: 'CALCULATED', groupId: 'g-1', calculation: '{"formula":"BMI","sourceKeys":["peso","altura"]}' }),
      row({ id: 'f-circ', key: 'circ', requiredWhen: '{"fieldKey":"imc","operator":"GREATER_THAN","value":"25"}' }),
    ]);

    const tree = await service.getStructure(owner, 'tpl-1');

    expect(tree.editable).toBe(true);
    expect(tree.sections[0].fields.map((f) => f.key)).toEqual(['circ']);
    expect(tree.sections[0].groups[0].fields.map((f) => f.key)).toEqual(['peso', 'imc']);
    expect(tree).toMatchObject({ fieldCount: 3, requiredCount: 2, conditionalCount: 1, calculationCount: 1 });
  });
});
