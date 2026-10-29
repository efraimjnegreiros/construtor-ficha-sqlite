import { describe, expect, it } from 'vitest';
import { MockFormAccessService } from './form-access.service';
import { FormPermission, FormRole } from './form-access.types';

describe('MockFormAccessService', () => {
  const service = new MockFormAccessService();
  const admin = { id: 'a', role: 'ADMIN' };
  const user = { id: 'u', role: 'USER' };

  it('maps system ADMIN to Configurador + Supervisão', async () => {
    expect(await service.getRoles(admin)).toEqual([FormRole.CONFIGURADOR, FormRole.SUPERVISAO]);
  });

  it('maps system USER to Preenchimento', async () => {
    expect(await service.getRoles(user)).toEqual([FormRole.PREENCHIMENTO]);
  });

  it('gives Configurador (via ADMIN) full template management plus read-all via Supervisão', async () => {
    const permissions = await service.getPermissions(admin);
    expect(permissions).toEqual(
      expect.arrayContaining([
        FormPermission.TEMPLATE_CREATE,
        FormPermission.TEMPLATE_UPDATE,
        FormPermission.TEMPLATE_DELETE,
        FormPermission.TEMPLATE_READ_OWN,
        FormPermission.TEMPLATE_READ_ALL,
      ]),
    );
    expect(new Set(permissions).size).toBe(permissions.length); // sem duplicatas
  });

  it('does not let Preenchimento manage or read templates', async () => {
    for (const permission of [
      FormPermission.TEMPLATE_CREATE,
      FormPermission.TEMPLATE_UPDATE,
      FormPermission.TEMPLATE_DELETE,
      FormPermission.TEMPLATE_READ_OWN,
      FormPermission.TEMPLATE_READ_ALL,
    ]) {
      expect(await service.can(user, permission)).toBe(false);
    }
    expect(await service.can(user, FormPermission.PRONTUARIO_READ)).toBe(true);
  });

  it('hasAny is true when at least one permission matches', async () => {
    expect(
      await service.hasAny(user, [FormPermission.TEMPLATE_CREATE, FormPermission.PRONTUARIO_READ]),
    ).toBe(true);
    expect(await service.hasAny(user, [FormPermission.TEMPLATE_CREATE])).toBe(false);
  });
});
