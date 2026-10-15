// =============================================================================
// DTOs do cadastro de fichas (modelos) — Construtor de Fichas
// -----------------------------------------------------------------------------
// Regras de negócio seguem o protótipo de governança de modelos:
//   - Cadastro: código FC-xxxx (gerado), nome, área clínica, SIGTAP, responsável,
//     complexidade, componentes do Prontuário e descrição.
//   - Ciclo de vida: Rascunho → Em revisão → Aprovado → Publicado ⇄ Suspenso → Inativo.
//   - Versionamento: cada alteração gera uma entrada no histórico (data, nota, autor).
//   - Derivação: um novo modelo pode nascer de um existente.
// =============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto, PaginationQueryDto } from '../common/dto/pagination.dto';

// Valores espelham os enums do Prisma (objetos `as const` para não depender do client gerado).
export const FormTemplateStatus = {
  RASCUNHO: 'RASCUNHO',
  EM_REVISAO: 'EM_REVISAO',
  APROVADO: 'APROVADO',
  PUBLICADO: 'PUBLICADO',
  SUSPENSO: 'SUSPENSO',
  INATIVO: 'INATIVO',
} as const;
export type FormTemplateStatus = (typeof FormTemplateStatus)[keyof typeof FormTemplateStatus];

export const ClinicalArea = {
  ENFERMAGEM: 'ENFERMAGEM',
  NUTRICAO: 'NUTRICAO',
  CLINICA_MEDICA: 'CLINICA_MEDICA',
  FISIOTERAPIA: 'FISIOTERAPIA',
  ODONTOLOGIA: 'ODONTOLOGIA',
  PSICOLOGIA: 'PSICOLOGIA',
  OBSTETRICIA: 'OBSTETRICIA',
} as const;
export type ClinicalArea = (typeof ClinicalArea)[keyof typeof ClinicalArea];

export const FormTemplateComplexity = {
  SIMPLES: 'SIMPLES',
  COMPLEXA: 'COMPLEXA',
  LONGITUDINAL: 'LONGITUDINAL',
} as const;
export type FormTemplateComplexity = (typeof FormTemplateComplexity)[keyof typeof FormTemplateComplexity];

export const FormTemplateEventKind = {
  CRIACAO: 'CRIACAO',
  EDICAO: 'EDICAO',
  TRANSICAO: 'TRANSICAO',
  DERIVACAO: 'DERIVACAO',
} as const;
export type FormTemplateEventKind = (typeof FormTemplateEventKind)[keyof typeof FormTemplateEventKind];

/** Ações de ciclo de vida disponíveis em POST /form-templates/:id/transitions. */
export const FormTemplateAction = {
  ENVIAR_REVISAO: 'ENVIAR_REVISAO',
  DEVOLVER: 'DEVOLVER',
  APROVAR: 'APROVAR',
  PUBLICAR: 'PUBLICAR',
  SUSPENDER: 'SUSPENDER',
  REATIVAR: 'REATIVAR',
  INATIVAR: 'INATIVAR',
} as const;
export type FormTemplateAction = (typeof FormTemplateAction)[keyof typeof FormTemplateAction];

export const SIGTAP_PATTERN = /^\d{2}\.\d{2}\.\d{2}\.\d{3}-\d$/;
export const PRONTUARIO_COMPONENT_PATTERN = /^PRT(\.[A-Z0-9]+)+@\d+\.\d+$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimList = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v)) : value;

export class CreateFormTemplateDto {
  @ApiProperty({ description: 'Nome do modelo de ficha', example: 'Avaliação Clínico-Nutricional', minLength: 3, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'O nome deve ter no mínimo 3 caracteres.' })
  @MaxLength(120, { message: 'O nome deve ter no máximo 120 caracteres.' })
  name!: string;

  @ApiPropertyOptional({ description: 'Descrição do modelo', example: 'Ficha de primeira consulta', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  description?: string;

  @ApiProperty({ enum: Object.values(ClinicalArea), enumName: 'ClinicalArea', example: ClinicalArea.NUTRICAO })
  @IsEnum(ClinicalArea, { message: 'Área clínica inválida.' })
  clinicalArea!: ClinicalArea;

  @ApiProperty({ description: 'Código do procedimento SIGTAP (00.00.00.000-0)', example: '03.01.01.004-8' })
  @Transform(trim)
  @IsString()
  @Matches(SIGTAP_PATTERN, { message: 'O código SIGTAP deve seguir o formato 00.00.00.000-0.' })
  sigtapCode!: string;

  @ApiProperty({ description: 'Profissional responsável pelo modelo', example: 'Prof. Ricardo Menezes', minLength: 3, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'O responsável deve ter no mínimo 3 caracteres.' })
  @MaxLength(120, { message: 'O responsável deve ter no máximo 120 caracteres.' })
  responsibleName!: string;

  @ApiPropertyOptional({
    enum: Object.values(FormTemplateComplexity),
    enumName: 'FormTemplateComplexity',
    default: FormTemplateComplexity.SIMPLES,
  })
  @IsOptional()
  @IsEnum(FormTemplateComplexity, { message: 'Complexidade inválida.' })
  complexity?: FormTemplateComplexity;

  @ApiPropertyOptional({
    description: 'Componentes do Prontuário usados pelo modelo (CÓDIGO@versão)',
    type: [String],
    example: ['PRT.IDENT@3.1', 'PRT.ANTRO@1.2'],
  })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(30, { message: 'Informe no máximo 30 componentes do Prontuário.' })
  @Matches(PRONTUARIO_COMPONENT_PATTERN, {
    each: true,
    message: 'Componente do Prontuário inválido. Use o formato PRT.CODIGO@1.0.',
  })
  prontuarioComponents?: string[];
}

export class UpdateFormTemplateDto {
  @ApiPropertyOptional({ description: 'Nome do modelo de ficha', minLength: 3, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'O nome deve ter no mínimo 3 caracteres.' })
  @MaxLength(120, { message: 'O nome deve ter no máximo 120 caracteres.' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Descrição do modelo; envie null para limpar',
    maxLength: 500,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A descrição deve ter no máximo 500 caracteres.' })
  description?: string | null;

  @ApiPropertyOptional({ enum: Object.values(ClinicalArea), enumName: 'ClinicalArea' })
  @IsOptional()
  @IsEnum(ClinicalArea, { message: 'Área clínica inválida.' })
  clinicalArea?: ClinicalArea;

  @ApiPropertyOptional({ description: 'Código do procedimento SIGTAP (00.00.00.000-0)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(SIGTAP_PATTERN, { message: 'O código SIGTAP deve seguir o formato 00.00.00.000-0.' })
  sigtapCode?: string;

  @ApiPropertyOptional({ description: 'Profissional responsável pelo modelo' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'O responsável deve ter no mínimo 3 caracteres.' })
  @MaxLength(120, { message: 'O responsável deve ter no máximo 120 caracteres.' })
  responsibleName?: string;

  @ApiPropertyOptional({ enum: Object.values(FormTemplateComplexity), enumName: 'FormTemplateComplexity' })
  @IsOptional()
  @IsEnum(FormTemplateComplexity, { message: 'Complexidade inválida.' })
  complexity?: FormTemplateComplexity;

  @ApiPropertyOptional({ type: [String], description: 'Componentes do Prontuário (CÓDIGO@versão)' })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(30, { message: 'Informe no máximo 30 componentes do Prontuário.' })
  @Matches(PRONTUARIO_COMPONENT_PATTERN, {
    each: true,
    message: 'Componente do Prontuário inválido. Use o formato PRT.CODIGO@1.0.',
  })
  prontuarioComponents?: string[];

  @ApiPropertyOptional({ description: 'Nota da versão (o que mudou)', maxLength: 300, example: 'Ajuste no SIGTAP' })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'A nota da versão deve ter no máximo 300 caracteres.' })
  versionNote?: string;
}

export class DeriveFormTemplateDto {
  @ApiProperty({ description: 'Nome do novo modelo derivado', minLength: 3, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'O nome deve ter no mínimo 3 caracteres.' })
  @MaxLength(120, { message: 'O nome deve ter no máximo 120 caracteres.' })
  name!: string;

  @ApiPropertyOptional({ description: 'Responsável pelo novo modelo (padrão: o do modelo de origem)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'O responsável deve ter no mínimo 3 caracteres.' })
  @MaxLength(120, { message: 'O responsável deve ter no máximo 120 caracteres.' })
  responsibleName?: string;
}

export class FormTemplateTransitionDto {
  @ApiProperty({ enum: Object.values(FormTemplateAction), enumName: 'FormTemplateAction' })
  @IsIn(Object.values(FormTemplateAction), { message: 'Ação de ciclo de vida inválida.' })
  action!: FormTemplateAction;

  @ApiPropertyOptional({ description: 'Justificativa (obrigatória para devolver, suspender e inativar)', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'A justificativa deve ter no máximo 300 caracteres.' })
  note?: string;
}

export class FormTemplateVersionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '1.0.1' })
  version!: string;

  @ApiProperty({ enum: Object.values(FormTemplateEventKind), enumName: 'FormTemplateEventKind' })
  kind!: FormTemplateEventKind;

  @ApiProperty({ enum: Object.values(FormTemplateStatus), enumName: 'FormTemplateStatus', nullable: true })
  fromStatus!: FormTemplateStatus | null;

  @ApiProperty({ enum: Object.values(FormTemplateStatus), enumName: 'FormTemplateStatus', nullable: true })
  toStatus!: FormTemplateStatus | null;

  @ApiProperty({ example: 'Modelo criado' })
  note!: string;

  @ApiProperty()
  authorId!: string;

  @ApiProperty({ example: 'Fernanda Costa' })
  authorName!: string;

  @ApiProperty()
  createdAt!: string;
}

export class FormTemplateDto {
  @ApiProperty({ example: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  id!: string;

  @ApiProperty({ description: 'Código sequencial do modelo', example: 'FC-0027' })
  code!: string;

  @ApiProperty({ example: 'Avaliação Clínico-Nutricional Metabólica' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ficha de primeira consulta' })
  description!: string | null;

  @ApiProperty({ enum: Object.values(ClinicalArea), enumName: 'ClinicalArea' })
  clinicalArea!: ClinicalArea;

  @ApiProperty({ example: '03.01.01.004-8' })
  sigtapCode!: string;

  @ApiProperty({ example: 'Prof. Ricardo Menezes' })
  responsibleName!: string;

  @ApiProperty({ enum: Object.values(FormTemplateComplexity), enumName: 'FormTemplateComplexity' })
  complexity!: FormTemplateComplexity;

  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({ enum: Object.values(FormTemplateStatus), enumName: 'FormTemplateStatus' })
  status!: FormTemplateStatus;

  @ApiProperty({ type: [String], example: ['PRT.IDENT@3.1'] })
  prontuarioComponents!: string[];

  @ApiProperty({ type: String, nullable: true, description: 'Modelo de origem (derivação)' })
  derivedFromId!: string | null;

  @ApiProperty({ description: 'Usuário que criou o modelo', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  ownerId!: string;

  @ApiProperty({ description: 'Data de criação' })
  createdAt!: string;

  @ApiProperty({ description: 'Data de última atualização' })
  updatedAt!: string;
}

export class FormTemplateDetailDto extends FormTemplateDto {
  @ApiProperty({ type: String, nullable: true, description: 'Código do modelo de origem', example: 'FC-0012' })
  derivedFromCode!: string | null;

  @ApiProperty({ type: [FormTemplateVersionDto], description: 'Histórico de versões (mais recente primeiro)' })
  versions!: FormTemplateVersionDto[];
}

export class FormTemplateStatusCountsDto {
  @ApiProperty() total!: number;
  @ApiProperty() RASCUNHO!: number;
  @ApiProperty() EM_REVISAO!: number;
  @ApiProperty() APROVADO!: number;
  @ApiProperty() PUBLICADO!: number;
  @ApiProperty() SUSPENSO!: number;
  @ApiProperty() INATIVO!: number;
}

export class PaginatedFormTemplatesResponseDto {
  @ApiProperty({ type: [FormTemplateDto] })
  data!: FormTemplateDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  @ApiProperty({ type: FormTemplateStatusCountsDto, description: 'Contagem por status (respeita os demais filtros)' })
  statusCounts!: FormTemplateStatusCountsDto;
}

export class ListFormTemplatesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Object.values(FormTemplateStatus), enumName: 'FormTemplateStatus' })
  @IsOptional()
  @IsEnum(FormTemplateStatus, { message: 'Status inválido.' })
  status?: FormTemplateStatus;

  @ApiPropertyOptional({ enum: Object.values(ClinicalArea), enumName: 'ClinicalArea' })
  @IsOptional()
  @IsEnum(ClinicalArea, { message: 'Área clínica inválida.' })
  clinicalArea?: ClinicalArea;

  @ApiPropertyOptional({ description: 'Filtra por código SIGTAP (contém)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sigtapCode?: string;

  @ApiPropertyOptional({ description: 'Filtra por responsável (contém)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsible?: string;
}
