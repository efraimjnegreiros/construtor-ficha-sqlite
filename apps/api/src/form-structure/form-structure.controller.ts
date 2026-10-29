import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  CreateFormFieldDto,
  CreateFormGroupDto,
  CreateFormSectionDto,
  FormStructureDto,
  ReorderDto,
  ReorderFieldsDto,
  UpdateFormFieldDto,
  UpdateFormGroupDto,
  UpdateFormSectionDto,
} from './form-structure.dto';
import { FormStructureService } from './form-structure.service';

// Respostas comuns às rotas de escrita (toda mutação devolve a árvore completa).
const WriteResponses = () => (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
  ApiResponse({ status: 200, type: FormStructureDto })(target, key, descriptor);
  ApiResponse({ status: 400, description: 'Dados ou regra de campo inválidos', type: ProblemDetailsDto })(target, key, descriptor);
  ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })(target, key, descriptor);
  ApiResponse({ status: 403, description: 'Sem permissão ou não é o dono', type: ProblemDetailsDto })(target, key, descriptor);
  ApiResponse({ status: 404, description: 'Modelo, seção, grupo ou campo não encontrado', type: ProblemDetailsDto })(target, key, descriptor);
  ApiResponse({
    status: 409,
    description: 'Modelo fora de Rascunho, chave duplicada ou campo em uso por outro',
    type: ProblemDetailsDto,
  })(target, key, descriptor);
  ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })(target, key, descriptor);
};

// Ordem dos guards importa: permissão primeiro, subordinação ao prontuário depois.
@ApiTags('form-structure')
@ApiBearerAuth()
@UseGuards(FormPermissionsGuard, ProntuarioSubordinationGuard)
@Controller('form-templates/:templateId')
export class FormStructureController {
  constructor(private readonly structure: FormStructureService) {}

  @Get('structure')
  @RequireFormPermissions(FormPermission.TEMPLATE_READ_OWN, FormPermission.TEMPLATE_READ_ALL)
  @ApiOperation({ summary: 'Estrutura da ficha (seções, grupos e campos)' })
  @ApiResponse({ status: 200, type: FormStructureDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Modelo não encontrado', type: ProblemDetailsDto })
  getStructure(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<FormStructureDto> {
    return this.structure.getStructure(user, templateId);
  }

  // ------------------------------------------------------------------ seções
  @Post('sections')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Adicionar seção' })
  @WriteResponses()
  createSection(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: CreateFormSectionDto,
  ): Promise<FormStructureDto> {
    return this.structure.createSection(user, templateId, dto);
  }

  @Put('sections/reorder')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Reordenar seções' })
  @WriteResponses()
  reorderSections(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: ReorderDto,
  ): Promise<FormStructureDto> {
    return this.structure.reorderSections(user, templateId, dto);
  }

  @Put('sections/:sectionId')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Renomear/descrever seção' })
  @WriteResponses()
  updateSection(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: UpdateFormSectionDto,
  ): Promise<FormStructureDto> {
    return this.structure.updateSection(user, templateId, sectionId, dto);
  }

  @Delete('sections/:sectionId')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Excluir seção (com grupos e campos)' })
  @WriteResponses()
  removeSection(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ): Promise<FormStructureDto> {
    return this.structure.removeSection(user, templateId, sectionId);
  }

  // ------------------------------------------------------------------ grupos
  @Post('sections/:sectionId/groups')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Adicionar grupo (subseção) a uma seção' })
  @WriteResponses()
  createGroup(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: CreateFormGroupDto,
  ): Promise<FormStructureDto> {
    return this.structure.createGroup(user, templateId, sectionId, dto);
  }

  @Put('sections/:sectionId/groups/reorder')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Reordenar grupos de uma seção' })
  @WriteResponses()
  reorderGroups(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: ReorderDto,
  ): Promise<FormStructureDto> {
    return this.structure.reorderGroups(user, templateId, sectionId, dto);
  }

  @Put('groups/:groupId')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Editar grupo' })
  @WriteResponses()
  updateGroup(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateFormGroupDto,
  ): Promise<FormStructureDto> {
    return this.structure.updateGroup(user, templateId, groupId, dto);
  }

  @Delete('groups/:groupId')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Excluir grupo (com campos)' })
  @WriteResponses()
  removeGroup(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<FormStructureDto> {
    return this.structure.removeGroup(user, templateId, groupId);
  }

  // ------------------------------------------------------------------ campos
  @Post('fields')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({
    summary: 'Adicionar campo',
    description: 'Valida tipo, opções, obrigatoriedade, condições e cálculo automático.',
  })
  @WriteResponses()
  createField(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: CreateFormFieldDto,
  ): Promise<FormStructureDto> {
    return this.structure.createField(user, templateId, dto);
  }

  @Put('fields/reorder')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Reordenar campos de uma seção/grupo' })
  @WriteResponses()
  reorderFields(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: ReorderFieldsDto,
  ): Promise<FormStructureDto> {
    return this.structure.reorderFields(user, templateId, dto);
  }

  @Put('fields/:fieldId')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Configurar campo (rótulo, obrigatoriedade, regras, cálculo, posição)' })
  @WriteResponses()
  updateField(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: UpdateFormFieldDto,
  ): Promise<FormStructureDto> {
    return this.structure.updateField(user, templateId, fieldId, dto);
  }

  @Delete('fields/:fieldId')
  @RequireFormPermissions(FormPermission.TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Excluir campo' })
  @WriteResponses()
  removeField(
    @CurrentUser() user: SafeUserProfile,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
  ): Promise<FormStructureDto> {
    return this.structure.removeField(user, templateId, fieldId);
  }
}
