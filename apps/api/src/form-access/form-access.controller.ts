import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/access.decorators';
import type { SafeUserProfile } from '../auth/auth.types';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto';
import { FormAccessProfileDto } from './form-access.dto';
import { FormAccessService, MockFormAccessService } from './form-access.service';

@ApiTags('form-access')
@ApiBearerAuth()
@Controller('form-access')
export class FormAccessController {
  constructor(private readonly access: FormAccessService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Perfis e permissões do construtor para o usuário atual',
    description: 'Útil para o frontend decidir o que exibir. A autorização real é sempre feita na API.',
  })
  @ApiResponse({ status: 200, type: FormAccessProfileDto })
  @ApiResponse({ status: 401, description: 'Não autenticado', type: ProblemDetailsDto })
  async me(@CurrentUser() user: SafeUserProfile): Promise<FormAccessProfileDto> {
    const [roles, permissions] = await Promise.all([
      this.access.getRoles(user),
      this.access.getPermissions(user),
    ]);
    return { roles, permissions, mock: this.access instanceof MockFormAccessService };
  }
}
