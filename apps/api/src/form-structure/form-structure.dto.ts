// =============================================================================
// DTOs da estrutura da ficha — seções, grupos e campos (Construtor de Fichas)
// -----------------------------------------------------------------------------
// Espelham o construtor do protótipo:
//   - Paleta: Texto curto, Texto longo, Número, Data, Hora, Sim/Não, Seleção única,
//     Seleção múltipla, Escala, Anexo, Áudio, Resultados laboratoriais, Assinatura,
//     Cálculo automático.
//   - Cada campo: rótulo, obrigatoriedade, "obrigatório se…", condição de exibição,
//     cálculo automático, unidade e vínculo com o Prontuário.
// =============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const FormFieldType = {
  SHORT_TEXT: 'SHORT_TEXT',
  LONG_TEXT: 'LONG_TEXT',
  NUMBER: 'NUMBER',
  DATE: 'DATE',
  TIME: 'TIME',
  YES_NO: 'YES_NO',
  SELECT_SINGLE: 'SELECT_SINGLE',
  SELECT_MULTIPLE: 'SELECT_MULTIPLE',
  SCALE: 'SCALE',
  ATTACHMENT: 'ATTACHMENT',
  AUDIO: 'AUDIO',
  LAB_RESULTS: 'LAB_RESULTS',
  SIGNATURE: 'SIGNATURE',
  CALCULATED: 'CALCULATED',
} as const;
export type FormFieldType = (typeof FormFieldType)[keyof typeof FormFieldType];

export const ConditionOperator = {
  EQUALS: 'EQUALS',
  NOT_EQUALS: 'NOT_EQUALS',
  CONTAINS: 'CONTAINS',
  GREATER_THAN: 'GREATER_THAN',
  LESS_THAN: 'LESS_THAN',
  IS_FILLED: 'IS_FILLED',
} as const;
export type ConditionOperator = (typeof ConditionOperator)[keyof typeof ConditionOperator];

export const CalculationFormula = {
  /** Idade em anos a partir de uma data (ex.: data de nascimento). */
  AGE_YEARS: 'AGE_YEARS',
  /** IMC = peso (kg) / altura (m)²; altura informada em cm. */
  BMI: 'BMI',
  SUM: 'SUM',
  AVERAGE: 'AVERAGE',
} as const;
export type CalculationFormula = (typeof CalculationFormula)[keyof typeof CalculationFormula];

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;
export const PRONTUARIO_CODE_PATTERN = /^PRT(\.[A-Z0-9]+)+$/;
export const PRONTUARIO_COMPONENT_PATTERN = /^PRT(\.[A-Z0-9]+)+@\d+\.\d+$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

// ----------------------------------------------------------------- blocos
export class FieldOptionDto {
  @ApiProperty({ example: 'tipo_2' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Toda opção precisa de um valor.' })
  @MaxLength(60)
  value!: string;

  @ApiProperty({ example: 'Tipo 2' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Toda opção precisa de um rótulo.' })
  @MaxLength(120)
  label!: string;
}

export class FieldConditionDto {
  @ApiProperty({ description: 'Chave do campo observado', example: 'tabagismo' })
  @IsString()
  @Matches(FIELD_KEY_PATTERN, { message: 'Chave do campo da condição inválida.' })
  fieldKey!: string;

  @ApiProperty({ enum: Object.values(ConditionOperator), enumName: 'ConditionOperator' })
  @IsIn(Object.values(ConditionOperator), { message: 'Operador de condição inválido.' })
  operator!: ConditionOperator;

  @ApiPropertyOptional({ description: 'Valor comparado (dispensado em IS_FILLED)', example: 'fumante' })
  @ValidateIf((o: FieldConditionDto) => o.operator !== 'IS_FILLED')
  @IsString({ message: 'Informe o valor da condição.' })
  @IsNotEmpty({ message: 'Informe o valor da condição.' })
  @MaxLength(120)
  value?: string;
}

export class FieldCalculationDto {
  @ApiProperty({ enum: Object.values(CalculationFormula), enumName: 'CalculationFormula' })
  @IsIn(Object.values(CalculationFormula), { message: 'Fórmula de cálculo inválida.' })
  formula!: CalculationFormula;

  @ApiProperty({ type: [String], description: 'Chaves dos campos de origem, na ordem da fórmula', example: ['peso', 'altura'] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos um campo de origem.' })
  @ArrayMaxSize(10)
  @Matches(FIELD_KEY_PATTERN, { each: true, message: 'Chave de campo de origem inválida.' })
  sourceKeys!: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 4, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  decimals?: number;
}

export class FieldConfigDto {
  @ApiPropertyOptional({ description: 'Mínimo (Número/Escala)' })
  @IsOptional()
  @IsNumber()
  min?: number;

  @ApiPropertyOptional({ description: 'Máximo (Número/Escala)' })
  @IsOptional()
  @IsNumber()
  max?: number;

  @ApiPropertyOptional({ description: 'Passo (Número/Escala)' })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  step?: number;

  @ApiPropertyOptional({ description: 'Tamanho máximo (textos)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxLength?: number;
}

// ----------------------------------------------------------------- seções e grupos
export class CreateFormSectionDto {
  @ApiProperty({ example: 'Anamnese', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'O título é obrigatório.' })
  @MaxLength(120, { message: 'O título deve ter no máximo 120 caracteres.' })
  title!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  description?: string;
}

export class UpdateFormSectionDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'O título é obrigatório.' })
  @MaxLength(120, { message: 'O título deve ter no máximo 120 caracteres.' })
  title?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  description?: string | null;
}

export class CreateFormGroupDto extends CreateFormSectionDto {
  @ApiPropertyOptional({ description: 'Componente do Prontuário (CÓDIGO@versão)', example: 'PRT.ANTRO@1.2' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Matches(PRONTUARIO_COMPONENT_PATTERN, { message: 'Componente do Prontuário inválido. Use PRT.CODIGO@1.0.' })
  prontuarioComponent?: string;
}

export class UpdateFormGroupDto extends UpdateFormSectionDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Envie null para desvincular' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Matches(PRONTUARIO_COMPONENT_PATTERN, { message: 'Componente do Prontuário inválido. Use PRT.CODIGO@1.0.' })
  prontuarioComponent?: string | null;
}

export class ReorderDto {
  @ApiProperty({ type: [String], description: 'Todos os ids do nível, na nova ordem' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  orderedIds!: string[];
}

export class ReorderFieldsDto extends ReorderDto {
  @ApiProperty()
  @IsUUID()
  sectionId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'null = campos soltos da seção' })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;
}

// ----------------------------------------------------------------- campos
class FieldBaseDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Texto de ajuda exibido abaixo do campo', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  helpText?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeholder?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Unidade (kg, cm, cig/dia...)', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Código no Prontuário', example: 'PRT.ANTRO.PESO' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Matches(PRONTUARIO_CODE_PATTERN, { message: 'Código do Prontuário inválido. Use PRT.GRUPO.CAMPO.' })
  prontuarioCode?: string | null;

  @ApiPropertyOptional({ type: [FieldOptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'No máximo 50 opções.' })
  @ValidateNested({ each: true })
  @Type(() => FieldOptionDto)
  options?: FieldOptionDto[];

  @ApiPropertyOptional({ type: FieldConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldConfigDto)
  config?: FieldConfigDto;

  @ApiPropertyOptional({ type: FieldConditionDto, nullable: true, description: 'Exibir somente quando…' })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldConditionDto)
  visibleWhen?: FieldConditionDto | null;

  @ApiPropertyOptional({ type: FieldConditionDto, nullable: true, description: 'Obrigatório se…' })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldConditionDto)
  requiredWhen?: FieldConditionDto | null;

  @ApiPropertyOptional({ type: FieldCalculationDto, nullable: true, description: 'Somente para CALCULATED' })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldCalculationDto)
  calculation?: FieldCalculationDto | null;
}

export class CreateFormFieldDto extends FieldBaseDto {
  @ApiProperty()
  @IsUUID()
  sectionId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'null = campo solto na seção' })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiProperty({ example: 'Peso', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'O rótulo é obrigatório.' })
  @MaxLength(120, { message: 'O rótulo deve ter no máximo 120 caracteres.' })
  label!: string;

  @ApiProperty({ description: 'Chave técnica única no modelo (minúsculas, números e _)', example: 'peso' })
  @Transform(trim)
  @IsString()
  @Matches(FIELD_KEY_PATTERN, { message: 'A chave deve começar com letra e usar apenas minúsculas, números e _.' })
  key!: string;

  @ApiProperty({ enum: Object.values(FormFieldType), enumName: 'FormFieldType' })
  @IsIn(Object.values(FormFieldType), { message: 'Tipo de campo inválido.' })
  type!: FormFieldType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class UpdateFormFieldDto extends FieldBaseDto {
  @ApiPropertyOptional({ description: 'Mover para outra seção' })
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'O rótulo é obrigatório.' })
  @MaxLength(120, { message: 'O rótulo deve ter no máximo 120 caracteres.' })
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(FIELD_KEY_PATTERN, { message: 'A chave deve começar com letra e usar apenas minúsculas, números e _.' })
  key?: string;

  @ApiPropertyOptional({ enum: Object.values(FormFieldType), enumName: 'FormFieldType' })
  @IsOptional()
  @IsIn(Object.values(FormFieldType), { message: 'Tipo de campo inválido.' })
  type?: FormFieldType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

// ----------------------------------------------------------------- respostas
export class FormFieldDefinitionDto {
  @ApiProperty() id!: string;
  @ApiProperty() sectionId!: string;
  @ApiProperty({ type: String, nullable: true }) groupId!: string | null;
  @ApiProperty({ example: 'peso' }) key!: string;
  @ApiProperty({ example: 'Peso' }) label!: string;
  @ApiProperty({ enum: Object.values(FormFieldType), enumName: 'FormFieldType' }) type!: FormFieldType;
  @ApiProperty() required!: boolean;
  @ApiProperty({ type: String, nullable: true }) helpText!: string | null;
  @ApiProperty({ type: String, nullable: true }) placeholder!: string | null;
  @ApiProperty({ type: String, nullable: true }) unit!: string | null;
  @ApiProperty({ type: String, nullable: true }) prontuarioCode!: string | null;
  @ApiProperty({ type: [FieldOptionDto] }) options!: FieldOptionDto[];
  @ApiProperty({ type: FieldConfigDto }) config!: FieldConfigDto;
  @ApiProperty({ type: FieldConditionDto, nullable: true }) visibleWhen!: FieldConditionDto | null;
  @ApiProperty({ type: FieldConditionDto, nullable: true }) requiredWhen!: FieldConditionDto | null;
  @ApiProperty({ type: FieldCalculationDto, nullable: true }) calculation!: FieldCalculationDto | null;
  @ApiProperty() position!: number;
}

export class FormGroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() sectionId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'PRT.ANTRO@1.2' }) prontuarioComponent!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [FormFieldDefinitionDto] }) fields!: FormFieldDefinitionDto[];
}

export class FormSectionDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [FormFieldDefinitionDto], description: 'Campos soltos (fora de grupos)' })
  fields!: FormFieldDefinitionDto[];
  @ApiProperty({ type: [FormGroupDto] }) groups!: FormGroupDto[];
}

export class FormStructureDto {
  @ApiProperty() templateId!: string;
  @ApiProperty({ description: 'false quando o modelo não está em Rascunho (estrutura congelada)' }) editable!: boolean;
  @ApiProperty({ type: [FormSectionDto] }) sections!: FormSectionDto[];
  @ApiProperty() fieldCount!: number;
  @ApiProperty() requiredCount!: number;
  @ApiProperty() conditionalCount!: number;
  @ApiProperty() calculationCount!: number;
}
