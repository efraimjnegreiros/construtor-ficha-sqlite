// =============================================================================
// useFormAccess — perfis e permissões do Construtor de Fichas para o usuário atual
// -----------------------------------------------------------------------------
// Lê GET /api/v1/form-access/me. É só para decidir o que EXIBIR (botões, avisos);
// a autorização real é sempre feita pela API (403 se tentar sem permissão).
// =============================================================================
import { useQuery } from '@tanstack/react-query';
import { formAccessControllerMe } from '../lib/api-client';
import type { FormAccessProfileDto, FormPermission } from '../lib/api-client/models';

export function useFormAccess() {
  const query = useQuery({
    queryKey: ['form-access', 'me'],
    queryFn: async (): Promise<FormAccessProfileDto> => {
      const res = await formAccessControllerMe();
      return res.data as FormAccessProfileDto;
    },
    staleTime: 60_000,
  });

  const profile = query.data ?? null;
  const permissions = profile?.permissions ?? [];

  return {
    profile,
    roles: profile?.roles ?? [],
    isMock: profile?.mock ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    can: (permission: FormPermission) => permissions.includes(permission),
    canRead: permissions.includes('TEMPLATE_READ_OWN') || permissions.includes('TEMPLATE_READ_ALL'),
  };
}
