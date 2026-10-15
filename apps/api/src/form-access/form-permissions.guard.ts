import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FormAccessService } from './form-access.service';
import { FORM_PERMISSIONS_KEY } from './form-permissions.decorator';
import type { FormPermission } from './form-access.types';

/**
 * Aplicado com @UseGuards nos controllers do construtor. Roda depois do
 * SessionAuthGuard global, que já preencheu `request.auth`.
 */
@Injectable()
export class FormPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: FormAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<FormPermission[]>(FORM_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest().auth?.user;
    if (!user) throw new UnauthorizedException('Autenticação necessária.');

    if (!(await this.access.hasAny(user, required))) {
      throw new ForbiddenException('Seu perfil não possui permissão para esta operação.');
    }
    return true;
  }
}
