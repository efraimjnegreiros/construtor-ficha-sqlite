// =============================================================================
// DTOs do módulo de CATEGORIAS de tarefas
// -----------------------------------------------------------------------------
// Segue o mesmo padrão de apps/api/src/tasks/task.dto.ts:
//   - class-validator  -> valida o que chega no corpo/query da requisição
//   - @ApiProperty     -> documenta no Swagger e alimenta o openapi.json,
//                         que o Orval usa para gerar o cliente do frontend
// =============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto, PaginationQueryDto } from '../common/dto/pagination.dto';

// Regex de cor hexadecimal no formato #RRGGBB (ex.: #3B82F6).
// Exportada porque o service também usa para normalizar/validar.
export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

// Cor padrão usada quando o usuário não informa nenhuma (azul do tema).
export const DEFAULT_CATEGORY_COLOR = '#3B82F6';

// -----------------------------------------------------------------------------
// ENTRADA: criação de categoria (POST /categories)
// -----------------------------------------------------------------------------
export class CreateCategoryDto {
  @ApiProperty({ description: 'Nome da categoria', example: 'Trabalho', minLength: 2, maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'O nome deve ter no mínimo 2 caracteres.' })
  @MaxLength(50, { message: 'O nome deve ter no máximo 50 caracteres.' })
  name!: string;

  @ApiPropertyOptional({ description: 'Cor da categoria em hexadecimal (#RRGGBB)', example: '#3B82F6', default: DEFAULT_CATEGORY_COLOR })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'A cor deve estar no formato hexadecimal #RRGGBB.' })
  color?: string;
}

// -----------------------------------------------------------------------------
// ENTRADA: atualização de categoria (PUT /categories/:id)
// Todos os campos opcionais: só é alterado o que for enviado.
// -----------------------------------------------------------------------------
export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: 'Nome da categoria', example: 'Pessoal', minLength: 2, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter no mínimo 2 caracteres.' })
  @MaxLength(50, { message: 'O nome deve ter no máximo 50 caracteres.' })
  name?: string;

  @ApiPropertyOptional({ description: 'Cor da categoria em hexadecimal (#RRGGBB)', example: '#10B981' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'A cor deve estar no formato hexadecimal #RRGGBB.' })
  color?: string;
}

// -----------------------------------------------------------------------------
// SAÍDA: categoria completa (o que a API devolve)
// -----------------------------------------------------------------------------
export class CategoryDto {
  @ApiProperty({ description: 'Identificador único da categoria', example: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  id!: string;

  @ApiProperty({ description: 'Nome da categoria', example: 'Trabalho' })
  name!: string;

  @ApiProperty({ description: 'Cor da categoria (#RRGGBB)', example: '#3B82F6' })
  color!: string;

  @ApiProperty({ description: 'Identificador do usuário proprietário', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  ownerId!: string;

  // Quantidade de tarefas ATIVAS (não removidas) que usam esta categoria.
  @ApiProperty({ description: 'Quantidade de tarefas ativas nesta categoria', example: 3 })
  taskCount!: number;

  @ApiProperty({ description: 'Data de criação' })
  createdAt!: string;

  @ApiProperty({ description: 'Data de última atualização' })
  updatedAt!: string;
}

// -----------------------------------------------------------------------------
// SAÍDA: lista paginada (mesmo formato { data, meta } usado em tasks)
// -----------------------------------------------------------------------------
export class PaginatedCategoriesResponseDto {
  @ApiProperty({ description: 'Lista de categorias paginadas', type: [CategoryDto] })
  data!: CategoryDto[];

  @ApiProperty({ description: 'Metadados de paginação', type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

// -----------------------------------------------------------------------------
// QUERY: GET /categories?page=1&pageSize=20&search=trab
// Herda page, pageSize e search de PaginationQueryDto (padrão do template).
// -----------------------------------------------------------------------------
export class ListCategoriesQueryDto extends PaginationQueryDto {}
