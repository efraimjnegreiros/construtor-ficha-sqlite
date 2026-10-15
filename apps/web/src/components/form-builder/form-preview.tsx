// =============================================================================
// FormPreview — pré-visualização interativa da ficha
// -----------------------------------------------------------------------------
// Renderiza a estrutura como será preenchida e aplica, ao vivo, as regras do
// protótipo: campos condicionais, "obrigatório se…", cálculos automáticos
// (Idade, IMC…), contador "Obrigatórios x/y" e destaque âmbar em obrigatórios
// pendentes. Nada é salvo — serve para o configurador testar o modelo.
// =============================================================================
import { useMemo, useState } from 'react';
import { Calculator, Eraser } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { EmptyState } from '../ui/state-feedback';
import type { FormFieldDefinitionDto, FormStructureDto } from '../../lib/api-client/models';
import { FIELD_TYPE_MAP } from './field-types';
import {
  allFields,
  isFilled,
  isRequired,
  isVisible,
  requiredProgress,
  withCalculations,
  type FieldValue,
  type FormValues,
} from './form-logic';

const inputBase =
  'flex w-full rounded-md border bg-transparent dark:bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

export function FormPreview({ structure }: { structure: FormStructureDto }) {
  const [raw, setRaw] = useState<FormValues>({});
  const fields = useMemo(() => allFields(structure), [structure]);
  const values = useMemo(() => withCalculations(fields, raw), [fields, raw]);
  const progress = requiredProgress(fields, values);

  const set = (key: string, value: FieldValue) => setRaw((prev) => ({ ...prev, [key]: value }));

  if (fields.length === 0) {
    return <EmptyState title="Nada para pré-visualizar" description="Adicione campos à ficha para vê-la como será preenchida." />;
  }

  const renderFields = (list: FormFieldDefinitionDto[]) =>
    list.filter((f) => isVisible(f, values)).map((f) => <PreviewField key={f.id} field={f} values={values} onChange={set} />);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm">
        <span>
          Obrigatórios:{' '}
          <strong className={progress.filled === progress.total ? 'text-green-600' : 'text-amber-600'}>
            {progress.filled}/{progress.total}
          </strong>{' '}
          preenchidos
        </span>
        <Button size="sm" variant="outline" onClick={() => setRaw({})}>
          <Eraser className="h-3.5 w-3.5 mr-1" /> Limpar respostas
        </Button>
      </div>

      {structure.sections.map((section, index) => {
        const sectionFields = [...section.fields, ...section.groups.flatMap((g) => g.fields)];
        const p = requiredProgress(sectionFields, values);
        return (
          <Card key={section.id}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold text-slate-900 dark:text-white">
                  {index + 1}. {section.title}
                </h2>
                <span className="text-xs text-slate-500">
                  ({p.filled}/{p.total})
                </span>
              </div>
              {section.description && <p className="text-xs text-slate-500 -mt-3">{section.description}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{renderFields(section.fields)}</div>
              {section.groups.map((group) => (
                <div key={group.id} className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{group.title}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{renderFields(group.fields)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PreviewField({
  field,
  values,
  onChange,
}: {
  field: FormFieldDefinitionDto;
  values: FormValues;
  onChange: (key: string, value: FieldValue) => void;
}) {
  const value = values[field.key];
  const required = isRequired(field, values);
  const pending = required && !isFilled(value);
  const id = `preview-${field.key}`;
  const border = pending ? 'border-amber-400 dark:border-amber-500' : 'border-slate-300 dark:border-slate-700';
  const wide = ['LONG_TEXT', 'LAB_RESULTS', 'SELECT_MULTIPLE', 'SCALE', 'SIGNATURE'].includes(field.type);
  const str = typeof value === 'string' ? value : '';

  let control: React.ReactNode;
  switch (field.type) {
    case 'LONG_TEXT':
      control = (
        <textarea
          id={id}
          rows={3}
          className={`${inputBase} ${border}`}
          placeholder={field.placeholder ?? ''}
          maxLength={field.config.maxLength}
          value={str}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
      break;
    case 'NUMBER':
    case 'DATE':
    case 'TIME':
    case 'SHORT_TEXT':
      control = (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : field.type === 'TIME' ? 'time' : 'text'}
            className={`${inputBase} h-10 ${border}`}
            placeholder={field.placeholder ?? ''}
            min={field.config.min}
            max={field.config.max}
            step={field.config.step}
            maxLength={field.config.maxLength}
            value={str}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
          {field.unit && <span className="text-xs text-slate-500 shrink-0">{field.unit}</span>}
        </div>
      );
      break;
    case 'YES_NO':
    case 'SELECT_SINGLE':
      control = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className={`flex flex-wrap gap-2 rounded-md border p-2 ${border}`}>
          {field.options.map((o) => (
            <label key={o.value} className="inline-flex items-center gap-1.5 text-sm">
              <input type="radio" name={id} checked={str === o.value} onChange={() => onChange(field.key, o.value)} /> {o.label}
            </label>
          ))}
        </div>
      );
      break;
    case 'SELECT_MULTIPLE': {
      const list = Array.isArray(value) ? value : [];
      control = (
        <div className={`flex flex-wrap gap-3 rounded-md border p-2 ${border}`}>
          {field.options.map((o) => (
            <label key={o.value} className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={list.includes(o.value)}
                onChange={(e) =>
                  onChange(field.key, e.target.checked ? [...list, o.value] : list.filter((v) => v !== o.value))
                }
              />{' '}
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'SCALE': {
      const min = field.config.min ?? 0;
      const max = field.config.max ?? 10;
      const step = field.config.step ?? 1;
      const steps = Math.floor((max - min) / step) + 1;
      control = (
        <div className={`flex flex-wrap gap-1 rounded-md border p-2 ${border}`}>
          {Array.from({ length: Math.min(steps, 21) }).map((_, i) => {
            const v = String(Number((min + i * step).toFixed(4)));
            return (
              <button
                key={v}
                type="button"
                aria-pressed={str === v}
                onClick={() => onChange(field.key, v)}
                className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium ${
                  str === v ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {v}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case 'CALCULATED':
      control = (
        <div className="flex h-10 items-center gap-2 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 text-sm">
          <Calculator className="h-4 w-4 text-slate-400" />
          {isFilled(value) ? (
            <strong>
              {str} {field.unit}
            </strong>
          ) : (
            <span className="text-xs text-slate-400">Preencha os campos de origem</span>
          )}
        </div>
      );
      break;
    case 'ATTACHMENT':
      control = (
        <input
          id={id}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className={`${inputBase} ${border} text-xs`}
          onChange={(e) => onChange(field.key, e.target.files?.[0]?.name)}
        />
      );
      break;
    default:
      // Áudio, resultados laboratoriais e assinatura: simulados na pré-visualização.
      control = (
        <button
          type="button"
          onClick={() => onChange(field.key, isFilled(value) ? undefined : 'ok')}
          className={`flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed text-xs ${border} ${
            isFilled(value) ? 'text-green-600' : 'text-slate-500'
          }`}
        >
          {FIELD_TYPE_MAP[field.type]?.icon}
          {isFilled(value) ? `${FIELD_TYPE_MAP[field.type]?.label} registrado (simulado)` : `${FIELD_TYPE_MAP[field.type]?.label} — clique para simular`}
        </button>
      );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${wide ? 'md:col-span-2' : ''}`}>
      <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {field.label}
        {required && <span className="text-red-500"> *</span>}
        {field.unit && field.type !== 'NUMBER' && field.type !== 'CALCULATED' && (
          <span className="text-xs text-slate-400 font-normal"> ({field.unit})</span>
        )}
      </label>
      {control}
      {field.helpText && <span className="text-xs text-slate-400">{field.helpText}</span>}
    </div>
  );
}
