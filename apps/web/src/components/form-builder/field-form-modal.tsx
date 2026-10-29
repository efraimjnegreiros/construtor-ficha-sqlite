// =============================================================================
// FieldFormModal — cadastro/configuração de um campo da ficha
// -----------------------------------------------------------------------------
// Mesmo padrão dos formulários do projeto: React Hook Form + Zod espelhando o
// CreateFormFieldDto/UpdateFormFieldDto (a API continua sendo a autoridade).
// Configura, como no protótipo: tipo (paleta), rótulo, chave, posição,
// obrigatoriedade ("obrigatório" ou "obrigatório se…"), condição de exibição,
// opções, limites, unidade, cálculo automático e vínculo com o Prontuário.
// =============================================================================
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import type {
  CalculationFormula,
  ConditionOperator,
  CreateFormFieldDto,
  FieldConditionDto,
  FormFieldDefinitionDto,
  FormFieldType,
  FormSectionDto,
  UpdateFormFieldDto,
} from '../../lib/api-client/models';
import {
  FIELD_TYPES,
  FIELD_TYPE_MAP,
  FORMULA_LABELS,
  NUMERIC_TYPES,
  OPERATOR_LABELS,
  SELECT_TYPES,
  TEXT_TYPES,
  operatorsFor,
  slugifyKey,
} from './field-types';

export type FieldModalTarget =
  | { mode: 'create'; sectionId: string; groupId: string | null; type?: FormFieldType }
  | { mode: 'edit'; field: FormFieldDefinitionDto };

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;
const PRT_CODE_PATTERN = /^PRT(\.[A-Z0-9]+)+$/;
const numberText = z.string().refine((v) => v.trim() === '' || !Number.isNaN(Number(v)), 'Informe um número.');

const conditionSchema = z.object({
  enabled: z.boolean(),
  fieldKey: z.string(),
  operator: z.string(),
  value: z.string(),
});

const fieldSchema = z
  .object({
    type: z.string().min(1, 'Escolha o tipo de campo.'),
    label: z.string().trim().min(1, 'O rótulo é obrigatório.').max(120, 'Máximo de 120 caracteres.'),
    key: z.string().trim().regex(KEY_PATTERN, 'Use minúsculas, números e _ (começando com letra).'),
    placement: z.string().min(1, 'Escolha onde o campo fica.'),
    requiredMode: z.enum(['optional', 'always', 'when']),
    helpText: z.string().max(300, 'Máximo de 300 caracteres.'),
    placeholder: z.string().max(120, 'Máximo de 120 caracteres.'),
    unit: z.string().max(20, 'Máximo de 20 caracteres.'),
    prontuarioCode: z
      .string()
      .trim()
      .refine((v) => v === '' || PRT_CODE_PATTERN.test(v.toUpperCase()), 'Use o formato PRT.GRUPO.CAMPO.'),
    options: z.array(z.object({ label: z.string(), value: z.string() })),
    min: numberText,
    max: numberText,
    step: numberText,
    maxLength: numberText,
    visibleWhen: conditionSchema,
    requiredWhen: conditionSchema,
    formula: z.string(),
    sourceKeys: z.array(z.string()),
    decimals: z.string(),
  })
  .superRefine((v, ctx) => {
    const type = v.type as FormFieldType;
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    if (SELECT_TYPES.includes(type)) {
      const filled = v.options.filter((o) => o.label.trim());
      if (filled.length < 2) issue('options', 'Informe pelo menos 2 opções.');
      const values = filled.map((o) => (o.value.trim() || slugifyKey(o.label)));
      if (new Set(values).size !== values.length) issue('options', 'Há opções repetidas.');
    }
    if (v.min.trim() && v.max.trim() && Number(v.min) >= Number(v.max)) issue('max', 'O máximo deve ser maior que o mínimo.');
    if (type === 'CALCULATED') {
      if (!v.formula) issue('formula', 'Escolha a fórmula.');
      const sources = v.sourceKeys.filter(Boolean);
      if (v.formula === 'AGE_YEARS' && sources.length !== 1) issue('sourceKeys', 'Escolha o campo de data.');
      if (v.formula === 'BMI' && sources.length !== 2) issue('sourceKeys', 'Escolha o peso e a altura.');
      if ((v.formula === 'SUM' || v.formula === 'AVERAGE') && sources.length < 2) issue('sourceKeys', 'Escolha pelo menos 2 campos.');
    }
    for (const name of ['visibleWhen', 'requiredWhen'] as const) {
      const c = v[name];
      const active = name === 'visibleWhen' ? c.enabled : v.requiredMode === 'when';
      if (!active) continue;
      if (!c.fieldKey) issue(`${name}.fieldKey`, 'Escolha o campo da condição.');
      if (c.operator !== 'IS_FILLED' && !c.value.trim()) issue(`${name}.value`, 'Informe o valor.');
    }
  });

type FieldFormValues = z.infer<typeof fieldSchema>;

const inputClass =
  'flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent dark:bg-slate-900 px-3 py-1.5 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

const emptyCondition = { enabled: false, fieldKey: '', operator: 'EQUALS', value: '' };

function toConditionForm(c: FieldConditionDto | null | undefined) {
  return c ? { enabled: true, fieldKey: c.fieldKey, operator: c.operator, value: c.value ?? '' } : emptyCondition;
}

function toCondition(c: FieldFormValues['visibleWhen']): FieldConditionDto {
  const operator = c.operator as ConditionOperator;
  return { fieldKey: c.fieldKey, operator, ...(operator === 'IS_FILLED' ? {} : { value: c.value.trim() }) };
}

const optionalNumber = (v: string) => (v.trim() === '' ? undefined : Number(v));
const orNull = (v: string) => (v.trim() ? v.trim() : null);

export function FieldFormModal({
  target,
  sections,
  isLoading,
  onClose,
  onCreate,
  onUpdate,
}: {
  target: FieldModalTarget;
  sections: FormSectionDto[];
  isLoading: boolean;
  onClose: () => void;
  onCreate: (data: CreateFormFieldDto) => void;
  onUpdate: (fieldId: string, data: UpdateFormFieldDto) => void;
}) {
  const editing = target.mode === 'edit' ? target.field : null;

  // Todos os campos do modelo (para condições e cálculos), exceto o próprio.
  const otherFields = useMemo(
    () =>
      sections
        .flatMap((s) => [...s.fields, ...s.groups.flatMap((g) => g.fields)])
        .filter((f) => f.id !== editing?.id),
    [sections, editing?.id],
  );

  const placements = sections.flatMap((s, i) => [
    { value: `${s.id}|`, label: `§${i + 1} ${s.title} (sem grupo)` },
    ...s.groups.map((g) => ({ value: `${s.id}|${g.id}`, label: `§${i + 1} ${s.title} › ${g.title}` })),
  ]);

  const initialPlacement = editing
    ? `${editing.sectionId}|${editing.groupId ?? ''}`
    : target.mode === 'create'
      ? `${target.sectionId}|${target.groupId ?? ''}`
      : '';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, dirtyFields },
  } = useForm<FieldFormValues>({
    resolver: zodResolver(fieldSchema),
    defaultValues: {
      type: editing?.type ?? (target.mode === 'create' ? (target.type ?? '') : ''),
      label: editing?.label ?? '',
      key: editing?.key ?? '',
      placement: initialPlacement,
      requiredMode: editing?.required ? 'always' : editing?.requiredWhen ? 'when' : 'optional',
      helpText: editing?.helpText ?? '',
      placeholder: editing?.placeholder ?? '',
      unit: editing?.unit ?? '',
      prontuarioCode: editing?.prontuarioCode ?? '',
      options: editing && SELECT_TYPES.includes(editing.type) ? editing.options : [
        { label: '', value: '' },
        { label: '', value: '' },
      ],
      min: editing?.config.min?.toString() ?? '',
      max: editing?.config.max?.toString() ?? '',
      step: editing?.config.step?.toString() ?? '',
      maxLength: editing?.config.maxLength?.toString() ?? '',
      visibleWhen: toConditionForm(editing?.visibleWhen),
      requiredWhen: { ...toConditionForm(editing?.requiredWhen), enabled: !!editing?.requiredWhen },
      formula: editing?.calculation?.formula ?? '',
      sourceKeys: editing?.calculation?.sourceKeys ?? [],
      decimals: String(editing?.calculation?.decimals ?? 1),
    },
  });

  const { fields: optionRows, append, remove } = useFieldArray({ control, name: 'options' });

  const type = watch('type') as FormFieldType | '';
  const requiredMode = watch('requiredMode');
  const formula = watch('formula') as CalculationFormula | '';
  const sourceKeys = watch('sourceKeys');
  const visibleEnabled = watch('visibleWhen.enabled');

  // Chave sugerida a partir do rótulo enquanto o usuário não a editar.
  const labelField = register('label');
  const keyLocked = !!editing || !!dirtyFields.key;

  const submit = (v: FieldFormValues) => {
    const fieldType = v.type as FormFieldType;
    const [sectionId, groupPart] = v.placement.split('|');
    const options = SELECT_TYPES.includes(fieldType)
      ? v.options
          .filter((o) => o.label.trim())
          .map((o) => ({ label: o.label.trim(), value: o.value.trim() || slugifyKey(o.label) }))
      : [];
    const config = {
      ...(NUMERIC_TYPES.includes(fieldType) && fieldType !== 'CALCULATED'
        ? { min: optionalNumber(v.min), max: optionalNumber(v.max), step: optionalNumber(v.step) }
        : {}),
      ...(TEXT_TYPES.includes(fieldType) ? { maxLength: optionalNumber(v.maxLength) } : {}),
    };
    const isCalculated = fieldType === 'CALCULATED';
    const payload = {
      label: v.label.trim(),
      key: v.key.trim(),
      type: fieldType,
      required: !isCalculated && v.requiredMode === 'always',
      helpText: orNull(v.helpText),
      placeholder: orNull(v.placeholder),
      unit: orNull(v.unit),
      prontuarioCode: v.prontuarioCode.trim() ? v.prontuarioCode.trim().toUpperCase() : null,
      options,
      config: JSON.parse(JSON.stringify(config)),
      visibleWhen: v.visibleWhen.enabled ? toCondition(v.visibleWhen) : null,
      requiredWhen: !isCalculated && v.requiredMode === 'when' ? toCondition(v.requiredWhen) : null,
      calculation: isCalculated
        ? {
            formula: v.formula as CalculationFormula,
            sourceKeys: v.sourceKeys.filter(Boolean),
            decimals: Number(v.decimals) || 0,
          }
        : null,
      sectionId,
      groupId: groupPart || null,
    };
    if (editing) onUpdate(editing.id, payload);
    else onCreate(payload as CreateFormFieldDto);
  };

  // ------------------------------------------------------------ passo 1: tipo
  if (!type) {
    return (
      <Modal title="Adicionar campo" subtitle="Escolha um componente da paleta." size="lg" onClose={onClose}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FIELD_TYPES.map((meta) => (
            <button
              key={meta.type}
              type="button"
              onClick={() => setValue('type', meta.type)}
              className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-left hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30"
            >
              <span className="text-blue-600 mt-0.5">{meta.icon}</span>
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{meta.label}</span>
                <span className="block text-xs text-slate-500">{meta.description}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  const meta = FIELD_TYPE_MAP[type];
  const isCalculated = type === 'CALCULATED';
  const numericSources = otherFields.filter((f) => NUMERIC_TYPES.includes(f.type));
  const dateSources = otherFields.filter((f) => f.type === 'DATE');
  const sourceCount = formula === 'AGE_YEARS' ? 1 : formula === 'BMI' ? 2 : Math.max(2, sourceKeys.length + (sourceKeys.every(Boolean) ? 1 : 0));

  return (
    <Modal
      title={editing ? `Configurar campo — ${editing.label}` : `Novo campo: ${meta.label}`}
      subtitle="Configure rótulo, obrigatoriedade, regras lógicas e cálculos."
      size="lg"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        {/* Identificação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Rótulo *" htmlFor="field-label" error={errors.label?.message}>
            <input
              id="field-label"
              className={inputClass}
              autoFocus
              placeholder="Ex.: Peso"
              {...labelField}
              onChange={(e) => {
                void labelField.onChange(e);
                if (!keyLocked) setValue('key', slugifyKey(e.target.value));
              }}
            />
          </Field>
          <Field label="Chave técnica *" htmlFor="field-key" error={errors.key?.message} hint="Usada em condições e cálculos.">
            <input id="field-key" className={`${inputClass} font-mono`} placeholder="peso" {...register('key')} />
          </Field>
          <Field label="Tipo" htmlFor="field-type">
            <select id="field-type" className={inputClass} {...register('type')} disabled={!!editing}>
              {FIELD_TYPES.map((m) => (
                <option key={m.type} value={m.type}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Posição na ficha" htmlFor="field-placement" error={errors.placement?.message}>
            <select id="field-placement" className={inputClass} {...register('placement')}>
              {placements.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Opções */}
        {SELECT_TYPES.includes(type) && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Opções *</legend>
            {optionRows.map((row, index) => (
              <div key={row.id} className="flex gap-2">
                <input
                  aria-label={`Opção ${index + 1}`}
                  className={inputClass}
                  placeholder={`Opção ${index + 1}`}
                  {...register(`options.${index}.label`)}
                />
                <input
                  aria-label={`Valor da opção ${index + 1}`}
                  className={`${inputClass} font-mono max-w-[10rem]`}
                  placeholder="valor (auto)"
                  {...register(`options.${index}.value`)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-red-500"
                  aria-label={`Remover opção ${index + 1}`}
                  disabled={optionRows.length <= 2}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {errors.options?.message && <p className="text-xs text-red-500">{errors.options.message}</p>}
            {errors.options?.root?.message && <p className="text-xs text-red-500">{errors.options.root.message}</p>}
            <Button type="button" size="sm" variant="ghost" onClick={() => append({ label: '', value: '' })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar opção
            </Button>
          </fieldset>
        )}

        {/* Cálculo automático */}
        {isCalculated && (
          <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">Cálculo automático</legend>
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
              <Field label="Fórmula" htmlFor="field-formula" error={errors.formula?.message}>
                <select
                  id="field-formula"
                  className={inputClass}
                  {...register('formula')}
                  onChange={(e) => {
                    setValue('formula', e.target.value);
                    setValue('sourceKeys', []);
                  }}
                >
                  <option value="">Selecione...</option>
                  {(Object.keys(FORMULA_LABELS) as CalculationFormula[]).map((f) => (
                    <option key={f} value={f}>
                      {FORMULA_LABELS[f].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Casas decimais" htmlFor="field-decimals">
                <select id="field-decimals" className={inputClass} {...register('decimals')}>
                  {[0, 1, 2, 3, 4].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {formula && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{FORMULA_LABELS[formula].hint}</p>
                {Array.from({ length: sourceCount }).map((_, i) => {
                  const candidates = formula === 'AGE_YEARS' ? dateSources : numericSources;
                  const label =
                    formula === 'BMI' ? (i === 0 ? 'Peso (kg)' : 'Altura (cm)') : formula === 'AGE_YEARS' ? 'Data' : `Campo ${i + 1}`;
                  return (
                    <select
                      key={i}
                      aria-label={`Origem: ${label}`}
                      className={inputClass}
                      value={sourceKeys[i] ?? ''}
                      onChange={(e) => {
                        const next = [...sourceKeys];
                        next[i] = e.target.value;
                        setValue('sourceKeys', next.filter((k, idx) => k || idx < sourceCount - 1), { shouldValidate: true });
                      }}
                    >
                      <option value="">{label}: selecione...</option>
                      {candidates.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} ({f.key})
                        </option>
                      ))}
                    </select>
                  );
                })}
                {candidates(formula, dateSources, numericSources) === 0 && (
                  <p className="text-xs text-amber-600">
                    Cadastre antes os campos de origem ({formula === 'AGE_YEARS' ? 'Data' : 'Número'}).
                  </p>
                )}
                {errors.sourceKeys?.message && <p className="text-xs text-red-500">{errors.sourceKeys.message}</p>}
              </div>
            )}
          </fieldset>
        )}

        {/* Obrigatoriedade */}
        {!isCalculated && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Obrigatoriedade</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ['optional', 'Opcional'],
                  ['always', 'Obrigatório'],
                  ['when', 'Obrigatório se…'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-1.5">
                  <input type="radio" value={value} {...register('requiredMode')} /> {label}
                </label>
              ))}
            </div>
            {requiredMode === 'when' && (
              <ConditionEditor
                name="requiredWhen"
                register={register}
                watch={watch}
                setValue={setValue}
                fields={otherFields}
                errors={errors.requiredWhen}
              />
            )}
          </fieldset>
        )}

        {/* Condição de exibição */}
        <fieldset className="space-y-2">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input type="checkbox" {...register('visibleWhen.enabled')} /> Exibir somente quando… (campo condicional)
          </label>
          {visibleEnabled && (
            <ConditionEditor
              name="visibleWhen"
              register={register}
              watch={watch}
              setValue={setValue}
              fields={otherFields}
              errors={errors.visibleWhen}
            />
          )}
        </fieldset>

        {/* Limites e apresentação */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {NUMERIC_TYPES.includes(type) && !isCalculated && (
            <>
              <Field label="Mínimo" htmlFor="field-min" error={errors.min?.message}>
                <input id="field-min" inputMode="decimal" className={inputClass} placeholder={type === 'SCALE' ? '0' : ''} {...register('min')} />
              </Field>
              <Field label="Máximo" htmlFor="field-max" error={errors.max?.message}>
                <input id="field-max" inputMode="decimal" className={inputClass} placeholder={type === 'SCALE' ? '10' : ''} {...register('max')} />
              </Field>
              <Field label="Passo" htmlFor="field-step" error={errors.step?.message}>
                <input id="field-step" inputMode="decimal" className={inputClass} placeholder="1" {...register('step')} />
              </Field>
            </>
          )}
          {TEXT_TYPES.includes(type) && (
            <Field label="Máx. caracteres" htmlFor="field-maxlength" error={errors.maxLength?.message}>
              <input id="field-maxlength" inputMode="numeric" className={inputClass} {...register('maxLength')} />
            </Field>
          )}
          {(NUMERIC_TYPES.includes(type)) && (
            <Field label="Unidade" htmlFor="field-unit" error={errors.unit?.message}>
              <input id="field-unit" className={inputClass} placeholder="kg, cm..." {...register('unit')} />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Código no Prontuário" htmlFor="field-prt" error={errors.prontuarioCode?.message} hint="Ex.: PRT.ANTRO.PESO">
            <input id="field-prt" className={`${inputClass} font-mono uppercase`} {...register('prontuarioCode')} />
          </Field>
          {[...TEXT_TYPES, 'NUMBER'].includes(type) && (
            <Field label="Placeholder" htmlFor="field-placeholder" error={errors.placeholder?.message}>
              <input id="field-placeholder" className={inputClass} {...register('placeholder')} />
            </Field>
          )}
        </div>
        <Field label="Texto de ajuda" htmlFor="field-help" error={errors.helpText?.message}>
          <input id="field-help" className={inputClass} placeholder="Orientação exibida abaixo do campo" {...register('helpText')} />
        </Field>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          {!editing ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setValue('type', '')}>
              Trocar tipo
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" isLoading={isLoading}>
              {editing ? 'Salvar campo' : 'Adicionar campo'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function candidates(formula: string, dates: unknown[], numbers: unknown[]): number {
  return formula === 'AGE_YEARS' ? dates.length : numbers.length;
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
      {error ? <span className="text-xs text-red-500">{error}</span> : hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </div>
  );
}

// Editor de condição: [campo] [operador] [valor]
function ConditionEditor({
  name,
  register,
  watch,
  setValue,
  fields,
  errors,
}: {
  name: 'visibleWhen' | 'requiredWhen';
  register: ReturnType<typeof useForm<FieldFormValues>>['register'];
  watch: ReturnType<typeof useForm<FieldFormValues>>['watch'];
  setValue: ReturnType<typeof useForm<FieldFormValues>>['setValue'];
  fields: FormFieldDefinitionDto[];
  errors?: { fieldKey?: { message?: string }; value?: { message?: string } };
}) {
  const fieldKey = watch(`${name}.fieldKey`);
  const operator = watch(`${name}.operator`) as ConditionOperator;
  const source = fields.find((f) => f.key === fieldKey);
  const operators = operatorsFor(source?.type);
  const hasOptions = !!source && (SELECT_TYPES.includes(source.type) || source.type === 'YES_NO');
  const options = source?.type === 'YES_NO' ? [{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }] : (source?.options ?? []);
  const prefix = name === 'visibleWhen' ? 'Exibir quando' : 'Obrigatório quando';

  // Ao trocar o campo observado, mantém um operador válido para o tipo dele.
  useEffect(() => {
    if (!operators.includes(operator)) setValue(`${name}.operator`, operators[0]);
  }, [operators, operator, name, setValue]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 p-2">
      <div>
        <select aria-label={`${prefix}: campo`} className={inputClass} {...register(`${name}.fieldKey`)}>
          <option value="">Campo...</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        {errors?.fieldKey?.message && <span className="text-xs text-red-500">{errors.fieldKey.message}</span>}
      </div>
      <select aria-label={`${prefix}: operador`} className={inputClass} {...register(`${name}.operator`)}>
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>
      {operator !== 'IS_FILLED' && (
        <div>
          {hasOptions ? (
            <select aria-label={`${prefix}: valor`} className={inputClass} {...register(`${name}.value`)}>
              <option value="">Valor...</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input aria-label={`${prefix}: valor`} className={inputClass} placeholder="Valor" {...register(`${name}.value`)} />
          )}
          {errors?.value?.message && <span className="text-xs text-red-500">{errors.value.message}</span>}
        </div>
      )}
    </div>
  );
}
