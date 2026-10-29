// =============================================================================
// Perfis e permissões do Construtor de Fichas (RBAC granular)
// -----------------------------------------------------------------------------
// ATENÇÃO: este é um MOCK de primeira fase. Os perfis abaixo são independentes
// do enum `UserRole` (USER | ADMIN) do template; a atribuição real de perfis
// por usuário ainda não existe (ver MockFormAccessService).
//
// Os valores são objetos `as const` (e não enums do Prisma) para que este
// módulo não dependa do client gerado e seja trivial de testar.
// =============================================================================

export const FormRole = {
  /** Cria e mantém os modelos de ficha. */
  CONFIGURADOR: 'CONFIGURADOR',
  /** Preenche fichas a partir de modelos (fluxo ainda não implementado). */
  PREENCHIMENTO: 'PREENCHIMENTO',
  /** Acompanha todos os modelos e governa o ciclo de vida (aprovar, publicar, suspender). */
  SUPERVISAO: 'SUPERVISAO',
} as const;
export type FormRole = (typeof FormRole)[keyof typeof FormRole];

export const FormPermission = {
  TEMPLATE_CREATE: 'TEMPLATE_CREATE',
  TEMPLATE_READ_OWN: 'TEMPLATE_READ_OWN',
  TEMPLATE_READ_ALL: 'TEMPLATE_READ_ALL',
  TEMPLATE_UPDATE: 'TEMPLATE_UPDATE',
  TEMPLATE_DELETE: 'TEMPLATE_DELETE',
  /** Aprovar, devolver, publicar, suspender e reativar modelos (perfil Supervisor). */
  TEMPLATE_REVIEW: 'TEMPLATE_REVIEW',
  PRONTUARIO_READ: 'PRONTUARIO_READ',
} as const;
export type FormPermission = (typeof FormPermission)[keyof typeof FormPermission];

export const ROLE_PERMISSIONS: Readonly<Record<FormRole, readonly FormPermission[]>> = {
  [FormRole.CONFIGURADOR]: [
    FormPermission.TEMPLATE_CREATE,
    FormPermission.TEMPLATE_READ_OWN,
    FormPermission.TEMPLATE_UPDATE,
    FormPermission.TEMPLATE_DELETE,
    FormPermission.PRONTUARIO_READ,
  ],
  // Ainda sem permissões sobre modelos: não existe conceito de "modelo
  // publicado", então expor rascunhos a quem preenche seria incorreto.
  // Ganhará leitura de modelos publicados na etapa de preenchimento.
  [FormRole.PREENCHIMENTO]: [FormPermission.PRONTUARIO_READ],
  // Regra do protótipo: "Aprovar, publicar e suspender exigem o perfil de Supervisor".
  [FormRole.SUPERVISAO]: [
    FormPermission.TEMPLATE_READ_ALL,
    FormPermission.TEMPLATE_REVIEW,
    FormPermission.PRONTUARIO_READ,
  ],
};

/** Mínimo necessário do usuário autenticado para decidir acesso. */
export interface FormAccessSubject {
  id: string;
  role: string;
}
