import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { MockFormAccessService } from './form-access.service';
import { FormPermission } from './form-access.types';
import { RequireFormPermissions } from './form-permissions.decorator';
import { FormPermissionsGuard } from './form-permissions.guard';

class Fixture {
  @RequireFormPermissions(FormPermission.TEMPLATE_CREATE)
  create() {}

  @RequireFormPermissions(FormPermission.TEMPLATE_READ_OWN, FormPermission.TEMPLATE_READ_ALL)
  read() {}

  unprotected() {}
}

function contextFor(handler: () => void, auth: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => Fixture,
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as unknown as ExecutionContext;
}

describe('FormPermissionsGuard', () => {
  const guard = new FormPermissionsGuard(new Reflector(), new MockFormAccessService());
  const admin = { user: { id: 'a', role: 'ADMIN' } };
  const user = { user: { id: 'u', role: 'USER' } };
  const fixture = new Fixture();

  it('allows routes without declared permissions', async () => {
    expect(await guard.canActivate(contextFor(fixture.unprotected, undefined))).toBe(true);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await expect(guard.canActivate(contextFor(fixture.create, undefined))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a profile without the permission with 403', async () => {
    await expect(guard.canActivate(contextFor(fixture.create, user))).rejects.toThrow(ForbiddenException);
  });

  it('allows a profile that has the permission', async () => {
    expect(await guard.canActivate(contextFor(fixture.create, admin))).toBe(true);
  });

  it('treats multiple permissions as any-of', async () => {
    expect(await guard.canActivate(contextFor(fixture.read, admin))).toBe(true);
    await expect(guard.canActivate(contextFor(fixture.read, user))).rejects.toThrow(ForbiddenException);
  });
});
