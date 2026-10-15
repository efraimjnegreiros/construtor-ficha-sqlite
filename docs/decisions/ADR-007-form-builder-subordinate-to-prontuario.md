# ADR-007: Construtor de Fichas subordinado ao Prontuário (com RBAC e integração mockados)

## Status
Aceito (primeira fase: RBAC e integração com o prontuário são **mocks**)

## Contexto
O Construtor de Fichas permite criar modelos de ficha clínica, mas o prontuário é a fonte de verdade de pacientes e atendimentos. É preciso evitar que o construtor vire um segundo cadastro de pacientes ou funcione "solto" do prontuário. Também precisamos de perfis específicos (Configurador, Preenchimento, Supervisão), sem ainda ter a fonte real desses perfis.

## Decisão
1. **Regra de ouro:** o construtor é subordinado ao prontuário.
   - O acesso ao prontuário é feito apenas pela porta `ProntuarioGateway` (classe abstrata + token de injeção). Hoje: `MockProntuarioGateway`.
   - Rotas do construtor usam `ProntuarioSubordinationGuard`: se o prontuário estiver indisponível (ou a checagem falhar), respondem `503`.
   - Dependência de mão única: o módulo do prontuário não importa o construtor.
   - APIs básicas de comunicação: `GET /prontuario/status` e `GET /prontuario/pacientes/:id`.
2. **RBAC granular, independente do `UserRole`:** perfis `CONFIGURADOR`, `PREENCHIMENTO`, `SUPERVISAO` mapeiam para permissões (`FormPermission`). Rotas declaram `@RequireFormPermissions(...)` (any-of) e são verificadas por `FormPermissionsGuard`. A fonte dos perfis é a porta `FormAccessService`; hoje `MockFormAccessService` deriva do `UserRole`.
3. **Ownership continua valendo (ADR-005):** a permissão diz *o que* o perfil pode fazer; o service diz *em quais registros* (dono, ou `ADMIN` do sistema para alterar; `TEMPLATE_READ_ALL` para ler todos).
4. **Cadastro base `FormTemplate`:** somente `name`, `description`, `ownerId` (criador), `deletedAt` e timestamps. Nome único por dono entre modelos ativos (checado no service, como em categorias).

## Consequências
### Positivas
- Trocar os mocks pela integração real não altera controllers nem services (só os providers nos módulos).
- A regra de ouro é verificável por teste (`prontuario-subordination.guard.spec.ts`).

### Negativas / Pendências
- Com o mock, usuários `USER` não conseguem criar modelos (apenas `ADMIN`, que vira Configurador + Supervisão). Não há tela/API para atribuir perfis.
- `PREENCHIMENTO` não lê modelos até existir o conceito de modelo publicado.
- Dados de paciente do mock são fictícios; a integração real precisará tratar autenticação entre sistemas e dados sensíveis (LGPD).
