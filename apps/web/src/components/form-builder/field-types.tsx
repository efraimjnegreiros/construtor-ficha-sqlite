// =============================================================================
// Paleta de componentes do construtor (mesmos tipos do protótipo)
// =============================================================================
import {
  AudioLines,
  Calculator,
  Calendar,
  CircleDot,
  Clock,
  FlaskConical,
  Hash,
  ListChecks,
  Paperclip,
  PenLine,
  SlidersHorizontal,
  ToggleLeft,
  Type,
  AlignLeft,
} from 'lucide-react';
import type { CalculationFormula, ConditionOperator, FormFieldType } from '../../lib/api-client/models';

export interface FieldTypeMeta {
  type: FormFieldType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const icon = (Icon: typeof Type) => <Icon className="h-4 w-4" />;

export const FIELD_TYPES: FieldTypeMeta[] = [
  { type: 'SHORT_TEXT', label: 'Texto curto', description: 'Uma linha de texto', icon: icon(Type) },
  { type: 'LONG_TEXT', label: 'Texto longo', description: 'Parágrafos, evolução, conduta', icon: icon(AlignLeft) },
  { type: 'NUMBER', label: 'Número', description: 'Valor numérico com unidade', icon: icon(Hash) },
  { type: 'DATE', label: 'Data', description: 'Dia/mês/ano', icon: icon(Calendar) },
  { type: 'TIME', label: 'Hora', description: 'Horário', icon: icon(Clock) },
  { type: 'YES_NO', label: 'Sim / Não', description: 'Resposta binária', icon: icon(ToggleLeft) },
  { type: 'SELECT_SINGLE', label: 'Seleção única', description: 'Uma opção da lista', icon: icon(CircleDot) },
  { type: 'SELECT_MULTIPLE', label: 'Seleção múltipla', description: 'Várias opções da lista', icon: icon(ListChecks) },
  { type: 'SCALE', label: 'Escala', description: 'Ex.: dor EVA 0–10', icon: icon(SlidersHorizontal) },
  { type: 'ATTACHMENT', label: 'Anexo', description: 'PDF, JPG ou PNG', icon: icon(Paperclip) },
  { type: 'AUDIO', label: 'Áudio', description: 'Gravação de relato', icon: icon(AudioLines) },
  { type: 'LAB_RESULTS', label: 'Resultados laboratoriais', description: 'Painel de exames', icon: icon(FlaskConical) },
  { type: 'SIGNATURE', label: 'Assinatura', description: 'Consentimento/assinatura', icon: icon(PenLine) },
  { type: 'CALCULATED', label: 'Cálculo automático', description: 'Idade, IMC, soma, média', icon: icon(Calculator) },
];

export const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((m) => [m.type, m])) as Record<FormFieldType, FieldTypeMeta>;

export const SELECT_TYPES: FormFieldType[] = ['SELECT_SINGLE', 'SELECT_MULTIPLE'];
export const NUMERIC_TYPES: FormFieldType[] = ['NUMBER', 'SCALE', 'CALCULATED'];
export const TEXT_TYPES: FormFieldType[] = ['SHORT_TEXT', 'LONG_TEXT'];

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  EQUALS: 'é igual a',
  NOT_EQUALS: 'é diferente de',
  CONTAINS: 'contém',
  GREATER_THAN: 'é maior que',
  LESS_THAN: 'é menor que',
  IS_FILLED: 'está preenchido',
};

export const FORMULA_LABELS: Record<CalculationFormula, { label: string; hint: string }> = {
  AGE_YEARS: { label: 'Idade (anos)', hint: '1 campo de Data — ex.: data de nascimento' },
  BMI: { label: 'IMC (kg/m²)', hint: '2 campos numéricos: peso (kg) e altura (cm), nessa ordem' },
  SUM: { label: 'Soma', hint: '2 ou mais campos numéricos' },
  AVERAGE: { label: 'Média', hint: '2 ou mais campos numéricos' },
};

/** Operadores aplicáveis conforme o tipo do campo observado (espelha a API). */
export function operatorsFor(type: FormFieldType | undefined): ConditionOperator[] {
  if (!type) return ['IS_FILLED'];
  if (type === 'SELECT_MULTIPLE') return ['CONTAINS', 'IS_FILLED'];
  if (type === 'YES_NO' || type === 'SELECT_SINGLE') return ['EQUALS', 'NOT_EQUALS', 'IS_FILLED'];
  if (NUMERIC_TYPES.includes(type)) return ['GREATER_THAN', 'LESS_THAN', 'EQUALS', 'NOT_EQUALS', 'IS_FILLED'];
  return ['EQUALS', 'NOT_EQUALS', 'IS_FILLED'];
}

/** "Data de nascimento" → "data_nascimento" (sugestão de chave técnica). */
export function slugifyKey(label: string): string {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o']);
  const base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !stop.has(w))
    .join('_')
    .slice(0, 60);
  return /^[a-z]/.test(base) ? base : base ? `c_${base}`.slice(0, 60) : '';
}
