# Clinica

Aplicação derivada de clinica baseada no template AppStart.

Projeto gerado a partir do template AppStart.

## Requisitos

- Node.js >= 20.19 (com `npm`; **não** é necessário pnpm)
- Nada de servidor de banco: os dados ficam num arquivo **SQLite** (**não** é necessário Docker)

## Construtor de Fichas como microfrontend do shell

Este projeto roda como o **microfrontend remoto `recordsMfe`** do shell
**Clínica Digital UFPE** (repositório `clinicadigitalufpe_shell`), continuando
**sem Docker e sem PostgreSQL**: tudo sobe com `npm` e os dados ficam num arquivo SQLite.

| Peça | Endereço | Papel |
|---|---|---|
| Shell (host) | http://localhost:5173 | Login, menu, cabeçalho; carrega o MFE em `/records/*` |
| API do shell | http://localhost:3000 | Sessão do usuário (cookie `appstart_session`) |
| **Este MFE (web)** | http://localhost:5178 | Expõe `./App` em `/remoteEntry.js` |
| **API deste MFE** | http://localhost:3008 | NestJS + Prisma + SQLite (`apps/api/prisma/dev.db`) |

O `vite.config.ts` do shell **já** declara `recordsMfe` em `http://localhost:5178/remoteEntry.js`
e o proxy `/api/v1/records → :5178`; por isso **nada precisa mudar no shell**: basta subir
este projeto e abrir o item **Prontuário** do menu.

Fluxo de uma chamada de API dentro do shell:

```
navegador → :5173/api/v1/records/form-templates      (shell: proxy remove "/records")
          → :5178/api/v1/form-templates               (vite deste MFE: proxy /api)
          → :3008/api/v1/form-templates               (API NestJS + SQLite)
          → :3000/api/v1/auth/me                      (valida o cookie no shell; cache curto)
```

### Como rodar

```bash
# 1) Shell (no repositório do shell), como de costume: API em :3000 e web em :5173.

# 2) Este projeto
cp .env.example .env      # no Windows (cmd): copy .env.example .env
npm install
npm run setup             # cria o SQLite, aplica migrations e seed
npm run dev               # API em :3008 e MFE em :5178
```

Abra http://localhost:5173, faça login no shell e clique em **Prontuário**
(rotas `/records/form-templates` e `/records/form-templates/:id/builder`).

### Autenticação (`AUTH_MODE=shell`)

- O login e a sessão são do shell. A API deste MFE lê o cookie `appstart_session`
  (por isso `SESSION_COOKIE_NAME` deve ser igual ao do shell) e pergunta ao shell quem é o
  dono dele em `SHELL_API_URL/api/v1/auth/me` (`ShellSessionService`).
- Só esse cookie é repassado ao shell; o token nunca é gravado nem logado (cache pelo hash
  SHA-256, por `SHELL_SESSION_CACHE_SECONDS`).
- O usuário do shell é **espelhado** em `user_profiles` (chave `shell:<id>`), porque os
  modelos de ficha precisam de um dono local; nome, e-mail e papel (ADMIN/USER) são
  atualizados a cada validação. Shell fora do ar → 503 (não desloga ninguém).
- Rotas de login/logout desta API respondem 409 nesse modo: login e logout são feitos no shell.
- CORS/CSRF aceitam a origem do próprio MFE e a do shell (`SHELL_WEB_URL`).

### Rodar sozinho (sem o shell)

Ainda dá para abrir http://localhost:5178 direto, com layout e login próprios: no `.env`,
use `AUTH_MODE=dev` e troque `SESSION_COOKIE_NAME` para outro nome (ex.: `clinica_session`).
Cookies valem por host e não por porta: com o mesmo nome em `localhost`, o login local
derrubaria a sessão do shell.

### Arquivos do microfrontend

| Arquivo | O que faz |
|---|---|
| `apps/web/vite.config.ts` | Module Federation (`@module-federation/vite`): nome `recordsMfe`, expõe `./App`, compartilha `react`/`react-dom` como singleton, porta 5178, CORS liberado para o shell |
| `apps/web/src/remote/remote-app.tsx` | Componente exposto (`export function App` + `default`): só as telas do Construtor, com `BrowserRouter basename="/records"` e QueryClient próprio |
| `apps/web/src/remote/mfe-config.ts` | Rota base (`VITE_MFE_BASENAME`) e prefixo de API (`VITE_MFE_API_BASE`) |
| `apps/web/src/lib/api-client/custom-fetch.ts` | `setApiBasePath`: dentro do shell, `/api/v1/...` vira `/api/v1/records/...` |
| `apps/api/src/auth/shell-session.service.ts` | Valida a sessão no shell e espelha o usuário |
| `apps/api/src/config/auth.config.ts` | `AUTH_MODE=shell`, `SHELL_API_URL`, `SHELL_WEB_URL`, `SHELL_SESSION_CACHE_SECONDS` |

### Produção

`npm run build --workspace apps/web` gera `apps/web/dist` com `remoteEntry.js` e
`mf-manifest.json`. Publique essa pasta numa URL (defina `WEB_BASE_URL` antes do build) e,
no shell, aponte `recordsMfe.entry` para `<WEB_BASE_URL>/remoteEntry.js`. O proxy de
`/api/v1/records` para a API deste MFE passa a ser do servidor/reverse proxy do shell.
Em produção, `SHELL_API_URL` e `SHELL_WEB_URL` precisam ser HTTPS.

## Modos de autenticação e banco

```bash
cp .env.example .env      # no Windows (cmd): copy .env.example .env
npm install
npm run setup             # prepara o SQLite, aplica migrations e seed
npm run dev
```

O banco é definido por `DATABASE_URL=file:./dev.db`; caminhos relativos são resolvidos a
partir de `apps/api/prisma/` (arquivo final: `apps/api/prisma/dev.db`, ignorado pelo Git).

O `.env.example` vem com `AUTH_MODE=shell` (microfrontend, acima) e `USE_DOCKER=false`. Outros modos:

- `AUTH_MODE=dev`: login local de desenvolvimento, sem Keycloak. Entre com e-mail e
  senha de `DEV_ADMIN_*` (administrador) ou `DEV_USER_*` (usuário comum). É recusado
  quando `NODE_ENV=production`. A tela "Continuar com Keycloak" e a administração de
  usuários (que usa o Keycloak) não funcionam nesse modo.
- `USE_DOCKER=true`: sobe o Keycloak via `docker compose` (o banco da aplicação continua
  sendo o arquivo SQLite; use junto com `AUTH_MODE=keycloak` para o Keycloak real).
- `AUTH_MODE=keycloak` com `USE_DOCKER=false`: usa um Keycloak já existente em `KEYCLOAK_BASE_URL`.

## Rodando no GitHub Codespaces

O Codespaces expõe cada serviço em uma URL pública diferente de `localhost`.
Após abrir o projeto no Codespaces, execute:

```bash
bash scripts/codespaces-setup.sh
```

O script detecta automaticamente o `CODESPACE_NAME` e atualiza as variáveis
`API_BASE_URL`, `WEB_BASE_URL` e `KEYCLOAK_BASE_URL` no `.env` com as URLs
públicas corretas. Em seguida, torne as portas públicas no painel de **Portas**
do Codespaces e reinicie com `npm run dev`.

## Scripts principais

- `npm run setup`: prepara o SQLite (e o Keycloak em Docker, se aplicável), aplica migrations e executa o seed
- `npm run dev`: inicia API e frontend em paralelo
- `npm run db:up`: garante a pasta do arquivo SQLite (o arquivo é criado pelas migrations)
- `npm run db:down`: sem efeito (SQLite não tem servidor); para zerar, apague o arquivo `.db` e rode `npm run db:migrate`
- `npm run auth:up`: sobe o Keycloak em Docker (só com `AUTH_MODE=keycloak` e `USE_DOCKER=true`)
- `npm run auth:down`: para o Keycloak sem remover dados
- `npm run db:migrate`: aplica migrations Prisma no ambiente local
- `npm run db:check`: valida schema e migrations com um SQLite temporário
- `npm run db:deploy`: aplica migrations em produção com prisma migrate deploy
- `npm run db:seed`: executa o seed de desenvolvimento
- `npm run db:studio`: abre o Prisma Studio

## Configuração inicial

Revise o arquivo `.env` gerado automaticamente antes de compartilhar o projeto.

## Usuários de desenvolvimento

As credenciais são definidas pelas variáveis `DEV_ADMIN_*` e `DEV_USER_*` no `.env`.
