import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ProntuarioGateway } from './prontuario.gateway';

/**
 * Materializa a regra de ouro (ver prontuario.gateway.ts): rotas do construtor
 * só funcionam enquanto o prontuário está disponível. Use com @UseGuards DEPOIS
 * dos guards de autenticação/permissão, para não revelar o estado do prontuário
 * a quem não tem acesso.
 */
@Injectable()
export class ProntuarioSubordinationGuard implements CanActivate {
  constructor(private readonly prontuario: ProntuarioGateway) {}

  async canActivate(): Promise<boolean> {
    let available = false;
    try {
      available = (await this.prontuario.getStatus()).available;
    } catch {
      available = false;
    }
    if (!available) {
      throw new ServiceUnavailableException(
        'O prontuário está indisponível; o construtor de fichas não pode operar sem ele.',
      );
    }
    return true;
  }
}
