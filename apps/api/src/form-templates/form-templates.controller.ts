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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/access.decorators';
import type { SafeUserProfile } from '../auth/auth.types';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto';
import { FormPermission } from '../form-access/form-access.types';
import { RequireFormPermissions } from '../form-access/form-permissions.decorator';
import { FormPermissionsGuard } from '../form-access/form-permissions.guard';
import { ProntuarioSubordinationGuard } from '../prontuario/prontuario-subordination.guard';
import {
  CreateFormTemplateDto,
  DeriveFormTemplateDto,
  FormTemplateDetailDto,
  FormTemplateDto,
  FormTemplateTransitionDto,
  ListFormTemplatesQueryDto,
  PaginatedFormTemplatesResponseDto,
  UpdateFormTemplateDto,
} from './form-template.dto';
import { FormTemplatesService } from './form-templates.service';

// Ordem dos guards importa: permissão primeiro, subordinação ao prontuário depois.
@ApiTags('form-templates')
@ApiBearerAuth()
@UseGuards(FormPermissionsGuard, ProntuarioSubordinationGuard)
@Controller('form-templates')
export class FormTemplatesController {
  constructor(private readonly templates: FormTemplatesService) {}

  @Post()
  @RequireFormPermissions(FormPermission.TEMPLATE_CREATE)
  @ApiOperation({
    summary: 'Cadastrar modelo de ficha',
    description: 'Cadastra a ficha (código FC-xxxx gerado, área, SIGTAP, responsável...) em RASCUNHO; o criador vira o dono.',
  })
  @ApiResponse({ status: 201, type: FormTemplateDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos', type: ProblemDetailsDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Perfil sem permissão', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'Já existe modelo com este nome', type: ProblemDetailsDto })
  @ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })
  create(@CurrentUser() user: SafeUserProfile, @Body() dto: CreateFormTemplateDto): Promise<FormTemplateDto> {
    return this.templates.create(user, dto);
  }

  @Get()
  @RequireFormPermissions(FormPermission.TEMPLATE_READ_OWN, FormPermission.TEMPLATE_READ_ALL)
  @ApiOperation({
    summary: 'Listar modelos de ficha',
    description: 'Configurador vê os seus; Supervisão vê todos. Filtros: busca (nome/código), status, área, SIGTAP e responsável.',
  })
  @ApiResponse({ status: 200, type: PaginatedFormTemplatesResponseDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Perfil sem permissão', type: ProblemDetailsDto })
  @ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })
  findAll(
    @CurrentUser() user: SafeUserProfile,
    @Query() query: ListFormTemplatesQueryDto,
  ): Promise<PaginatedFormTemplatesResponseDto> {
    return this.templates.findAll(user, query);
  }

  @Get(':id')
  @RequireFormPermissions(FormPermission.TEMPLATE_READ_OWN, FormPermission.TEMPLATE_READ_ALL)
  @ApiOperation({ summary: 'Obter modelo de ficha', description: 'Inclui o histórico de versões.' })
  @ApiResponse({ status: 200, type: FormTemplateDetailDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Modelo não encontrado', type: ProblemDetailsDto })
  @ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })
  findById(@CurrentUser() user: SafeUserProfile, @Param('id', ParseUUIDPipe) id: string): Promise<FormTemplateDetailDto> {
    return this.templates.findById(user, id);
  }

  @Put(':id')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({
    summary: 'Atualizar cadastro do modelo',
    description: 'Somente em RASCUNHO. Cada edição incrementa o PATCH da versão e entra no histórico.',
  })
  @ApiResponse({ status: 200, type: FormTemplateDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos', type: ProblemDetailsDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Modelo não encontrado', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'Nome duplicado ou modelo fora de Rascunho', type: ProblemDetailsDto })
  @ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })
  update(
    @CurrentUser() user: SafeUserProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormTemplateDto,
  ): Promise<FormTemplateDto> {
    return this.templates.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireFormPermissions(FormPermission.TEMPLATE_DELETE)
  @ApiOperation({ summary: 'Excluir modelo (remoção lógica)', description: 'Somente em RASCUNHO; nos demais, use Inativar.' })
  @ApiResponse({ status: 204, description: 'Modelo excluído' })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Modelo não encontrado', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'Modelo fora de Rascunho', type: ProblemDetailsDto })
  @ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })
  remove(@CurrentUser() user: SafeUserProfile, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templates.remove(user, id);
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE, FormPermission.TEMPLATE_REVIEW)
  @ApiOperation({
    summary: 'Mudar status do modelo (ciclo de vida)',
    description:
      'ENVIAR_REVISAO (dono) · DEVOLVER, APROVAR, PUBLICAR, SUSPENDER, REATIVAR (Supervisor) · INATIVAR (dono ou Supervisor). ' +
      'Devolver, suspender e inativar exigem justificativa.',
  })
  @ApiResponse({ status: 200, type: FormTemplateDto })
  @ApiResponse({ status: 400, description: 'Ação inválida ou justificativa ausente', type: ProblemDetailsDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Perfil sem permissão para a ação', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Modelo não encontrado', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'Transição não permitida a partir do status atual', type: ProblemDetailsDto })
  @ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })
  transition(
    @CurrentUser() user: SafeUserProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FormTemplateTransitionDto,
  ): Promise<FormTemplateDto> {
    return this.templates.transition(user, id, dto);
  }

  @Post(':id/derive')
  @RequireFormPermissions(FormPermission.TEMPLATE_CREATE)
  @ApiOperation({
    summary: 'Derivar novo modelo a partir de um existente',
    description: 'Copia o cadastro do modelo de origem para um novo RASCUNHO (v1.0.0) com novo código.',
  })
  @ApiResponse({ status: 201, type: FormTemplateDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos', type: ProblemDetailsDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Modelo não encontrado', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'Já existe modelo com este nome', type: ProblemDetailsDto })
  @ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })
  derive(
    @CurrentUser() user: SafeUserProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeriveFormTemplateDto,
  ): Promise<FormTemplateDto> {
    return this.templates.derive(user, id, dto);
  }
}
