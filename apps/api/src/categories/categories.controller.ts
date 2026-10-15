// =============================================================================
// CategoriesController — rotas REST de categorias (/api/v1/categories)
// -----------------------------------------------------------------------------
// Mesmo padrão do TasksController:
//   - @ApiTags / @ApiOperation / @ApiResponse -> documentação Swagger/OpenAPI
//   - @CurrentUser() -> usuário logado (injetado pelo SessionAuthGuard global)
//   - O controller NÃO tem regra de negócio: só repassa para o service.
// Os nomes dos métodos (create, findAll, findById, update, remove) viram os
// nomes das funções geradas pelo Orval no frontend:
//   categoriesControllerCreate, categoriesControllerFindAll, ...
// =============================================================================
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../access/access.decorators';
import type { SafeUserProfile } from '../auth/auth.types';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto';
import {
  CategoryDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  PaginatedCategoriesResponseDto,
  UpdateCategoryDto,
} from './category.dto';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar nova categoria',
    description: 'Cria uma categoria de tarefas associada ao usuário autenticado.',
  })
  @ApiResponse({ status: 201, description: 'Categoria criada com sucesso', type: CategoryDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos', type: ProblemDetailsDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'Já existe categoria com este nome', type: ProblemDetailsDto })
  async create(
    @CurrentUser() user: SafeUserProfile,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar categorias paginadas',
    description: 'Lista categorias com paginação e busca por nome.',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de categorias', type: PaginatedCategoriesResponseDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  async findAll(
    @CurrentUser() user: SafeUserProfile,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<PaginatedCategoriesResponseDto> {
    return this.categoriesService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter detalhes de uma categoria',
    description: 'Retorna uma categoria do usuário (ou qualquer categoria para ADMIN).',
  })
  @ApiResponse({ status: 200, description: 'Dados da categoria', type: CategoryDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada', type: ProblemDetailsDto })
  async findById(
    @CurrentUser() user: SafeUserProfile,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryDto> {
    return this.categoriesService.findById(user, id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Atualizar categoria',
    description: 'Atualiza nome e/ou cor de uma categoria respeitando ownership.',
  })
  @ApiResponse({ status: 200, description: 'Categoria atualizada com sucesso', type: CategoryDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos', type: ProblemDetailsDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'Já existe categoria com este nome', type: ProblemDetailsDto })
  async update(
    @CurrentUser() user: SafeUserProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categoriesService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir categoria (remoção lógica)',
    description: 'Remove logicamente a categoria. As tarefas vinculadas ficam sem categoria.',
  })
  @ApiResponse({ status: 204, description: 'Categoria excluída com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada', type: ProblemDetailsDto })
  async remove(
    @CurrentUser() user: SafeUserProfile,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.categoriesService.remove(user, id);
  }
}
