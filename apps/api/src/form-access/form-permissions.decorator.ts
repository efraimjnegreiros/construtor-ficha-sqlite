import { SetMetadata } from '@nestjs/common';
import type { FormPermission } from './form-access.types';

export const FORM_PERMISSIONS_KEY = 'clinica:form-permissions';

/** Exige que o usuário tenha PELO MENOS UMA das permissões informadas. */
export const RequireFormPermissions = (...permissions: FormPermission[]) =>
  SetMetadata(FORM_PERMISSIONS_KEY, permissions);
