// =============================================================================
// Motor de regras da ficha (front) — condições de exibição, "obrigatório se…"
// e cálculos automáticos. Usado pela pré-visualização e pronto para o preenchimento.
// =============================================================================
import type {
  FieldCalculationDto,
  FieldConditionDto,
  FormFieldDefinitionDto,
  FormStructureDto,
} from '../../lib/api-client/models';

export type FieldValue = string | string[] | undefined;
export type FormValues = Record<string, FieldValue>;

export function allFields(structure: FormStructureDto): FormFieldDefinitionDto[] {
  return structure.sections.flatMap((s) => [...s.fields, ...s.groups.flatMap((g) => g.fields)]);
}

export function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/** Idade completa em anos a partir de uma data ISO (yyyy-mm-dd). */
export function ageInYears(isoDate: string, today = new Date()): number | null {
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/** Calcula o valor de um campo automático; null = falta preencher os campos de origem. */
export function computeCalculation(calc: FieldCalculationDto, values: FormValues): number | null {
  const raw = calc.sourceKeys.map((k) => values[k]);
  if (!raw.every(isFilled)) return null;
  const decimals = calc.decimals ?? 1;
  const round = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(decimals)) : null);

  if (calc.formula === 'AGE_YEARS') return ageInYears(String(raw[0]));
  const nums = raw.map((v) => Number(v));
  if (nums.some((n) => Number.isNaN(n))) return null;
  if (calc.formula === 'BMI') {
    const [weightKg, heightCm] = nums;
    if (heightCm <= 0) return null;
    return round(weightKg / (heightCm / 100) ** 2);
  }
  const sum = nums.reduce((a, b) => a + b, 0);
  return round(calc.formula === 'SUM' ? sum : sum / nums.length);
}

/** Preenche os valores dos campos calculados (resolve cálculos que dependem de cálculos). */
export function withCalculations(fields: FormFieldDefinitionDto[], values: FormValues): FormValues {
  const out: FormValues = { ...values };
  const calculated = fields.filter((f) => f.type === 'CALCULATED' && f.calculation);
  for (let pass = 0; pass < calculated.length; pass++) {
    for (const field of calculated) {
      const result = computeCalculation(field.calculation!, out);
      out[field.key] = result === null ? undefined : String(result);
    }
  }
  return out;
}

export function evaluateCondition(condition: FieldConditionDto, values: FormValues): boolean {
  const current = values[condition.fieldKey];
  const expected = condition.value ?? '';
  switch (condition.operator) {
    case 'IS_FILLED':
      return isFilled(current);
    case 'CONTAINS':
      return Array.isArray(current) && current.includes(expected);
    case 'EQUALS':
      return isFilled(current) && String(current) === expected;
    case 'NOT_EQUALS':
      return isFilled(current) && String(current) !== expected;
    case 'GREATER_THAN':
      return isFilled(current) && Number(current) > Number(expected);
    case 'LESS_THAN':
      return isFilled(current) && Number(current) < Number(expected);
    default:
      return false;
  }
}

export function isVisible(field: FormFieldDefinitionDto, values: FormValues): boolean {
  return !field.visibleWhen || evaluateCondition(field.visibleWhen, values);
}

export function isRequired(field: FormFieldDefinitionDto, values: FormValues): boolean {
  if (!isVisible(field, values) || field.type === 'CALCULATED') return false;
  return field.required || (!!field.requiredWhen && evaluateCondition(field.requiredWhen, values));
}

/** Resumo para o contador "Obrigatórios x/y" (somente campos visíveis). */
export function requiredProgress(fields: FormFieldDefinitionDto[], values: FormValues) {
  const required = fields.filter((f) => isRequired(f, values));
  return { total: required.length, filled: required.filter((f) => isFilled(values[f.key])).length };
}

/** Texto curto de uma condição para exibir no construtor. */
export function describeCondition(condition: FieldConditionDto, fields: FormFieldDefinitionDto[]): string {
  const source = fields.find((f) => f.key === condition.fieldKey);
  const name = source?.label ?? condition.fieldKey;
  const valueLabel = source?.options.find((o) => o.value === condition.value)?.label ?? condition.value;
  const ops: Record<string, string> = {
    EQUALS: '=',
    NOT_EQUALS: '≠',
    CONTAINS: 'contém',
    GREATER_THAN: '>',
    LESS_THAN: '<',
    IS_FILLED: 'preenchido',
  };
  return condition.operator === 'IS_FILLED' ? `${name} preenchido` : `${name} ${ops[condition.operator]} ${valueLabel}`;
}
