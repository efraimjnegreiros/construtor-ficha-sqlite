import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto';
import { FormPermission } from '../form-access/form-access.types';
import { FormPermissionsGuard } from '../form-access/form-permissions.guard';
import { RequireFormPermissions } from '../form-access/form-permissions.decorator';
import { PacienteResumoDto, ProntuarioStatusDto } from './prontuario.dto';
import { ProntuarioGateway } from './prontuario.gateway';
import { ProntuarioSubordinationGuard } from './prontuario-subordination.guard';

// APIs básicas de comunicação com o prontuário (MOCK nesta fase).
@ApiTags('prontuario')
@ApiBearerAuth()
@Controller('prontuario')
export class ProntuarioController {
  constructor(private readonly prontuario: ProntuarioGateway) {}

  @Get('status')
  @ApiOperation({ summary: 'Estado da integração com o prontuário' })
  @ApiResponse({ status: 200, type: ProntuarioStatusDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  status(): Promise<ProntuarioStatusDto> {
    return this.prontuario.getStatus();
  }

  @Get('pacientes/:pacienteId')
  @UseGuards(FormPermissionsGuard, ProntuarioSubordinationGuard)
  @RequireFormPermissions(FormPermission.PRONTUARIO_READ)
  @ApiOperation({ summary: 'Resumo de um paciente no prontuário' })
  @ApiResponse({ status: 200, type: PacienteResumoDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'Acesso negado', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'Paciente não encontrado', type: ProblemDetailsDto })
  @ApiResponse({ status: 503, description: 'Prontuário indisponível', type: ProblemDetailsDto })
  async findPaciente(@Param('pacienteId') pacienteId: string): Promise<PacienteResumoDto> {
    const paciente = await this.prontuario.findPaciente(pacienteId);
    if (!paciente) throw new NotFoundException('Paciente não encontrado no prontuário.');
    return paciente;
  }
}
