import { Injectable } from '@nestjs/common';
import {
  FormPermission,
  FormRole,
  ROLE_PERMISSIONS,
  type FormAccessSubject,
} from './form-access.types';

/**
 * Porta de acesso do Construtor. Também é o token de injeção.
 *
 * Para trocar o mock pela implementação real (perfis persistidos, ou
 * resolvidos pelo Prontuário), basta fornecer outra subclasse em
 * FormAccessModule — nenhum consumidor muda.
 */
export abstract class FormAccessService {
  abstract getRoles(user: FormAccessSubject): Promise<FormRole[]>;

  async getPermissions(user: FormAccessSubject): Promise<FormPermission[]> {
    const roles = await this.getRoles(user);
    return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
  }

  async hasAny(user: FormAccessSubject, permissions: readonly FormPermission[]): Promise<boolean> {
    const granted = await this.getPermissions(user);
    return permissions.some((permission) => granted.includes(permission));
  }

  can(user: FormAccessSubject, permission: FormPermission): Promise<boolean> {
    return this.hasAny(user, [permission]);
  }
}

/**
 * MOCK: deriva os perfis do `UserRole` do template.
 *   ADMIN -> CONFIGURADOR + SUPERVISAO
 *   USER  -> PREENCHIMENTO
 * Não há persistência de perfis nem tela de atribuição nesta etapa.
 */
@Injectable()
export class MockFormAccessService extends FormAccessService {
  async getRoles(user: FormAccessSubject): Promise<FormRole[]> {
    return user.role === 'ADMIN'
      ? [FormRole.CONFIGURADOR, FormRole.SUPERVISAO]
      : [FormRole.PREENCHIMENTO];
  }
}
