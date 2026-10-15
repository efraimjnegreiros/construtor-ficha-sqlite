import { describe, expect, it } from 'vitest';
import type { FormFieldDefinitionDto } from '../../lib/api-client/models';
import { ageInYears, computeCalculation, isRequired, isVisible, requiredProgress, withCalculations } from './form-logic';

const field = (over: Partial<FormFieldDefinitionDto>): FormFieldDefinitionDto => ({
  id: over.key ?? 'id',
  sectionId: 's',
  groupId: null,
  key: 'k',
  label: 'L',
  type: 'NUMBER',
  required: false,
  helpText: null,
  placeholder: null,
  unit: null,
  prontuarioCode: null,
  options: [],
  config: {},
  visibleWhen: null,
  requiredWhen: null,
  calculation: null,
  position: 0,
  ...over,
});

const peso = field({ key: 'peso', required: true });
const altura = field({ key: 'altura', required: true });
const imc = field({ key: 'imc', type: 'CALCULATED', calculation: { formula: 'BMI', sourceKeys: ['peso', 'altura'], decimals: 1 } });
const circ = field({ key: 'circ', requiredWhen: { fieldKey: 'imc', operator: 'GREATER_THAN', value: '25' } });
const fumo = field({ key: 'tabagismo', type: 'SELECT_SINGLE', options: [{ value: 'fumante', label: 'Fumante' }, { value: 'nunca', label: 'Nunca' }] });
const cigarros = field({ key: 'cigarros', visibleWhen: { fieldKey: 'tabagismo', operator: 'EQUALS', value: 'fumante' } });

describe('form-logic', () => {
  it('calculates IMC from kg and cm', () => {
    expect(computeCalculation(imc.calculation!, { peso: '80', altura: '170' })).toBe(27.7);
    expect(computeCalculation(imc.calculation!, { peso: '80' })).toBeNull();
  });

  it('calculates age in full years', () => {
    expect(ageInYears('1964-05-20', new Date('2026-05-19T12:00:00'))).toBe(61);
    expect(ageInYears('1964-05-20', new Date('2026-05-20T12:00:00'))).toBe(62);
  });

  it('makes abdominal circumference required only when IMC > 25 (protótipo)', () => {
    const fields = [peso, altura, imc, circ];
    const magro = withCalculations(fields, { peso: '60', altura: '170' });
    const sobrepeso = withCalculations(fields, { peso: '90', altura: '170' });
    expect(isRequired(circ, magro)).toBe(false);
    expect(isRequired(circ, sobrepeso)).toBe(true);
    expect(requiredProgress(fields, sobrepeso)).toEqual({ total: 3, filled: 2 });
  });

  it('shows conditional fields only when the condition matches', () => {
    expect(isVisible(cigarros, { tabagismo: 'nunca' })).toBe(false);
    expect(isVisible(cigarros, { tabagismo: 'fumante' })).toBe(true);
    expect(fumo.options).toHaveLength(2);
  });
});
